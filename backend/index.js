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

// Rate Limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

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

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().then(() => console.log('Connected to Redis')).catch(console.error);

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
app.get('/api/sim/paused', (req, res) => {
  res.json({ paused: !!simPaused });
});

app.post('/api/sim/pause', (req, res) => {
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
      // Don't stop processing - cache is optional
    }

    // Trigger ML prediction asynchronously and broadcast
    (async () => {
      try {
        const mlRes = await fetch('http://ml-service:8000/api/ml/predict/city');
        if (mlRes.ok) {
          const predictions = await mlRes.json();
          if (predictions && predictions.length > 0) {
            const predQuery = `
              INSERT INTO predictions (time, device_id, pm2_5_cal, temperature, humidity) 
              VALUES ($1, $2, $3, $4, $5) 
              ON CONFLICT (time, device_id) 
              DO UPDATE SET pm2_5_cal = EXCLUDED.pm2_5_cal, temperature = EXCLUDED.temperature, humidity = EXCLUDED.humidity, created_at = NOW()
            `;
            for (const p of predictions) {
              await pool.query(predQuery, [p.time, 'city', p.pm2_5_cal, p.temperature, p.humidity]);
            }
            io.emit('prediction_update', predictions);
          }
        }
      } catch (mlErr) {
        console.error('Failed to trigger ML prediction:', mlErr.message);
      }
    })();

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

app.get('/api/readings/latest', async (req, res) => {
  try {
    const keys = await redisClient.keys('device:latest:*');
    if (keys.length === 0) return res.json([]);
    const data = await redisClient.mGet(keys);
    res.json(data.filter(Boolean).map(d => JSON.parse(d)));
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
    query += ` ORDER BY time DESC LIMIT 10000`;

    const result = await pool.query(query, values);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
    if (result.rows.length === 0) return res.send('');
    const fields = Object.keys(result.rows[0]);
    res.write(fields.join(',') + '\n');
    result.rows.forEach(row => {
      const line = fields
        .map(field => {
          const value = row[field];
          return `"${value instanceof Date ? value.toISOString() : (value ?? '')}"`;
        })
        .join(',');
      res.write(line + '\n');
    });
    res.end();
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
app.post('/api/sim/inject', async (req, res) => {
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
const server = app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  initServer(server);
});

// --- Graceful Shutdown ---
const shutdown = async () => {
  console.log('SIGTERM signal received: closing HTTP server');
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
