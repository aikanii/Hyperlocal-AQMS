import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useReadings } from '../contexts/ReadingsContext';
import { REFERENCE_DEVICE_ID } from '../constants/referenceNode';
import { getReferenceAqi } from '../utils/referenceNode';

// ── Access Denied ─────────────────────────────────────────────────────────────
const AccessDenied = () => (
  <div style={{
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '3rem', textAlign: 'center', gap: '1.5rem',
  }}>
    <div style={{
      width: '80px', height: '80px', borderRadius: '50%',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '2.5rem',
    }}>🔒</div>
    <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800' }}>Access Restricted</h2>
    <p style={{ margin: 0, color: 'var(--text-dim)', maxWidth: '380px', lineHeight: 1.6 }}>
      The Calibration Settings interface is available to administrators only.
    </p>
  </div>
);

const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <label style={{
    position: 'relative', display: 'inline-block',
    width: '60px', height: '32px', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
    opacity: disabled ? 0.55 : 1,
  }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
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
        position: 'absolute', width: '24px', height: '24px', top: '3px',
        left: checked ? '32px' : '3px', background: 'white', borderRadius: '50%',
        transition: 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 4px 15px var(--shadow)',
      }} />
    </span>
  </label>
);

const SensorToggleCard = ({ device, enabled, stats, onToggle }) => {
  const isRef = device.device_id === REFERENCE_DEVICE_ID;
  const hasError = !!stats?.error;
  const borderClr = hasError ? '#ef4444' : enabled ? '#22c55e' : isRef ? '#f59e0b' : 'var(--border)';

  return (
    <div className="glass-panel" style={{
      padding: '1.5rem',
      borderLeft: `4px solid ${borderClr}`,
      background: isRef ? 'rgba(245,158,11,0.03)' : 'var(--panel)',
      boxShadow: enabled && !hasError ? '0 0 24px rgba(34,197,94,0.07)' : isRef ? '0 0 20px rgba(245,158,11,0.05)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: '1rem' }}>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.15rem', color: isRef ? '#f59e0b' : 'inherit' }}>
            {device.name || device.device_id}
            {isRef && (
              <span style={{ fontSize: '0.6rem', color: '#f59e0b', background: 'rgba(245,158,11,0.15)', padding: '0.15rem 0.3rem', borderRadius: '4px', marginLeft: '0.5rem', border: '1px solid rgba(245,158,11,0.3)' }}>REF</span>
            )}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>{device.device_id}</div>
        </div>
        <ToggleSwitch checked={!!enabled} onChange={onToggle} disabled={isRef} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.8rem', borderRadius: '8px', marginBottom: '1rem',
        background: hasError ? 'rgba(239,68,68,0.1)' : enabled ? 'rgba(34,197,94,0.08)' : 'var(--overlay-bg)',
        border: `1px solid ${hasError ? 'rgba(239,68,68,0.25)' : enabled ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
        fontSize: '0.7rem', fontWeight: '700',
        color: hasError ? '#ef4444' : enabled ? '#22c55e' : 'var(--text-dim)',
      }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
          background: hasError ? '#ef4444' : enabled ? '#22c55e' : 'var(--text-dim)',
          animation: enabled && !hasError ? 'pulse-glow 1.5s infinite' : 'none',
        }} />
        {hasError
          ? `ERROR: ${String(stats.error).slice(0, 36)}…`
          : isRef
            ? 'REFERENCE — LIVE AQI FEED'
            : enabled
              ? 'AUTO INJECT — LIVE'
              : 'PAUSED'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {[
          { label: 'PACKETS SENT', val: stats?.count ?? 0, color: enabled ? 'var(--accent)' : 'var(--text-dim)' },
          { label: 'LAST INJECT', val: stats?.lastTime ?? '---', color: 'var(--text-dim)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--overlay-bg)', padding: '0.5rem 0.4rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: '700', color }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LOCATION_PM25_CALIBRATION = {
  pilmico_corp_001: { factor: 1.35, offset: 10 },
  nsc_iligan_001: { factor: 1.35, offset: 10 },
  tambo_terminal_001: { factor: 1.18, offset: 6 },
  southbound_terminal_001: { factor: 1.18, offset: 6 },
  tambacan_hall_001: { factor: 1.18, offset: 6 },
  poblacion_hall_010: { factor: 1.0, offset: 0 },
  suarez_iligan_001: { factor: 1.0, offset: 0 },
  iligan_city_hall_001: { factor: 1.0, offset: 0 },
  iligan_highschool_001: { factor: 0.85, offset: -5 },
  msu_iit_campus_001: { factor: 0.7, offset: -8 },
};

const Calibration = () => {
  const { isAdmin } = useAuth();
  const { referenceReading, socketStatus } = useReadings();

  const [devices, setDevices] = useState([]);
  const [payload, setPayload] = useState({
    pm2_5: 0,
    pm10: 45,
    temperature: 28.5,
    humidity: 65,
    rssi_dbm: -65,
    battery_mv: 4100,
  });
  const [logs, setLogs] = useState([]);
  const [cadenceMs, setCadenceMs] = useState(120000);
  const [sensorEnabled, setSensorEnabled] = useState({});
  const [sensorStats, setSensorStats] = useState({});
  const [referenceAqi, setReferenceAqi] = useState(null);

  const payloadRef = useRef(payload);
  const sensorIntervals = useRef({});
  const inflightRef = useRef({});
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs((prev) => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 100));
  }, []);

  const applyReferenceToPayload = useCallback((reading) => {
    const aqi = getReferenceAqi(reading);
    if (aqi == null) return;
    setReferenceAqi(aqi);
    setPayload((prev) => {
      const next = {
        ...prev,
        pm2_5: aqi,
        temperature: reading?.temperature ?? prev.temperature,
        humidity: reading?.humidity ?? prev.humidity,
      };
      payloadRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (referenceReading?.device_id === REFERENCE_DEVICE_ID) {
      applyReferenceToPayload(referenceReading);
    }
  }, [referenceReading, applyReferenceToPayload]);

  const buildData = useCallback((device_id) => {
    const p = payloadRef.current;
    const vary = (base, d) => Number((base + (Math.random() * d * 2 - d)).toFixed(2));
    const calibration = LOCATION_PM25_CALIBRATION[device_id] || { factor: 1.0, offset: 0 };
    const basePm25 = p.pm2_5 ?? referenceAqi ?? 0;
    const calibratedPm25 = Math.max(0, basePm25 * calibration.factor + calibration.offset);

    return {
      device_id,
      pm2_5: Math.max(0, vary(calibratedPm25, 5)),
      pm10: Math.max(0, vary(p.pm10, 8)),
      temperature: vary(p.temperature, 0.8),
      humidity: Math.min(100, Math.max(0, vary(p.humidity, 3))),
      rssi_dbm: Math.floor(vary(p.rssi_dbm, 4)),
      battery_mv: Math.floor(vary(p.battery_mv, 30)),
    };
  }, [referenceAqi]);

  const stopSensorInjection = useCallback((device_id, deviceName) => {
    clearInterval(sensorIntervals.current[device_id]);
    delete sensorIntervals.current[device_id];
    delete inflightRef.current[device_id];
    setSensorEnabled((prev) => ({ ...prev, [device_id]: false }));
    addLog(`⏹ PAUSED: ${deviceName || device_id}`, 'info');
  }, [addLog]);

  const runInject = useCallback(async (device) => {
    const { device_id, name } = device;
    if (device_id === REFERENCE_DEVICE_ID) return;
    if (inflightRef.current[device_id]) return;

    const aqi = payloadRef.current.pm2_5 ?? referenceAqi;
    if (aqi == null || !Number.isFinite(aqi)) {
      setSensorStats((prev) => ({
        ...prev,
        [device_id]: { ...prev[device_id], error: 'Waiting for Reference Node AQI…' },
      }));
      return;
    }

    inflightRef.current[device_id] = true;
    try {
      const res = await axios.post('/api/sim/inject', buildData(device_id));
      setSensorStats((prev) => ({
        ...prev,
        [device_id]: {
          count: (prev[device_id]?.count || 0) + 1,
          lastTime: new Date().toLocaleTimeString(),
          error: null,
        },
      }));
      addLog(`▶ ${name || device_id} → ${res.data.topic}`, 'success');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Unknown error';
      const displayMsg = err.response?.status === 429 ? `${errMsg} (Rate limited)` : errMsg;
      setSensorStats((prev) => ({
        ...prev,
        [device_id]: { ...prev[device_id], error: displayMsg },
      }));
      addLog(`✗ ${name || device_id}: ${displayMsg}`, 'error');
    } finally {
      inflightRef.current[device_id] = false;
    }
  }, [buildData, referenceAqi, addLog]);

  const startSensorInjection = useCallback((device) => {
    const { device_id, name } = device;
    if (device_id === REFERENCE_DEVICE_ID) return;
    if (sensorIntervals.current[device_id]) return;

    runInject(device);
    sensorIntervals.current[device_id] = setInterval(() => runInject(device), cadenceMs);
    setSensorEnabled((prev) => ({ ...prev, [device_id]: true }));
    const cadenceLabel = cadenceMs === 60000 ? '60s' : '120s';
    addLog(`▶ AUTO START: ${name || device_id} (every ${cadenceLabel})`, 'info');
  }, [cadenceMs, runInject, addLog]);

  const toggleSensor = useCallback((device) => {
    const { device_id } = device;
    if (device_id === REFERENCE_DEVICE_ID) {
      addLog('Reference node uses the live DENR-EMB AQI feed (not simulated).', 'info');
      return;
    }
    if (sensorEnabled[device_id]) {
      stopSensorInjection(device_id, device.name);
    } else {
      startSensorInjection(device);
    }
  }, [sensorEnabled, startSensorInjection, stopSensorInjection, addLog]);

  const stopAllSensors = useCallback(() => {
    devices
      .filter((d) => d.device_id !== REFERENCE_DEVICE_ID)
      .forEach((d) => {
        if (sensorIntervals.current[d.device_id]) {
          stopSensorInjection(d.device_id, d.name);
        }
      });
  }, [devices, stopSensorInjection]);

  const startAllSensors = useCallback(() => {
    const nonRef = devices.filter((d) => d.device_id !== REFERENCE_DEVICE_ID);
    nonRef.forEach((device, index) => {
      setTimeout(() => startSensorInjection(device), index * 2000);
    });
    addLog(`Automated injection started for ${nonRef.length} sensor(s).`, 'info');
  }, [devices, startSensorInjection, addLog]);

  useEffect(() => {
    axios.get('/api/devices')
      .then((res) => setDevices(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        addLog(`FAILED TO FETCH DEVICES: ${err.message}`, 'error');
        setDevices([]);
      });
  }, [addLog]);

  useEffect(() => {
    return () => {
      Object.values(sensorIntervals.current).forEach(clearInterval);
      sensorIntervals.current = {};
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || devices.length === 0) return;

    Object.keys(sensorIntervals.current).forEach((id) => {
      clearInterval(sensorIntervals.current[id]);
      delete sensorIntervals.current[id];
    });

    const timer = setTimeout(() => {
      startAllSensors();
    }, 500);

    return () => clearTimeout(timer);
  }, [devices, cadenceMs, isAdmin, startAllSensors]);

  useEffect(() => {
    if (socketStatus === 'connected' && devices.length > 0 && isAdmin) {
      const timer = setTimeout(() => startAllSensors(), 1000);
      return () => clearTimeout(timer);
    }
  }, [socketStatus, devices.length, isAdmin, startAllSensors]);

  if (!isAdmin) return <AccessDenied />;

  const activeCount = Object.values(sensorEnabled).filter(Boolean).length;
  const cadenceLabel = cadenceMs === 60000 ? '60 seconds' : '2 minutes';
  const pm25Display = referenceAqi != null ? referenceAqi.toFixed(0) : '---';

  return (
    <div className="calibration-view animate-stagger" style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 0.4rem 0' }}>Calibration Settings</h2>
        <p style={{ color: 'var(--text-dim)', margin: 0 }}>
          Automated payload laboratory — Reference Node AQI drives all simulated sensors
        </p>
      </header>

      <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '2rem', border: '1px solid rgba(2, 239, 240, 0.25)', background: 'rgba(2, 239, 240, 0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: '700' }}>AUTOMATED PIPELINE ACTIVE</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Reference AQI → Payload Buffer → MQTT inject → Dashboard (no manual steps)
          </span>
          {referenceAqi != null && (
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#f59e0b', fontWeight: '800' }}>
              Live Reference AQI: {pm25Display}
            </span>
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--accent)' }}>Sensor Control Panel</h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Sensors auto-inject on startup and reconnect. Toggle OFF only to pause a node.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={stopAllSensors}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.73rem', fontWeight: '800', cursor: 'pointer' }}
            >
              PAUSE ALL
            </button>
            <button
              type="button"
              onClick={startAllSensors}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontSize: '0.73rem', fontWeight: '800', cursor: 'pointer' }}
            >
              RESUME ALL
            </button>
            <div style={{
              padding: '0.5rem 1.1rem', borderRadius: '8px',
              background: activeCount > 0 ? 'rgba(34,197,94,0.08)' : 'var(--overlay-bg)',
              border: `1px solid ${activeCount > 0 ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
              fontSize: '0.8rem', fontWeight: '800', color: activeCount > 0 ? '#22c55e' : 'var(--text-dim)',
            }}>
              {activeCount} / {devices.filter((d) => d.device_id !== REFERENCE_DEVICE_ID).length} AUTO
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--overlay-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', margin: 0 }}>INJECT CADENCE</label>
          <button type="button" onClick={() => setCadenceMs(60000)} style={cadenceBtnStyle(cadenceMs === 60000)}>60s</button>
          <button type="button" onClick={() => setCadenceMs(120000)} style={cadenceBtnStyle(cadenceMs === 120000)}>120s (2m)</button>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>Every {cadenceLabel}</div>
        </div>

        {devices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-dim)' }}>Loading sensor nodes…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: '1rem' }}>
            {devices.map((device) => {
              const isRefDevice = device.device_id === REFERENCE_DEVICE_ID;
              return (
                <SensorToggleCard
                  key={device.device_id}
                  device={device}
                  enabled={isRefDevice || !!sensorEnabled[device.device_id]}
                  stats={sensorStats[device.device_id]}
                  onToggle={() => toggleSensor(device)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: '2rem' }}>
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '1.1rem', color: 'var(--accent)' }}>Payload Buffer</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0 0 1.5rem 0' }}>
            PM2.5 is synchronized from the Reference Node in real time. Active sensors use this value (with per-site calibration) on each inject cycle.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                PM2.5 (AQI) — REFERENCE NODE
              </label>
              <input
                type="text"
                readOnly
                value={pm25Display}
                style={readOnlyInputStyle('#f59e0b')}
                title="Synchronized from DENR-EMB Reference Node — read only"
              />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                Updates automatically when Reference Node receives new AQI
              </p>
            </div>
            {['temperature', 'humidity'].map((key) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {key.toUpperCase()} — REFERENCE
                </label>
                <input
                  type="number"
                  readOnly
                  value={payload[key]}
                  style={readOnlyInputStyle()}
                  title="Synchronized from Reference Node"
                />
              </div>
            ))}
          </div>

          <div style={{ padding: '1rem', background: 'var(--overlay-bg)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent)' }}>Internal buffer fields</strong> (pm10, rssi, battery) vary slightly per inject for realism.
            PM2.5 base value always matches Reference AQI: <strong style={{ color: '#f59e0b' }}>{pm25Display}</strong>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', maxHeight: '580px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TELEMETRY LOG</h3>
            <button type="button" onClick={() => setLogs([])} style={{ fontSize: '0.65rem', color: 'var(--text-dim)', background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.6rem', cursor: 'pointer' }}>
              CLEAR
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '0.65rem', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border)', color: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : 'var(--text-dim)' }}>
                <span style={{ opacity: 0.4 }}>[{log.time}]</span> {log.msg}
              </div>
            ))}
            {logs.length === 0 && <div style={{ color: 'var(--border)' }}>Waiting for automated uplink activity…</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const cadenceBtnStyle = (active) => ({
  padding: '0.45rem 0.9rem',
  borderRadius: '6px',
  border: `1px solid ${active ? 'rgba(2,239,240,0.6)' : 'rgba(2,239,240,0.25)'}`,
  background: active ? 'rgba(2,239,240,0.12)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-dim)',
  fontSize: '0.7rem',
  fontWeight: '700',
  cursor: 'pointer',
});

const readOnlyInputStyle = (accent) => ({
  width: '100%',
  padding: '0.8rem',
  background: 'rgba(245, 158, 11, 0.08)',
  border: `1px solid ${accent ? 'rgba(245, 158, 11, 0.35)' : 'var(--border)'}`,
  borderRadius: '8px',
  color: accent || 'var(--text-dim)',
  boxSizing: 'border-box',
  cursor: 'not-allowed',
  fontWeight: 700,
});

export default Calibration;
