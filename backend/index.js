const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mqtt = require('mqtt');
const { Pool } = require('pg');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const app = express();

app.set('trust proxy', 1);

// Security & Optimization
app.use(helmet({
  contentSecurityPolicy: false, // Disable for easier Socket.io/API usage if needed
}));
app.use(compression());
app.use(cors());
app.use(express.json());

// ── OPTIMIZED RATE LIMITING ──────────────────────────────────────────────────
// Endpoint-specific limiters for better control and efficiency

// General API limiter: 500 requests per 15 minutes (more permissive)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for high-volume endpoints
    return req.path.startsWith('/api/sim/') || req.path.startsWith('/api/readings') || req.path === '/health';
  },
  message: 'General API rate limit exceeded. Please retry after 15 minutes.',
});

// Simulation limiter: VERY permissive (10,000 per 15 minutes) for staggered injections
// Handles 10 sensors × 2-second stagger = 10 requests/20s = 27,000 req/day, well within limit
const simLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Simulation rate limit exceeded. Please wait before sending more injections.',
});

// Readings endpoint limiter: 2000 requests per 15 minutes (readings are read-heavy)
const readingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Readings endpoint rate limit exceeded.',
});

// Health check: unlimited (lightweight)
const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: false,
  legacyHeaders: false,
  skip: () => true,  // Skip rate limiting for health checks
});

app.use('/api/', limiter);
app.use('/api/readings', readingsLimiter);
app.use('/health', healthLimiter);

const JWT_SECRET = process.env.JWT_SECRET || 'aqms_super_secret_key';

// Database connection
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        user: process.env.POSTGRES_USER || 'aqms_user',
        host: process.env.POSTGRES_HOST || 'timescale',
        database: process.env.POSTGRES_DB || 'aqms',
        password: process.env.POSTGRES_PASSWORD || 'secret',
        port: process.env.POSTGRES_PORT || 5432,
      }
);

