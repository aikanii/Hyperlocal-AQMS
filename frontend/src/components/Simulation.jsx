import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// ── Access Denied ─────────────────────────────────────────────────────────────
const AccessDenied = () => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '3rem', textAlign: 'center', gap: '1.5rem'
  }}>
    <div style={{
      width: '80px', height: '80px', borderRadius: '50%',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '2.5rem'
    }}>🔒</div>
    <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800' }}>Access Restricted</h2>
    <p style={{ margin: 0, color: 'var(--text-dim)', maxWidth: '380px', lineHeight: 1.6 }}>
      The Mission Control simulation interface is available to administrators only.
    </p>
    <div style={{
      padding: '0.6rem 1.4rem', borderRadius: '8px',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      color: '#ef4444', fontSize: '0.8rem', fontWeight: '600', letterSpacing: '0.5px'
    }}>
      ADMIN CREDENTIALS REQUIRED
    </div>
  </div>
);

// ── Custom Toggle Switch ──────────────────────────────────────────────────────
const ToggleSwitch = ({ checked, onChange }) => (
  <label style={{
    position: 'relative', display: 'inline-block',
    width: '60px', height: '32px', cursor: 'pointer', flexShrink: 0,
  }}>
    <input
      type="checkbox" checked={checked} onChange={onChange}
      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
    />
    <span style={{
      position: 'absolute', inset: 0,
      background: checked ? '#22c55e' : 'var(--overlay-bg-hover)',
      borderRadius: '32px',
      transition: 'background 0.3s ease, box-shadow 0.3s ease',
      boxShadow: checked ? '0 0 16px rgba(34,197,94,0.5)' : 'none',
      border: `1px solid ${checked ? 'rgba(34,197,94,0.6)' : 'var(--border)'}`,
    }}>
      <span style={{
        position: 'absolute',
        width: '24px', height: '24px',
        top: '3px',
        left: checked ? '32px' : '3px',
        background: 'white',
        borderRadius: '50%',
        transition: 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 4px 15px var(--shadow)',
      }} />
    </span>
  </label>
);

