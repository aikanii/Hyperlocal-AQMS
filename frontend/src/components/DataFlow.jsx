import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// WHO/US-EPA Air Quality Index (PM2.5-based)
const PAQI = [
  { max: 50,  color: 'var(--aqi-good)' }, // Good
  { max: 100,  color: 'var(--aqi-moderate)' }, // Moderate
  { max: 150,  color: 'var(--aqi-sensitive)' }, // Sensitive
  { max: 200, color: 'var(--aqi-unhealthy)' }, // Unhealthy
  { max: 300, color: 'var(--aqi-very-unhealthy)' }, // Very Unhealthy
  { max: Infinity, color: 'var(--aqi-hazardous)' }, // Hazardous
];
const getPaqiColor = (pm25) => {
  if (pm25 == null) return null;
  return (PAQI.find(t => pm25 <= t.max) || PAQI[PAQI.length - 1]).color;
};

const ACCENT = '#02EFF0';
const REF_COLOR = '#f59e0b';
const DENR_DEVICE_ID = 'denr_emb_x_reference_001';
const isRefNode = (deviceId) => deviceId === DENR_DEVICE_ID;
const NODE_W = 92;
const NODE_H = 60;

// Cubic-bezier SVG path between two points
const curvePath = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// PipelineSVG — the animated flowchart
// ─────────────────────────────────────────────────────────────────────────────
const PipelineSVG = ({ devices, getReading, isActive }) => {
  const SENSOR_W   = 108;
  const SENSOR_H   = 60;
  const SENSOR_GAP = 12;
  const SENSOR_CX  = 60 + SENSOR_W / 2; // centre X of sensor column
  const PAD_Y      = 50;

  const totalSensorH = devices.length * (SENSOR_H + SENSOR_GAP) - SENSOR_GAP;
  const svgH = Math.max(340, totalSensorH + PAD_Y * 2);
  const cy = svgH / 2; // vertical centre

  // Infrastructure nodes
  const INFRA = {
    mqtt:    { x: 300, y: cy,       label: 'MQTT Broker', sub: 'Mosquitto',   icon: '📡', color: '#8b5cf6' },
    backend: { x: 462, y: cy,       label: 'Backend',     sub: 'Node.js',     icon: '⚙️',  color: ACCENT    },
    tsdb:    { x: 624, y: cy - 62,  label: 'TimescaleDB', sub: 'PostgreSQL',  icon: '🗄️',  color: '#3b82f6' },
    redis:   { x: 624, y: cy + 62,  label: 'Redis Cache', sub: 'In-memory',   icon: '🔴', color: '#ef4444' },
    lstm:    { x: 624, y: cy + 148, label: 'LSTM Model',  sub: 'FastAPI ML',  icon: '🧠', color: '#d946ef' },
    socket:  { x: 790, y: cy,       label: 'Socket.IO',   sub: 'WebSocket',   icon: '⚡',  color: '#f59e0b' },
    dash:    { x: 955, y: cy,       label: 'Dashboard',   sub: 'React SPA',   icon: '📊', color: '#22c55e' },
  };

  // Infrastructure connection order and packet durations
  const INFRA_PATHS = [
    [INFRA.mqtt,   INFRA.backend, INFRA.backend.color, '1.3s'],
    [INFRA.backend, INFRA.tsdb,  INFRA.tsdb.color,    '1.1s'],
    [INFRA.backend, INFRA.redis, INFRA.redis.color,   '1.5s'],
    [INFRA.tsdb,   INFRA.lstm,   INFRA.lstm.color,    '1.8s'],
    [INFRA.lstm,   INFRA.backend, INFRA.lstm.color,   '2.1s'],
    [INFRA.tsdb,   INFRA.socket, INFRA.socket.color,  '1.2s'],
    [INFRA.redis,  INFRA.socket, INFRA.socket.color,  '1.6s'],
    [INFRA.socket, INFRA.dash,   INFRA.dash.color,    '0.95s'],
  ];

  // Sensor positions (vertically centred)
  const sensorTopY = (svgH - totalSensorH) / 2;
  const sensorPositions = devices.map((d, i) => ({
    device: d,
    cx: SENSOR_CX,
    cy: sensorTopY + i * (SENSOR_H + SENSOR_GAP) + SENSOR_H / 2,
  }));

  // Ensure SVG is tall enough to fit the LSTM node below Redis
  const minSvgH = Math.max(svgH, cy + 148 + NODE_H / 2 + 40);

  return (
    <svg
      viewBox={`0 0 1090 ${minSvgH}`}
      style={{ width: '100%', minWidth: '760px', display: 'block' }}
    >
      <defs>
        <filter id="df-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="df-glow-sm" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Sensor → MQTT animated paths ── */}
      {sensorPositions.map(({ device, cx, cy: sy }, idx) => {
        const active  = isActive(device.device_id);
        const reading = getReading(device.device_id);
        const pm25    = reading?.pm2_5_cal ?? null;
        const color   = active ? (getPaqiColor(pm25) || ACCENT) : 'var(--overlay-bg-hover)';
        const pathD   = curvePath(cx + SENSOR_W / 2, sy, INFRA.mqtt.x - NODE_W / 2, INFRA.mqtt.y);

        return (
          <g key={`sp-${device.device_id}`}>
            {/* Lane */}
            <path d={pathD} fill="none" stroke={color}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={active ? '5 4' : '3 7'}
              opacity={active ? 0.55 : 0.18} />
            {/* Animated data packet */}
            {active && (
              <circle r={3.8} fill={color} filter="url(#df-glow)" opacity={0.92}>
                <animateMotion
                  repeatCount="indefinite"
                  dur={`${1.7 + idx * 0.28}s`}
                  path={pathD}
                />
              </circle>
            )}
          </g>
        );
      })}

      {/* ── Infrastructure paths + packets ── */}
      {INFRA_PATHS.map(([a, b, color, dur], i) => {
        const pathD = curvePath(a.x + NODE_W / 2, a.y, b.x - NODE_W / 2, b.y);
        return (
          <g key={`ip-${i}`}>
            <path d={pathD} fill="none" stroke={color}
              strokeWidth={1.5} strokeDasharray="6 4" opacity={0.38} />
            <circle r={3.8} fill={color} filter="url(#df-glow)" opacity={0.9}>
              <animateMotion repeatCount="indefinite" dur={dur} path={pathD} />
            </circle>
          </g>
        );
      })}

      {/* ── Sensor Node cards ── */}
      {sensorPositions.map(({ device, cx, cy: sy }) => {
        const active  = isActive(device.device_id);
        const reading = getReading(device.device_id);
        const pm25    = reading?.pm2_5_cal ?? null;
        const isRef   = isRefNode(device.device_id);
        const color   = isRef ? REF_COLOR : active ? (getPaqiColor(pm25) || ACCENT) : 'var(--text-dim)';
        const rx = cx - SENSOR_W / 2;
        const ry = sy - SENSOR_H / 2;
        const name = (device.name || device.device_id).slice(0, 13);

        return (
          <g key={`sn-${device.device_id}`}>
            {/* Glow aura */}
            {(active || isRef) && (
              <rect x={rx - 4} y={ry - 4} width={SENSOR_W + 8} height={SENSOR_H + 8}
                rx={isRef ? 4 : 12} fill={color} opacity={isRef ? 0.12 : 0.07} filter="url(#df-glow)" />
            )}
            {/* Card */}
            <rect x={rx} y={ry} width={SENSOR_W} height={SENSOR_H} rx={isRef ? 4 : 9}
              fill={isRef ? 'rgba(245,158,11,0.08)' : active ? 'rgba(2,239,240,0.05)' : 'var(--overlay-bg)'}
              stroke={color} strokeWidth={isRef ? 2 : active ? 1.5 : 1}
              strokeDasharray={isRef ? '6 3' : 'none'} />

            {/* Indicator: diamond for REF, circle for normal */}
            {isRef ? (
              <g transform={`translate(${rx + 13}, ${ry + 13})`}>
                <rect x={-5} y={-5} width={10} height={10} rx={1.5}
                  fill={REF_COLOR} transform="rotate(45)">
                  <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                </rect>
              </g>
            ) : (
              <circle cx={rx + 13} cy={ry + 13} r={4.5} fill={color}>
                {active && <animate attributeName="r"       values="4.5;6;4.5" dur="1.6s" repeatCount="indefinite" />}
                {active && <animate attributeName="opacity" values="1;0.45;1"   dur="1.6s" repeatCount="indefinite" />}
              </circle>
            )}

            {/* Device name */}
            <text x={rx + 25} y={ry + 13} dominantBaseline="middle"
              fill={isRef ? REF_COLOR : 'white'} fontSize={isRef ? 8.5 : 9.5} fontWeight="700" fontFamily="monospace">
              {name}
            </text>

            {/* Status badge */}
            <rect x={rx + 4} y={ry + SENSOR_H - 22} width={SENSOR_W - 8} height={16}
              rx={4} fill={isRef ? 'rgba(245,158,11,0.15)' : active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)'} />
            <text x={cx} y={ry + SENSOR_H - 14} textAnchor="middle" dominantBaseline="middle"
              fill={isRef ? REF_COLOR : active ? '#22c55e' : '#ef4444'} fontSize={isRef ? 7 : 8} fontWeight="700" fontFamily="monospace">
              {isRef
                ? (pm25 != null ? `REF ${pm25.toFixed(1)} µg/m³` : '⭐ REFERENCE')
                : active ? `${pm25 != null ? pm25.toFixed(1) + ' µg/m³' : 'LIVE'}` : 'OFFLINE'
              }
            </text>
          </g>
        );
      })}

      {/* ── Infrastructure Nodes ── */}
      {Object.entries(INFRA).map(([key, node]) => {
        const rx = node.x - NODE_W / 2;
        const ry = node.y - NODE_H / 2;
        return (
          <g key={key}>
            {/* Soft glow */}
            <rect x={rx - 5} y={ry - 5} width={NODE_W + 10} height={NODE_H + 10}
              rx={16} fill={node.color} opacity={0.07} filter="url(#df-glow)" />
            {/* Card face */}
            <rect x={rx} y={ry} width={NODE_W} height={NODE_H} rx={11}
              fill="rgba(10,30,38,0.9)" stroke={node.color} strokeWidth={1.6} />
            {/* Icon */}
            <text x={node.x} y={ry + 18} textAnchor="middle" dominantBaseline="middle" fontSize={18}>
              {node.icon}
            </text>
            {/* Label */}
            <text x={node.x} y={ry + 36} textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize={8.5} fontWeight="700" fontFamily="sans-serif">
              {node.label}
            </text>
            {/* Sub-label */}
            <text x={node.x} y={ry + 49} textAnchor="middle" dominantBaseline="middle"
              fill={node.color} fontSize={7.5} opacity={0.85} fontFamily="monospace">
              {node.sub}
            </text>
            {/* Online indicator */}
            <circle cx={rx + NODE_W - 9} cy={ry + 9} r={4} fill="#22c55e" filter="url(#df-glow-sm)">
              <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}

      {/* ── LSTM prediction label ── */}
      <text x={INFRA.lstm.x} y={INFRA.lstm.y + NODE_H / 2 + 16} textAnchor="middle"
        fill={INFRA.lstm.color} fontSize={6.5} letterSpacing="1.2"
        fontWeight="700" fontFamily="monospace" opacity={0.7}>
        PREDICTION PIPELINE
      </text>

      {/* ── Stage labels (bottom row) ── */}
      {[
        { x: SENSOR_CX,         label: 'SENSOR LAYER'  },
        { x: INFRA.mqtt.x,      label: 'TRANSPORT'     },
        { x: INFRA.backend.x,   label: 'PROCESSING'    },
        { x: INFRA.tsdb.x,      label: 'STORAGE + ML'  },
        { x: INFRA.socket.x,    label: 'REAL-TIME'     },
        { x: INFRA.dash.x,      label: 'PRESENTATION'  },
      ].map(({ x, label }) => (
        <text key={label} x={x} y={minSvgH - 8} textAnchor="middle"
          fill="var(--text-dim)" fontSize={7} letterSpacing="1.5"
          fontWeight="700" fontFamily="monospace">
          {label}
        </text>
      ))}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SensorCard — detail card below the diagram
// ─────────────────────────────────────────────────────────────────────────────
const SensorCard = ({ device, active, reading, pm25, color, timeSince }) => {
  const isRef = isRefNode(device.device_id);
  const cardColor = isRef ? REF_COLOR : color;

  return (
    <div className="glass-panel hover-lift" style={{
      padding: '1.5rem',
      borderLeft: `4px solid ${cardColor}`,
      borderTop: isRef ? `1px solid rgba(245,158,11,0.25)` : 'none',
      borderRight: isRef ? `1px solid rgba(245,158,11,0.1)` : 'none',
      opacity: active || isRef ? 1 : 0.55,
      transition: 'opacity 0.4s ease, box-shadow 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {isRef && (
        <div style={{
          position: 'absolute', top: '0', right: '0',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))',
          padding: '0.15rem 0.6rem 0.15rem 0.8rem',
          borderBottomLeftRadius: '8px',
          fontSize: '0.55rem', fontWeight: '800', letterSpacing: '1px',
          color: REF_COLOR, fontFamily: 'monospace',
        }}>
          ⭐ REFERENCE GRADE
        </div>
      )}
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.2rem', color: isRef ? REF_COLOR : 'inherit' }}>
            {device.name || device.device_id}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            {device.device_id}
          </div>
          {device.region && (
            <div style={{ fontSize: '0.65rem', color: isRef ? REF_COLOR : 'var(--accent)', marginTop: '0.15rem' }}>
              📍 {device.region}
            </div>
          )}
        </div>

        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.25rem 0.75rem', borderRadius: '20px',
          background: isRef ? 'rgba(245,158,11,0.1)' : active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${isRef ? 'rgba(245,158,11,0.3)' : active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
          fontSize: '0.65rem', fontWeight: 'bold',
          color: isRef ? REF_COLOR : active ? '#22c55e' : '#ef4444',
          marginTop: isRef ? '1rem' : '0',
        }}>
          <div style={{
            width: isRef ? '6px' : '5px', height: isRef ? '6px' : '5px',
            borderRadius: isRef ? '1px' : '50%',
            background: isRef ? REF_COLOR : active ? '#22c55e' : '#ef4444',
            transform: isRef ? 'rotate(45deg)' : 'none',
            animation: (active || isRef) ? 'pulse-glow 1.5s infinite' : 'none',
          }} />
          {isRef ? 'EXTERNAL REFERENCE' : active ? 'TRANSMITTING' : 'OFFLINE'}
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
        {[
          { label: 'PM2.5',  val: pm25?.toFixed(1) ?? '---', unit: 'µg/m³', c: cardColor },
          { label: 'TEMP',   val: reading?.temperature?.toFixed(1) ?? '---', unit: '°C',    c: 'white' },
          { label: 'SYNCED', val: timeSince(reading?.time), unit: '',       c: 'var(--text-dim)' },
        ].map(({ label, val, unit, c }) => (
          <div key={label} style={{
            background: isRef ? 'rgba(245,158,11,0.04)' : 'var(--overlay-bg)',
            padding: '0.6rem', borderRadius: '8px', textAlign: 'center',
            border: isRef ? '1px solid rgba(245,158,11,0.1)' : 'none',
          }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginBottom: '0.3rem', letterSpacing: '0.5px', fontWeight: 'bold' }}>
              {label}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: c }}>{val}</div>
            {unit && <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>{unit}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DataFlow — main export
// ─────────────────────────────────────────────────────────────────────────────
const DataFlow = ({ readings }) => {
  const [devices, setDevices] = useState([]);

  // ── Periodic tick: forces re-render every 10 s so isActive() stays accurate
  // even when no new Socket.IO readings arrive (i.e. a sensor has gone offline).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    axios.get('/api/devices')
      .then(r => setDevices(Array.isArray(r.data) ? r.data : []))
      .catch(err => {
        console.error('Error fetching devices:', err);
        setDevices([]);
      });
  }, []);

  const getReading = useCallback(
    (deviceId) => readings.find(r => r.device_id === deviceId),
    [readings]
  );

  // 90-second window — sensor misses ≈3 inject cycles (@ 30 s each) before
  // being marked offline; real firmware sending every 60 s gets 1.5 cycles grace.
  const isActive = useCallback((deviceId) => {
    const r = getReading(deviceId);
    return r?.time ? now - new Date(r.time).getTime() < 90_000 : false;
  }, [getReading, now]);

  const activeCount = devices.filter(d => isActive(d.device_id)).length;

  const lastReading = readings.reduce(
    (latest, r) => (!latest || new Date(r.time) > new Date(latest) ? r.time : latest),
    null
  );

  const timeSince = (iso) => {
    if (!iso) return '---';
    const s = Math.floor((now - new Date(iso)) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const LEGEND = [
    { color: '#22c55e',               shape: 'dot',  label: 'Active / Transmitting' },
    { color: 'var(--text-dim)', shape: 'dot',  label: 'Offline / No data' },
    { color: ACCENT,                   shape: 'line', label: 'Live data stream' },
    { color: '#8b5cf6',                shape: 'dot',  label: 'Moving data packet' },
    { color: '#d946ef',                shape: 'line', label: 'LSTM prediction flow' },
    { color: REF_COLOR,                shape: 'diamond', label: 'DENR reference node' },
  ];

  return (
    <div style={{ padding: '2rem 3rem', overflowY: 'auto', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Header ── */}
      <header className="animate-stagger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', animationDelay: '0.05s' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 0.3rem 0' }}>
            Data Pipeline
          </h2>
          <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.9rem' }}>
            Live telemetry path — sensors → MQTT → backend → storage → dashboard
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.3rem' }}>
              ACTIVE NODES
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '900', color: activeCount > 0 ? '#22c55e' : '#ef4444', lineHeight: 1 }}>
              {activeCount}
              <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: '400' }}>
                /{devices.length}
              </span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.3rem' }}>
              LAST PACKET
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: ACCENT, lineHeight: 1.8 }}>
              {timeSince(lastReading)}
            </div>
          </div>
        </div>
      </header>

      {/* ── Pipeline SVG diagram ── */}
      <div className="glass-panel animate-stagger" style={{ padding: '1.5rem 2rem 1rem', marginBottom: '1.5rem', overflowX: 'auto', animationDelay: '0.15s' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.75rem' }}>
          LIVE DATA FLOW DIAGRAM
        </div>
        <PipelineSVG
          devices={devices}
          getReading={getReading}
          isActive={isActive}
        />
      </div>

      {/* ── Legend ── */}
      <div className="glass-panel animate-stagger" style={{ padding: '0.9rem 1.5rem', marginBottom: '2rem', animationDelay: '0.2s' }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px' }}>
            LEGEND
          </div>
          {LEGEND.map(({ color, shape, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {shape === 'dot'
                ? <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                : shape === 'diamond'
                  ? <div style={{ width: '8px', height: '8px', background: color, transform: 'rotate(45deg)', borderRadius: '1.5px', flexShrink: 0 }} />
                  : <div style={{ width: '26px', height: '2px', background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 5px, transparent 5px, transparent 9px)`, flexShrink: 0 }} />
              }
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Sensor detail cards ── */}
      <div className="animate-stagger" style={{ animationDelay: '0.25s' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>
          Sensor Node Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
          {devices.map(device => {
            const active  = isActive(device.device_id);
            const reading = getReading(device.device_id);
            const pm25    = reading?.pm2_5_cal ?? null;
            const color   = active ? (getPaqiColor(pm25) || ACCENT) : 'var(--text-dim)';
            return (
              <SensorCard
                key={device.device_id}
                device={device}
                active={active}
                reading={reading}
                pm25={pm25}
                color={color}
                timeSince={timeSince}
              />
            );
          })}
        </div>

        {devices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔌</div>
            <p>No devices registered in the system.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataFlow;