const ensurePredictionsUniqueIndex = async () => {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'ux_predictions_time_device'
            AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX ux_predictions_time_device ON predictions (time, device_id);
        END IF;
      END$$;
    `);
    console.log('Ensured predictions unique index exists.');
  } catch (err) {
    console.error('Could not ensure predictions unique index:', err.message);
  }
};
ensurePredictionsUniqueIndex();

const EMBR_X_DEVICE_ID = 'denr_emb_x_reference_001';
const EMBR_X_API_URL = 'https://api.bpit-inc.com/embrx/l';
const EMBR_X_STATION_ID = 'Iligan City';
const EMBR_X_POLL_INTERVAL_MS = 5 * 60 * 1000; // poll every 5 minutes
let embrxPollTimer = null;

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseEmbrxTimestamp = (payload) => {
  if (payload && typeof payload.date === 'string') {
    const normalized = payload.date.trim().replace(' ', 'T');
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date();
};

const ensureEmbrxDeviceRecord = async () => {
  try {
    await pool.query(
      `INSERT INTO devices (device_id, name, lat, lng, status, region, calibration_coefficients)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (device_id) DO NOTHING`,
      [
        EMBR_X_DEVICE_ID,
        'DENR-EMB X Reference Grade Air Monitor',
        8.237232,
        124.252956,
        'active',
        'All',
        JSON.stringify({ pm2_5_slope: 1.0, pm2_5_intercept: 0.0 }),
      ]
    );
    console.log('[EMBRX] ✓ External device record ensured in devices table');
  } catch (err) {
    console.error('[EMBRX] ✗ Failed to ensure external device record:', err.message);
  }
};

const normalizeEmbrxStation = (stationArray) => {
  if (!Array.isArray(stationArray)) return null;
  const result = {};
  for (const entry of stationArray) {
    if (entry && typeof entry.key === 'string') {
      result[entry.key] = entry.value;
    }
  }
  return result;
};

const extractEmbrxReading = (payload) => {
  if (!Array.isArray(payload) || payload.length === 0) return null;

  const stationArray = payload.find((station) => {
    if (!Array.isArray(station)) return false;
    return station.some((entry) => entry.key === 'stationID' && entry.value === EMBR_X_STATION_ID);
  }) || payload[0];

  const raw = normalizeEmbrxStation(stationArray);
  if (!raw) return null;

  const pm2_5 = parseNumber(raw.pm25Concentration ?? raw.pm25 ?? raw.pm25Nowcast ?? raw.pm25AQI ?? raw.pm25AQI24hr);
  const pm25_aqi = parseNumber(raw.pm25AQI ?? raw.pm25AQI24hr ?? raw.pm25_aqi ?? raw.pm25_aqi24h);
  const temperature = parseNumber(raw.ambientTemperature ?? raw.ambient_temperature ?? raw.temperature);
  const humidity = parseNumber(raw.ambientHumidity ?? raw.ambient_humidity ?? raw.humidity);

  if (pm2_5 === null && pm25_aqi === null && temperature === null && humidity === null) {
    return null;
  }

  return {
    time: parseEmbrxTimestamp(raw),
    pm2_5,
    pm25_aqi,
    temperature,
    humidity,
  };
};

const processEmbrxPoll = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(EMBR_X_API_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn(`[EMBRX] ⚠ External API returned ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const reading = extractEmbrxReading(data);

    if (!reading || reading.pm2_5 === null || reading.temperature === null || reading.humidity === null) {
      console.warn('[EMBRX] ⚠ External API payload missing required fields', data);
      return;
    }

    const query = `
      INSERT INTO readings (
        time, device_id, pm2_5, pm2_5_cal, temperature, humidity
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const values = [
      reading.time,
      EMBR_X_DEVICE_ID,
      reading.pm2_5,
      reading.pm2_5,
      reading.temperature,
      reading.humidity,
    ];

    await pool.query(query, values);
    console.log('[EMBRX] ✓ External reading saved for', EMBR_X_DEVICE_ID);

    const cachedReading = {
      time: reading.time,
      device_id: EMBR_X_DEVICE_ID,
      pm2_5: reading.pm2_5,
      pm25_aqi: reading.pm25_aqi,
      pm2_5_cal: reading.pm2_5,
      temperature: reading.temperature,
      humidity: reading.humidity,
    };

    if (io.engine.clientsCount > 0) {
      io.emit('new_reading', cachedReading);
    }

    await Promise.all([
      redisClient.set(`device:latest:${EMBR_X_DEVICE_ID}`, JSON.stringify(cachedReading), { EX: 3600 }),
      redisClient.del('latest_readings:all'),
    ]).catch((err) => {
      console.error('[EMBRX] ✗ Redis cache update failed:', err.message);
    });
  } catch (err) {
    console.error('[EMBRX] ✗ Polling error:', err.message);
  } finally {
    clearTimeout(timeout);
  }
};

const startEmbrxPoller = () => {
  processEmbrxPoll();
  embrxPollTimer = setInterval(processEmbrxPoll, EMBR_X_POLL_INTERVAL_MS);
  console.log('[EMBRX] ✓ External EMBR API poller started (5m interval)');
};

const stopEmbrxPoller = () => {
  if (embrxPollTimer) {
    clearInterval(embrxPollTimer);
    console.log('[EMBRX] ✓ External EMBR API poller stopped');
  }
};

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().then(() => console.log('Connected to Redis')).catch(console.error);

// ── PREDICTION BATCH PROCESSOR ──────────────────────────────────────────────
// Instead of triggering predictions on every reading, batch them and process every 30 seconds
let predictionBatchTimer = null;
const processPredictionBatch = async () => {
  try {
    // Trigger batch prediction from ML service (GET method - ML service only exposes GET endpoints)
    const mlRes = await fetch('http://ml-service:8000/api/ml/predict/city', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (mlRes.ok) {
      const predictions = await mlRes.json();
      if (predictions && Array.isArray(predictions) && predictions.length > 0) {
        // Batch insert predictions with efficient conflict handling
        const predQuery = `
          INSERT INTO predictions (time, device_id, pm2_5_cal, temperature, humidity, created_at) 
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (time, device_id) 
          DO UPDATE SET 
            pm2_5_cal = EXCLUDED.pm2_5_cal, 
            temperature = EXCLUDED.temperature, 
            humidity = EXCLUDED.humidity, 
            created_at = NOW()
        `;
        
        // Batch process: use Promise.all for parallel inserts
        await Promise.all(
          predictions.map(p => 
            pool.query(predQuery, [p.time || new Date(), p.device_id || 'city', p.pm2_5_cal, p.temperature, p.humidity])
              .catch(err => console.error(`[PRED] Insert error for ${p.device_id}:`, err.message))
          )
        );
        
        // Broadcast to all connected clients
        if (io.engine.clientsCount > 0) {
          io.emit('prediction_update', predictions);
          console.log(`[PRED] ✓ Broadcasted ${predictions.length} predictions to ${io.engine.clientsCount} clients`);
        }
        
        // Cache predictions in Redis
        try {
          await redisClient.set('predictions:latest', JSON.stringify(predictions), { EX: 1800 });
          console.log('[PRED] ✓ Cached predictions in Redis (30m TTL)');
        } catch (cacheErr) {
          console.error('[PRED] ✗ Redis cache error:', cacheErr.message);
        }
      }
    } else {
      // Log detailed error info from ML service
      let errorDetail = `Status: ${mlRes.status}`;
      try {
        const errorBody = await mlRes.json();
        if (errorBody && errorBody.detail) {
          errorDetail += ` - ${errorBody.detail}`;
        }
      } catch (e) {
        // Response body not JSON, skip
      }
      console.warn(`[PRED] ⚠ ML service returned error: ${errorDetail}`);
    }
  } catch (mlErr) {
    console.error('[PRED] ✗ Batch prediction error:', mlErr.message);
  }
};

// Start batch prediction processor on server startup
const startPredictionBatchProcessor = () => {
  predictionBatchTimer = setInterval(processPredictionBatch, 30000);  // Every 30 seconds
  console.log('[PRED] ✓ Batch prediction processor started (30s interval)');
};

const stopPredictionBatchProcessor = () => {
  if (predictionBatchTimer) {
    clearInterval(predictionBatchTimer);
    console.log('[PRED] ✓ Batch prediction processor stopped');
  }
};

// MQTT connection with buffer and reliability settings
const mqttClient = mqtt.connect(process.env.MQTT_URL || 'mqtt://mosquitto:1883', {
  username: process.env.MQTT_USERNAME || 'mydevice',
  password: process.env.MQTT_PASSWORD || 'mypassword',
  clientId: 'aqms_backend_' + Math.random().toString(16).slice(2, 8),
  // Buffer/reliability settings
  reconnectPeriod: 1000,        // Reconnect every 1 second
  connectTimeout: 30 * 1000,    // 30 second timeout for connection
  keepalive: 60,                // Send keep-alive every 60 seconds
  clean: false,                 // Resume session if available
  will: {
    topic: 'aqms/backend/status',
    payload: JSON.stringify({ status: 'offline', timestamp: new Date() }),
    qos: 1,
    retain: true
  }
});

// --- Middleware & Routes ---
// (Server start moved to bottom)
const io = new Server();
// Temporary runtime flag to pause simulator injects.
// Default to false for production; set to true to stop simulator traffic while debugging.
let simPaused = false;

// Endpoint to view and toggle simulator pause state (useful for debugging)
app.get('/api/sim/paused', simLimiter, (req, res) => {
  res.json({ paused: !!simPaused });
});

app.post('/api/sim/pause', simLimiter, (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body.pause === 'boolean') {
      simPaused = body.pause;
      return res.json({ paused: simPaused });
    }
    // toggle if no explicit value provided
    simPaused = !simPaused;
    res.json({ paused: simPaused });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
function initServer(server) {
  io.attach(server, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"]
    },
    path: '/socket.io',
    // Increase heartbeat intervals to tolerate transient network hiccups
    pingInterval: 30000,
    pingTimeout: 120000,
    // Max reconnection attempts on server side
    maxHttpBufferSize: 1e6, // 1 MB
    // Compression
    transports: ['websocket', 'polling'],
  });
}

io.on('connection', (socket) => {
  console.log('[SOCKET] Client connected:', socket.id, 'transport:', socket.conn.transport.name, 'from:', socket.handshake.address);
  console.log('[SOCKET] User-Agent:', socket.handshake.headers && socket.handshake.headers['user-agent']);

  socket.on('disconnect', (reason) => {
    const reasonDesc = {
      'client namespace disconnect': 'Client intentionally disconnected',
      'server namespace disconnect': 'Server disconnected client',
      'server shutting down': 'Server is shutting down',
      'ping timeout': 'No ping response (client may be offline)',
      'transport close': 'Network connection lost',
      'transport error': 'Network transport error occurred',
    };
    const desc = reasonDesc[reason] || reason;
    console.log('[SOCKET] Client disconnected:', socket.id, '| Reason:', reason, `(${desc})`);
  });

  socket.on('error', (error) => {
    console.error('[SOCKET] Error on client:', socket.id, '| Error:', error);
  });
});

// --- ML API Proxy to ml-service container ---
app.all('/api/ml/*', async (req, res) => {
  const targetUrl = `http://ml-service:8000${req.originalUrl}`;
  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined,
      },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      fetchOptions.headers['content-type'] = 'application/json';
    }
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`[HY-AQMS] ML Proxy Error for ${targetUrl}:`, error);
    res.status(502).json({ error: 'ML service unavailable', details: error.message });
  }
});