// ── Per-Sensor Toggle Card ────────────────────────────────────────────────────
const SensorToggleCard = ({ device, enabled, stats, onToggle }) => {
  const hasError  = !!stats?.error;
  const borderClr = hasError ? '#ef4444' : enabled ? '#22c55e' : 'var(--border)';

  return (
    <div className="glass-panel" style={{
      padding: '1.5rem',
      borderLeft: `4px solid ${borderClr}`,
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      boxShadow: enabled && !hasError ? '0 0 24px rgba(34,197,94,0.07)' : 'none',
    }}>
      {/* Name row + toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: '1rem' }}>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {device.name || device.device_id}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            {device.device_id}
          </div>
          {device.region && (
            <div style={{ fontSize: '0.62rem', color: 'var(--accent)', marginTop: '0.1rem' }}>
              📍 {device.region}
            </div>
          )}
        </div>
        <ToggleSwitch checked={!!enabled} onChange={onToggle} />
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.35rem 0.8rem', borderRadius: '8px', marginBottom: '1rem',
        background: hasError
          ? 'rgba(239,68,68,0.1)'
          : enabled
          ? 'rgba(34,197,94,0.08)'
          : 'var(--overlay-bg)',
        border: `1px solid ${hasError
          ? 'rgba(239,68,68,0.25)'
          : enabled
          ? 'rgba(34,197,94,0.2)'
          : 'var(--border)'}`,
        fontSize: '0.7rem', fontWeight: '700',
        color: hasError ? '#ef4444' : enabled ? '#22c55e' : 'var(--text-dim)',
      }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
          background: hasError ? '#ef4444' : enabled ? '#22c55e' : 'var(--text-dim)',
          animation: enabled && !hasError ? 'pulse-glow 1.5s infinite' : 'none',
        }} />
        {hasError
          ? `ERROR: ${stats.error.slice(0, 36)}…`
          : enabled
          ? 'SIMULATING  —  LIVE'
          : 'IDLE  —  OFF'}
      </div>

      {/* Stat tiles: packets sent & last inject */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {[
          { label: 'PACKETS SENT', val: stats?.count ?? 0,  color: enabled ? 'var(--accent)' : 'var(--text-dim)' },
          { label: 'LAST INJECT',  val: stats?.lastTime ?? '---', color: 'var(--text-dim)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'var(--overlay-bg)', padding: '0.5rem 0.4rem',
            borderRadius: '8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: '700', color }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main Simulation Component ─────────────────────────────────────────────────
const Simulation = () => {
  const { isAdmin } = useAuth();

  // ── Core state ───────────────────────────────────────────────────────────────
  const [deviceId, setDeviceId]   = useState('');
  const [devices,  setDevices]    = useState([]);
  const [payload,  setPayload]    = useState({
    pm1_0: 10, pm2_5: 25.5, pm10: 45,
    temperature: 28.5, humidity: 65,
    rssi_dbm: -65, battery_mv: 4100,
  });
  const [logs,        setLogs]        = useState([]);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [cadenceMs,   setCadenceMs]   = useState(120000);  // Default: 2 minutes (120s); can toggle to 60s

  // ── Per-sensor toggle state ──────────────────────────────────────────────────
  const [sensorEnabled, setSensorEnabled] = useState({});  // { device_id: bool }
  const [sensorStats,   setSensorStats]   = useState({});  // { device_id: { count, lastTime, error } }
  const sensorIntervals = useRef({});                       // { device_id: intervalId }

  // Keep payload ref fresh so intervals always see latest values
  const payloadRef = useRef(payload);
  useEffect(() => { payloadRef.current = payload; }, [payload]);

  // Clean up all per-sensor intervals on unmount
  useEffect(() => {
    const intervals = sensorIntervals.current;
    return () => Object.values(intervals).forEach(clearInterval);
  }, []);

  // ── Auto-pilot: inject into ALL devices every 120 s (2 minutes) ───────────
  useEffect(() => {
    if (!isAutoPilot || devices.length === 0) return;

    const injectAll = () => {
      devices.forEach(async (device) => {
        try {
          const p = payloadRef.current;
          const vary = (base, d) => Number((base + (Math.random() * d * 2 - d)).toFixed(2));
          const res = await axios.post('/api/sim/inject', {
            device_id:   device.device_id,
            pm1_0:       Math.max(0, vary(p.pm1_0, 2)),
            pm2_5:       Math.max(0, vary(p.pm2_5, 5)),
            pm10:        Math.max(0, vary(p.pm10, 8)),
            temperature: vary(p.temperature, 0.8),
            humidity:    Math.min(100, Math.max(0, vary(p.humidity, 3))),
            rssi_dbm:    Math.floor(vary(p.rssi_dbm, 4)),
            battery_mv:  Math.floor(vary(p.battery_mv, 30)),
          });
          addLog(`AUTO → ${res.data.topic}`, 'success');
        } catch (err) {
          addLog(`AUTO ERR [${device.device_id}]: ${err.message}`, 'error');
        }
      });
    };

    const cadenceLabel = cadenceMs === 60000 ? '60 seconds' : '2 minutes';
    addLog(`Auto-pilot engaged — broadcasting to ${devices.length} sensor(s) every ${cadenceLabel}.`, 'info');
    injectAll();
    const id = setInterval(injectAll, cadenceMs);
    return () => { clearInterval(id); addLog('Auto-pilot disengaged.', 'info'); };
  }, [isAutoPilot, devices, cadenceMs]);

  // ── Fetch device list on mount ───────────────────────────────────────────────
  useEffect(() => {
    axios.get('/api/devices')
      .then(res => {
        const devicesData = Array.isArray(res.data) ? res.data : [];
        setDevices(devicesData);
        setDeviceId(prevId => !prevId && devicesData.length > 0 ? devicesData[0].device_id : prevId);
      })
      .catch(err => {
        addLog(`FAILED TO FETCH DEVICES: ${err.message}`, 'error');
        setDevices([]);
      });
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const addLog = (msg, type = 'info') =>
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 100));

  const buildData = (device_id) => {
    const p = payloadRef.current;
    const vary = (base, d) => Number((base + (Math.random() * d * 2 - d)).toFixed(2));
    return {
      device_id,
      pm1_0:       Math.max(0, vary(p.pm1_0, 2)),
      pm2_5:       Math.max(0, vary(p.pm2_5, 5)),
      pm10:        Math.max(0, vary(p.pm10, 8)),
      temperature: vary(p.temperature, 0.8),
      humidity:    Math.min(100, Math.max(0, vary(p.humidity, 3))),
      rssi_dbm:    Math.floor(vary(p.rssi_dbm, 4)),
      battery_mv:  Math.floor(vary(p.battery_mv, 30)),
    };
  };

  // ── Per-sensor toggle ────────────────────────────────────────────────────────
  const toggleSensor = (device) => {
    const { device_id } = device;
    const isOn = !!sensorEnabled[device_id];

    if (isOn) {
      clearInterval(sensorIntervals.current[device_id]);
      delete sensorIntervals.current[device_id];
      setSensorEnabled(prev => ({ ...prev, [device_id]: false }));
      addLog(`⏹ STOPPED: ${device.name || device_id}`, 'info');
    } else {
      const inject = async () => {
        try {
          const res = await axios.post('/api/sim/inject', buildData(device_id));
          setSensorStats(prev => ({
            ...prev,
            [device_id]: {
              count:    (prev[device_id]?.count || 0) + 1,
              lastTime: new Date().toLocaleTimeString(),
              error:    null,
            },
          }));
          addLog(`▶ ${device.name || device_id} → ${res.data.topic}`, 'success');
        } catch (err) {
          setSensorStats(prev => ({
            ...prev,
            [device_id]: { ...prev[device_id], error: err.message },
          }));
          addLog(`✗ ${device.name || device_id}: ${err.message}`, 'error');
        }
      };

      inject();                                                        // immediate
      sensorIntervals.current[device_id] = setInterval(inject, cadenceMs); // then on cadence
      setSensorEnabled(prev => ({ ...prev, [device_id]: true }));
      const cadenceLabel = cadenceMs === 60000 ? '60 seconds' : '2 minutes';
      addLog(`▶ STARTED: ${device.name || device_id} — injecting every ${cadenceLabel}`, 'info');
    }
  };

  const enableAll  = () => devices.forEach(d => { if (!sensorEnabled[d.device_id]) toggleSensor(d); });
  const disableAll = () => devices.forEach(d => { if (sensorEnabled[d.device_id])  toggleSensor(d); });

  // ── Manual single inject ─────────────────────────────────────────────────────
  const handleSimulate = async () => {
    try {
      const res = await axios.post('/api/sim/inject', { device_id: deviceId, ...payload });
      addLog(`PUBLISHED → ${res.data.topic}`, 'success');
    } catch (err) {
      addLog(`ERR: ${err.response?.data?.error || err.message}`, 'error');
    }
  };

  if (!isAdmin) return <AccessDenied />;

  // ── EPA presets ─────────────────────────────────────────────────────────────
  const setPreset = (type) => {
    const presets = {
      good:           { pm2_5: 25.0,  pm10: 45  },
      moderate:       { pm2_5: 75.0,  pm10: 120 },
      sensitive:      { pm2_5: 125.0, pm10: 180 },
      unhealthy:      { pm2_5: 175.0, pm10: 250 },
      very_unhealthy: { pm2_5: 250.0, pm10: 350 },
      hazardous:      { pm2_5: 350.0, pm10: 420 },
    };
    setPayload(p => ({ ...p, ...presets[type] }));
    addLog(`Preset '${type}' loaded into payload buffer.`, 'info');
  };

  const activeCount = Object.values(sensorEnabled).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="simulation-view animate-stagger" style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', animationDelay: '0.05s' }}>

      {/* Header */}
      <header style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 0.4rem 0' }}>Mission Control</h2>
        <p style={{ color: 'var(--text-dim)', margin: 0 }}>
          Payload laboratory &amp; per-sensor hardware emulation console
        </p>
      </header>

      {/* ── SENSOR CONTROL PANEL ── */}
      <div className="glass-panel animate-stagger" style={{ padding: '2rem', marginBottom: '2rem', animationDelay: '0.1s' }}>

        {/* Panel header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--accent)' }}>
              Sensor Control Panel
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Toggle individual sensors ON/OFF to inject live data through the full pipeline&nbsp;
              <span style={{ opacity: 0.6 }}>(MQTT → Backend → TimescaleDB → Socket.IO → Dashboard)</span>
            </p>
          </div>

          {/* Bulk controls + counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
            <button
              onClick={enableAll}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontSize: '0.73rem', fontWeight: '800', cursor: 'pointer', letterSpacing: '0.5px', transition: 'all 0.2s' }}
            >
              ALL ON
            </button>
            <button
              onClick={disableAll}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.73rem', fontWeight: '800', cursor: 'pointer', letterSpacing: '0.5px', transition: 'all 0.2s' }}
            >
              ALL OFF
            </button>
            <div style={{
              padding: '0.5rem 1.1rem', borderRadius: '8px',
              background: activeCount > 0 ? 'rgba(34,197,94,0.08)' : 'var(--overlay-bg)',
              border: `1px solid ${activeCount > 0 ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
              fontSize: '0.8rem', fontWeight: '800',
              color: activeCount > 0 ? '#22c55e' : 'var(--text-dim)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              {activeCount > 0 && (
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', animation: 'pulse-glow 1.5s infinite' }} />
              )}
              {activeCount} / {devices.length} ACTIVE
            </div>
          </div>
        </div>

        {/* Cadence Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--overlay-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '0.5px', margin: 0 }}>
            BROADCAST CADENCE
          </label>
          <button
            onClick={() => setCadenceMs(60000)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              border: `1px solid ${cadenceMs === 60000 ? 'rgba(2,239,240,0.6)' : 'rgba(2,239,240,0.25)'}`,
              background: cadenceMs === 60000 ? 'rgba(2,239,240,0.12)' : 'transparent',
              color: cadenceMs === 60000 ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: '0.7rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.4px',
            }}
          >
            60s
          </button>
          <button
            onClick={() => setCadenceMs(120000)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              border: `1px solid ${cadenceMs === 120000 ? 'rgba(2,239,240,0.6)' : 'rgba(2,239,240,0.25)'}`,
              background: cadenceMs === 120000 ? 'rgba(2,239,240,0.12)' : 'transparent',
              color: cadenceMs === 120000 ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: '0.7rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.4px',
            }}
          >
            120s (2m)
          </button>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {cadenceMs === 60000 ? '⏱️ 60 seconds' : '⏱️ 2 minutes'}
          </div>
        </div>

        {/* Sensor cards grid */}
        {devices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
            Loading sensor nodes…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: '1rem' }}>
            {devices.map(device => (
              <SensorToggleCard
                key={device.device_id}
                device={device}
                enabled={!!sensorEnabled[device.device_id]}
                stats={sensorStats[device.device_id]}
                onToggle={() => toggleSensor(device)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Payload Buffer + Telemetry Log ── */}
      <div className="animate-stagger" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: '2rem', animationDelay: '0.2s' }}>

        {/* Left: Payload Buffer */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '1.1rem', color: 'var(--accent)' }}>
            Payload Buffer
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0 0 1.5rem 0' }}>
            Values are shared by all active sensor toggles — changes apply on the next inject cycle.
          </p>

          {/* Target station (manual only) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              TARGET STATION — MANUAL INJECT
            </label>
            <select
              style={{ width: '100%', padding: '0.8rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontFamily: '"Times New Roman", Times, serif', appearance: 'none', cursor: 'pointer' }}
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              {devices.length === 0 && <option value="">Loading sensors…</option>}
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id} style={{ background: 'var(--surface)' }}>
                  {d.name} ({d.device_id})
                </option>
              ))}
            </select>
          </div>

          {/* Key fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.8rem' }}>
            {['pm2_5', 'temperature', 'humidity'].map(key => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {key.replace('_', '.').toUpperCase()}
                </label>
                <input
                  type="number" step="0.1"
                  style={{ width: '100%', padding: '0.8rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', boxSizing: 'border-box' }}
                  value={payload[key]}
                  onChange={e => setPayload({ ...payload, [key]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>

          {/* PAQi Presets */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.8rem' }}>
              PAQi PRESETS
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {[
                { id: 'good',           label: 'GOOD',           color: 'var(--aqi-good)',           bg: 'rgba(34,197,94,0.08)'   },
                { id: 'moderate',       label: 'MODERATE',       color: 'var(--aqi-moderate)',       bg: 'rgba(234,179,8,0.08)'   },
                { id: 'sensitive',      label: 'SENSITIVE',      color: 'var(--aqi-sensitive)',      bg: 'rgba(249,115,22,0.08)'  },
                { id: 'unhealthy',      label: 'UNHEALTHY',      color: 'var(--aqi-unhealthy)',      bg: 'rgba(239,68,68,0.08)'   },
                { id: 'very_unhealthy', label: 'VERY UNHEALTHY', color: 'var(--aqi-very-unhealthy)', bg: 'rgba(168,85,247,0.1)'   },
                { id: 'hazardous',      label: 'HAZARDOUS',      color: 'var(--aqi-hazardous)',      bg: 'rgba(136,19,55,0.1)'    },
              ].map(({ id, label, color, bg }) => (
                <button
                  key={id}
                  onClick={() => setPreset(id)}
                  style={{ flex: 1, minWidth: '70px', padding: '0.55rem 0.4rem', background: bg, color, border: `1px solid ${color}44`, borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.7rem', transition: 'all 0.2s' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleSimulate}
              className="pulse"
              disabled={isAutoPilot}
              style={{ flex: 1, padding: '1.1rem', background: isAutoPilot ? 'var(--overlay-bg)' : 'var(--accent)', color: isAutoPilot ? 'var(--text-dim)' : 'var(--bg)', border: 'none', borderRadius: '12px', cursor: isAutoPilot ? 'not-allowed' : 'pointer', fontWeight: '800', fontSize: '0.95rem', letterSpacing: '1px', transition: 'all 0.3s' }}
            >
              INJECT ONCE
            </button>
            <button
              onClick={() => setIsAutoPilot(v => !v)}
              style={{ width: '140px', padding: '1.1rem', borderRadius: '12px', cursor: 'pointer', fontWeight: '800', fontSize: '0.82rem', letterSpacing: '1px', background: isAutoPilot ? 'rgba(239,68,68,0.1)' : 'rgba(2,239,240,0.1)', color: isAutoPilot ? '#ef4444' : 'var(--accent)', border: isAutoPilot ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(2,239,240,0.25)', transition: 'all 0.3s' }}
            >
              {isAutoPilot ? 'STOP AUTO' : 'AUTO ALL'}
            </button>
          </div>
        </div>

        {/* Right: Telemetry Log */}
        <div className="glass-panel" style={{ padding: '2rem', background: 'var(--panel)', display: 'flex', flexDirection: 'column', maxHeight: '580px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>
              TELEMETRY LOG
            </h3>
            <button
              onClick={() => setLogs([])}
              style={{ fontSize: '0.65rem', color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.6rem', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              CLEAR
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
            {logs.map((log, i) => (
              <div
                key={i}
                style={{ marginBottom: '0.65rem', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border)', color: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : 'var(--text-dim)' }}
              >
                <span style={{ opacity: 0.4 }}>[{log.time}]</span> {log.msg}
              </div>
            ))}
            {logs.length === 0 && (
              <div style={{ color: 'var(--border)' }}>Waiting for uplink activity…</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Simulation;