// --- Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid' });
    req.user = user;
    next();
  });
}

// --- MQTT logic ---
mqttClient.on('connect', () => {
  console.log('[MQTT] ✓ Connected to broker');
  mqttClient.subscribe('aqms/indoor/+/data', (err) => {
    if (!err) {
      console.log('[MQTT] ✓ Subscribed to aqms/indoor/+/data');
    } else {
      console.error('[MQTT] ✗ Subscription error:', err.message);
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] ✗ Connection error:', err.message);
});

mqttClient.on('offline', () => {
  console.warn('[MQTT] ⚠ Offline - attempting to reconnect...');
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] ⟳ Reconnecting...');
});

mqttClient.on('close', () => {
  console.error('[MQTT] ✗ Connection closed');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const topicParts = topic.split('/');
    const deviceId = topicParts[2];
    
    const pm1_0 = payload.pm1_0 !== undefined ? Number(payload.pm1_0) : null;
    const pm2_5 = payload.pm2_5 !== undefined ? Number(payload.pm2_5) : null;
    const pm10 = payload.pm10 !== undefined ? Number(payload.pm10) : null;
    const temperature = payload.temperature !== undefined ? Number(payload.temperature) : null;
    const humidity = payload.humidity !== undefined ? Number(payload.humidity) : null;
    const rssi = payload.rssi_dbm !== undefined ? Number(payload.rssi_dbm) : null;
    const battery = payload.battery_mv !== undefined ? Number(payload.battery_mv) : null;

    // Fetch and apply calibration coefficients
    let pm2_5_cal = pm2_5;
    try {
      const deviceRes = await pool.query('SELECT calibration_coefficients FROM devices WHERE device_id = $1', [deviceId]);
      if (deviceRes.rows.length > 0 && deviceRes.rows[0].calibration_coefficients) {
        const coeffs = deviceRes.rows[0].calibration_coefficients;
        const slope = Number(coeffs.pm2_5_slope) || 1.0;
        const intercept = Number(coeffs.pm2_5_intercept) || 0.0;
        if (pm2_5 !== null) {
          pm2_5_cal = (pm2_5 * slope) + intercept;
        }
      }
    } catch (calibErr) {
      console.debug(`[CAL:${deviceId}] ℹ Using raw PM2.5 (no calibration found):`, calibErr.message);
    }

    const timestamp = new Date();
    const query = `
      INSERT INTO readings (
        time, device_id, pm1_0, pm2_5, pm10, pm2_5_cal, temperature, humidity, rssi_dbm, battery_mv
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    const values = [
      timestamp, deviceId,
      pm1_0, pm2_5, pm10,
      pm2_5_cal, temperature, humidity,
      rssi, battery
    ];
    
    try {
      await pool.query(query, values);
      console.log(`[DB:${deviceId}] ✓ Reading inserted`);
    } catch (dbErr) {
      console.error(`[DB:${deviceId}] ✗ Insert failed:`, dbErr.message);
      // Don't re-throw - log and continue so socket broadcast and cache still happen
    }
    
    // Broadcast via Socket.IO with error handling
    const readingData = {
      time: timestamp, device_id: deviceId,
      pm1_0: payload.pm1_0, pm2_5: payload.pm2_5, pm10: payload.pm10,
      pm2_5_cal: pm2_5_cal, temperature: payload.temperature,
      humidity: payload.humidity, rssi_dbm: payload.rssi_dbm, battery_mv: payload.battery_mv
    };
    
    if (io.engine.clientsCount > 0) {
      io.emit('new_reading', readingData);
      console.log(`[SOCKET] ✓ Broadcasted to ${io.engine.clientsCount} client(s)`);
    } else {
      console.debug(`[SOCKET] ℹ No connected clients to broadcast to`);
    }

    try {
      await redisClient.set(`device:latest:${deviceId}`, JSON.stringify(readingData), { EX: 3600 });
      console.log(`[CACHE:${deviceId}] ✓ Cached in Redis (1h TTL)`);
    } catch (redisErr) {
      console.error(`[CACHE:${deviceId}] ✗ Redis cache failed:`, redisErr.message);
    }

    // Note: Predictions are now processed in batch every 30 seconds instead of per-message
    console.log(`[MQTT:${deviceId}] ✓ Data processed and broadcasted`);
  } catch (err) {
    console.error(`[MQTT] ✗ Error processing message:`, err.message);
  }
});

// --- REST Endpoints ---
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Auth: issuess short lived token
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read endpoints
app.get('/api/devices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devices ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices', authenticateToken, async (req, res) => {
  const { device_id, name, lat, lng, status, region, calibration_coefficients } = req.body;
  try {
    const query = `
      INSERT INTO devices (device_id, name, lat, lng, status, region, calibration_coefficients)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const result = await pool.query(query, [device_id, name, lat, lng, status || 'active', region || 'All', calibration_coefficients || {}]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, lat, lng, status, region, calibration_coefficients } = req.body;
  try {
    const query = `
      UPDATE devices 
      SET name = $1, lat = $2, lng = $3, status = $4, region = $5, calibration_coefficients = $6, updated_at = NOW()
      WHERE device_id = $7
      RETURNING *
    `;
    const result = await pool.query(query, [name, lat, lng, status, region, calibration_coefficients, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM devices WHERE device_id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device deleted', device: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices/:id/latest', async (req, res) => {
  try {
    const { id } = req.params;
    const cached = await redisClient.get(`device:latest:${id}`);
    if (cached) return res.json(JSON.parse(cached));
    const result = await pool.query('SELECT * FROM readings WHERE device_id = $1 ORDER BY time DESC LIMIT 1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No readings found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/external/embrx/latest', async (req, res) => {
  try {
    const cacheKey = `device:latest:${EMBR_X_DEVICE_ID}`;
    
    // Set a timeout for Redis get operation
    const redisPromise = redisClient.get(cacheKey);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis timeout')), 2000)
    );
    
    try {
      const cached = await Promise.race([redisPromise, timeoutPromise]);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (rediErr) {
      console.warn('[EMBR-X] ⚠ Redis get timed out or failed:', rediErr.message);
      // Fall through to database query
    }
    
    // Fallback to database if cache miss or Redis timeout
    const result = await pool.query(
      'SELECT time, device_id, pm2_5, pm2_5_cal, temperature, humidity FROM readings WHERE device_id = $1 ORDER BY time DESC LIMIT 1',
      [EMBR_X_DEVICE_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No EMBR-X readings found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[EMBR-X] ✗ Error in /api/external/embrx/latest:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/readings/latest', async (req, res) => {
  try {
    // Check cache first
    const cached = await redisClient.get('latest_readings:all');
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // If not cached, query database directly
    const result = await pool.query(`
      SELECT DISTINCT ON (device_id) * 
      FROM readings 
      ORDER BY device_id, time DESC
    `);
    
    // Cache for 5 minutes
    await redisClient.set('latest_readings:all', JSON.stringify(result.rows), { EX: 300 });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/readings', async (req, res) => {
  try {
    const { device_id, start, end, limit } = req.query;
    let query = 'SELECT * FROM readings WHERE 1=1';
    const values = [];
    let idx = 1;

    if (device_id) { query += ` AND device_id = $${idx++}`; values.push(device_id); }
    if (start) { query += ` AND time >= $${idx++}`; values.push(start); }
    if (end) { query += ` AND time <= $${idx++}`; values.push(end); }
    
    query += ` ORDER BY time DESC LIMIT $${idx++}`;
    values.push(limit ? parseInt(limit) : 1000);

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PREDICTIONS ENDPOINTS ──
app.get('/api/predictions/latest', async (req, res) => {
  try {
    // Try cache first
    const cached = await redisClient.get('predictions:latest');
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // Fallback to database
    const result = await pool.query(`
      SELECT DISTINCT ON (device_id) * 
      FROM predictions 
      WHERE time >= NOW() - INTERVAL '24 hours'
      ORDER BY device_id, time DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/predictions', async (req, res) => {
  try {
    const { device_id, start, end, limit } = req.query;
    let query = 'SELECT * FROM predictions WHERE 1=1';
    const values = [];
    let idx = 1;

    if (device_id) { query += ` AND device_id = $${idx++}`; values.push(device_id); }
    if (start) { query += ` AND time >= $${idx++}`; values.push(start); }
    if (end) { query += ` AND time <= $${idx++}`; values.push(end); }
    
    query += ` ORDER BY time DESC LIMIT $${idx++}`;
    values.push(limit ? parseInt(limit) : 1000);

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/city', async (req, res) => {
  try {
    const { range } = req.query;
    let interval = '24 hours';
    let bucket = '1 hour';
    
    if (range === '7d') {
      interval = '7 days';
      bucket = '6 hours';
    } else if (range === '30d') {
      interval = '30 days';
      bucket = '1 day';
    }

    const query = `
      SELECT 
        time_bucket('${bucket}', time) AS bucket,
        ROUND(AVG(pm1_0)::numeric, 2) AS avg_pm1_0,
        ROUND(AVG(pm2_5_cal)::numeric, 2) AS avg_pm2_5,
        ROUND(AVG(pm10)::numeric, 2) AS avg_pm10,
        ROUND(AVG(temperature)::numeric, 2) AS avg_temperature,
        ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
      FROM readings
      WHERE time >= NOW() - INTERVAL '${interval}'
      GROUP BY bucket
      ORDER BY bucket DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/device/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { range } = req.query;
    let interval = '24 hours';
    let bucket = '1 hour';
    
    if (range === '7d') {
      interval = '7 days';
      bucket = '6 hours';
    } else if (range === '30d') {
      interval = '30 days';
      bucket = '1 day';
    }

    const query = `
      SELECT 
        time_bucket('${bucket}', time) AS bucket,
        ROUND(AVG(pm1_0)::numeric, 2) AS avg_pm1_0,
        ROUND(AVG(pm2_5_cal)::numeric, 2) AS avg_pm2_5,
        ROUND(AVG(pm10)::numeric, 2) AS avg_pm10,
        ROUND(AVG(temperature)::numeric, 2) AS avg_temperature,
        ROUND(AVG(humidity)::numeric, 2) AS avg_humidity
      FROM readings
      WHERE device_id = $1 AND time >= NOW() - INTERVAL '${interval}'
      GROUP BY bucket
      ORDER BY bucket DESC;
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/export', async (req, res) => {
  try {
    const { device_id, start, end } = req.query;
    let query = 'SELECT time, device_id, pm1_0, pm2_5, pm10, pm2_5_cal, temperature, humidity, rssi_dbm, battery_mv FROM readings WHERE 1=1';
    const values = [];
    let idx = 1;

    if (device_id) { query += ` AND device_id = $${idx++}`; values.push(device_id); }
    if (start) { query += ` AND time >= $${idx++}`; values.push(start); }
    if (end) { query += ` AND time <= $${idx++}`; values.push(end); }
    query += ` ORDER BY time DESC LIMIT 50000`;  // Increased limit, will stream efficiently

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');

    // Use cursor to stream results instead of loading all into memory
    const client = await pool.connect();
    try {
      const result = await client.query(query, values);
      const rows = result.rows;
      
      if (rows.length === 0) {
        res.send('');
        return;
      }
      
      // Write header
      const fields = Object.keys(rows[0]);
      res.write(fields.join(',') + '\n');
      
      // Stream rows
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const line = fields
          .map(field => {
            const value = row[field];
            return `"${value instanceof Date ? value.toISOString() : (value ?? '')}"`;
          })
          .join(',');
        res.write(line + '\n');
        
        // Yield every 1000 rows
        if (i % 1000 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      res.end();
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Write Endpoints (PROTECTED) ---

app.patch('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, lat, lng, calibration_coefficients, status, region } = req.body;
  try {
    const query = `
      UPDATE devices 
      SET 
        name = COALESCE($1, name),
        lat = COALESCE($2, lat),
        lng = COALESCE($3, lng),
        calibration_coefficients = COALESCE($4, calibration_coefficients),
        status = COALESCE($5, status),
        region = COALESCE($6, region),
        updated_at = NOW()
      WHERE device_id = $7
      RETURNING *
    `;
    const result = await pool.query(query, [name, lat, lng, calibration_coefficients, status, region, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- Injection Endpoint (Simulate Sensor Payload) ---
app.post('/api/sim/inject', simLimiter, async (req, res) => {
  const { device_id, pm1_0, pm2_5, pm10, temperature, humidity, rssi_dbm, battery_mv } = req.body;
  
  if (!device_id) {
    console.error('[INJECT] ✗ Missing device_id');
    return res.status(400).json({ error: 'device_id is required' });
  }

  if (simPaused) {
    console.warn('[INJECT] ⚠ Simulator paused');
    return res.status(429).json({ error: 'simulator paused for debugging' });
  }

  const payload = JSON.stringify({
    pm1_0, pm2_5, pm10, temperature, humidity, rssi_dbm, battery_mv
  });

  const topic = `aqms/indoor/${device_id}/data`;
  
  // Use promise wrapper for MQTT publish to handle async publishing
  mqttClient.publish(topic, payload, { qos: 1, retain: false }, (err) => {
    if (err) {
      console.error(`[INJECT:${device_id}] ✗ Publish failed:`, err.message);
      return res.status(500).json({ error: 'MQTT publish failed', details: err.message });
    }
    console.log(`[INJECT:${device_id}] ✓ Published to ${topic}`);
    res.json({ 
      status: 'published', 
      topic, 
      device_id,
      payload: JSON.parse(payload) 
    });
  });
});

// --- Finalization: Start Server ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`Backend server listening on port ${PORT}`);
  initServer(server);
  startPredictionBatchProcessor();  // Start batch prediction processor
  await ensureEmbrxDeviceRecord();
  startEmbrxPoller();
});

// --- Graceful Shutdown ---
const shutdown = async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopPredictionBatchProcessor();  // Stop batch prediction processor
  stopEmbrxPoller();
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await pool.end();
      console.log('Database pool closed');
      await redisClient.quit();
      console.log('Redis client closed');
      mqttClient.end();
      console.log('MQTT client closed');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
