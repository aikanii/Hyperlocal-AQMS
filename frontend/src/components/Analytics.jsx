import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// WHO/US-EPA Air Quality Index (PM2.5-based)
const PAQI = [
  { max: 50, color: 'var(--aqi-good)', label: 'Good' },
  { max: 100, color: 'var(--aqi-moderate)', label: 'Moderate' },
  { max: 150, color: 'var(--aqi-sensitive)', label: 'Sensitive' },
  { max: 200, color: 'var(--aqi-unhealthy)', label: 'Unhealthy' },
  { max: 300, color: 'var(--aqi-very-unhealthy)', label: 'Very Unhealthy' },
  { max: Infinity, color: 'var(--aqi-hazardous)', label: 'Hazardous' },
];

const getAQIColor = (pm25) => {
  if (pm25 === null || pm25 === undefined) return 'var(--text-dim)';
  return (PAQI.find(t => pm25 <= t.max) || PAQI[PAQI.length - 1]).color;
};

const Analytics = () => {
  const { isAdmin } = useAuth();
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [stats, setStats] = useState([]);
  const [readings, setReadings] = useState([]);
  const [predictions, setPredictions] = useState([]);
  // 'idle' | 'warming_up' | 'ready' | 'error'
  const [mlStatus, setMlStatus] = useState('idle');
  const [range, setRange] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await axios.get('/api/devices');
        const devicesData = Array.isArray(res.data) ? res.data : [];
        setDevices(devicesData);
        if (devicesData.length > 0) {
          setSelectedDeviceId(devicesData[0].device_id);
        }
      } catch (err) {
        console.error('Error fetching devices:', err);
        setDevices([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;

    const fetchDetails = async () => {
      setDetailsLoading(true);
      try {
        const [statsRes, readingsRes] = await Promise.all([
          axios.get(`/api/stats/device/${selectedDeviceId}?range=${range}`),
          axios.get(`/api/readings?device_id=${selectedDeviceId}&limit=50`),
        ]);
        setStats(Array.isArray(statsRes.data) ? statsRes.data : []);
        setReadings(Array.isArray(readingsRes.data) ? readingsRes.data : []);

        // Handle ML prediction separately so a 503 never blocks stats/readings
        try {
          const mlRes = await axios.get(`/api/ml/predict/device/${selectedDeviceId}`);
          setPredictions(Array.isArray(mlRes.data) ? mlRes.data : []);
          setMlStatus('ready');
        } catch (mlErr) {
          if (mlErr.response?.status === 503) {
            // Model is still training — expected on cold start, not an error
            setPredictions([]);
            setMlStatus('warming_up');
          } else {
            console.error('ML prediction error:', mlErr);
            setPredictions([]);
            setMlStatus('error');
          }
        }
      } catch (err) {
        console.error('Error fetching device details:', err);
        setStats([]);
        setReadings([]);
        setPredictions([]);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
  }, [selectedDeviceId, range]);

  const selectedDevice = devices.find(d => d.device_id === selectedDeviceId);

  const pastLabels = stats.map(s => {
    const date = new Date(s.bucket);
    if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '7d') return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }).reverse();

  const pastPm25 = stats.map(s => s.avg_pm2_5).reverse();
  const pastPm10 = stats.map(s => s.avg_pm10).reverse();

  // Add prediction data
  const futureLabels = predictions.map(p => {
    const date = new Date(p.time);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  const futurePm25 = predictions.map(p => p.pm2_5_cal);

  // Pad arrays with nulls so they align on the X-axis
  const pm25Data = [...pastPm25, ...Array(futureLabels.length).fill(null)];
  const pm10Data = [...pastPm10, ...Array(futureLabels.length).fill(null)];
  const predictedPm25Data = pastPm25.length > 0
    ? [...Array(pastLabels.length - 1).fill(null), pastPm25[pastPm25.length - 1], ...futurePm25]
    : [];

  const chartData = {
    labels: [...pastLabels, ...futureLabels],
    datasets: [
      {
        fill: true,
        label: 'PM2.5 (Historical)',
        data: pm25Data,
        borderColor: '#02EFF0',
        backgroundColor: 'var(--accent-bg-hover)',
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#0F282F',
        pointBorderColor: '#02EFF0',
      },
      {
        fill: false,
        label: 'PM2.5 (AI Forecast)',
        data: predictedPm25Data,
        borderColor: '#f59e0b',
        borderWidth: 3,
        borderDash: [5, 5],
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#0F282F',
        pointBorderColor: '#f59e0b',
      },
      {
        fill: true,
        label: 'PM10 (Historical)',
        data: pm10Data,
        borderColor: 'rgba(148, 163, 184, 0.6)',
        backgroundColor: 'rgba(148, 163, 184, 0.05)',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.4,
        pointRadius: 0,
      }
    ]
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { display: true, position: 'top', labels: { color: 'var(--text-dim)', usePointStyle: true, boxWidth: 6 } },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: 'var(--text-dim)', font: { size: 10 } } },
      y: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-dim)', font: { size: 10 } }, beginAtZero: true }
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)' }}>Initializing neural links...</div>;

  return (
    <div className="analytics-view" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Device Selection Sidebar */}
      <aside className="analytics-sidebar" style={{ width: '300px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--overlay-bg)' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>Sensor Placements</h3>
        </div>
        <div className="analytics-sidebar-list" style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {devices.map(device => {
            const isRef = device.device_id === 'denr_emb_x_reference_001';
            const isSelected = selectedDeviceId === device.device_id;
            return (
            <button
              key={device.device_id}
              onClick={() => setSelectedDeviceId(device.device_id)}
              className={`nav-btn ${isSelected ? 'active' : ''}`}
              style={{
                width: '100%',
                padding: '1rem',
                marginBottom: '0.5rem',
                background: isSelected && isRef ? 'rgba(245,158,11,0.15)' : isSelected ? 'var(--accent-bg-hover)' : isRef ? 'rgba(245,158,11,0.05)' : 'transparent',
                border: '1px solid',
                borderColor: isSelected && isRef ? '#f59e0b' : isSelected ? 'var(--accent-border)' : isRef ? 'rgba(245,158,11,0.3)' : 'transparent',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                color: isSelected && isRef ? '#f59e0b' : isSelected ? 'var(--accent)' : isRef ? '#f59e0b' : 'var(--text-dim)',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {device.name}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>ID: {device.device_id}</div>
              {isRef && <div style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '0.8rem' }}>⭐</div>}
            </button>
          )})}
        </div>
      </aside>

      {/* Main Analysis Area */}
      <main className="analytics-main" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', position: 'relative' }}>
        {detailsLoading && (
          <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.7rem', color: 'var(--accent)' }}>
            <span className="breathe">FETCHING DATA...</span>
          </div>
        )}

        {selectedDevice ? (
          <div className="animate-stagger">
            <header style={{ marginBottom: '2.5rem' }}>
              <div className="analytics-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center' }}>
                    {selectedDevice.name}
                    {selectedDevice.device_id === 'denr_emb_x_reference_001' && (
                      <span style={{ fontSize: '0.85rem', marginLeft: '0.8rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: '700', border: '1px solid rgba(245,158,11,0.3)', verticalAlign: 'middle' }}>⭐ REFERENCE GRADE</span>
                    )}
                  </h2>
                  <p style={{ color: 'var(--text-dim)', margin: 0 }}>
                    Coordinates: {selectedDevice.lat.toFixed(4)}, {selectedDevice.lng.toFixed(4)} • Status:
                    <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontWeight: 'bold' }}>{selectedDevice.status.toUpperCase()}</span>
                  </p>
                </div>
                <a
                  href={`/api/export?device_id=${selectedDeviceId}`}
                  download={`${selectedDeviceId}-data.csv`}
                  className="glass-panel hover-lift"
                  style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 'bold', border: '1px solid var(--accent)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export CSV
                </a>
              </div>
            </header>

            {/* Recent Metrics */}
            <div className="analytics-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.8rem' }}>PM2.5</div>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: getAQIColor(readings[0]?.pm2_5_cal) }}>
                  {readings[0]?.pm2_5_cal?.toFixed(1) || '---'}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.3rem' }}>µg/m³</span>
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Temperature</div>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text)' }}>
                  {readings[0]?.temperature?.toFixed(1) || '---'}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.3rem' }}>°C</span>
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Humidity</div>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--accent)' }}>
                  {readings[0]?.humidity?.toFixed(1) || '---'}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.3rem' }}>%</span>
                </div>
              </div>
              {isAdmin && (
                <>
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Signal (RSSI)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#10b981' }}>
                      {readings[0]?.rssi_dbm || '---'}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.3rem' }}>dBm</span>
                    </div>
                  </div>
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Battery</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f59e0b' }}>
                      {(readings[0]?.battery_mv / 1000)?.toFixed(2) || '---'}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '0.3rem' }}>V</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Trend Chart */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {range === '24h' ? '24-Hour' : range === '7d' ? '7-Day' : '30-Day'} Analysis Trend
                </h3>
                <div className="glass-panel" style={{ display: 'flex', padding: '4px', gap: '4px', background: 'var(--overlay-bg)' }}>
                  {['24h', '7d', '30d'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      style={{
                        padding: '6px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        background: range === r ? 'var(--accent)' : 'transparent',
                        color: range === r ? '#0F282F' : 'var(--text-dim)',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* ML status notice — shown inside the chart panel, above the chart */}
              {mlStatus === 'warming_up' && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontSize: '0.8rem',
                  color: '#f59e0b',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  AI model is training on first startup — forecast will appear automatically once ready.
                </div>
              )}
              {mlStatus === 'error' && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: '0.8rem',
                  color: '#ef4444',
                }}>
                  AI forecast unavailable. Check ml-service logs for details.
                </div>
              )}

              <div style={{ height: '350px' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* Raw Reading Table */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Recent Sensor Readings</h3>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                    <tr style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      <th style={{ padding: '1rem' }}>Timestamp</th>
                      <th style={{ padding: '1rem' }}>PM2.5 (Cal)</th>
                      <th style={{ padding: '1rem' }}>PM10</th>
                      <th style={{ padding: '1rem' }}>Temp</th>
                      <th style={{ padding: '1rem' }}>Hum</th>
                      {isAdmin && <th style={{ padding: '1rem' }}>RSSI</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                        <td style={{ padding: '0.8rem 1rem' }}>{new Date(r.time).toLocaleString()}</td>
                        <td style={{ padding: '0.8rem 1rem', color: getAQIColor(r.pm2_5_cal), fontWeight: 'bold' }}>{r.pm2_5_cal?.toFixed(2)}</td>
                        <td style={{ padding: '0.8rem 1rem' }}>{r.pm10?.toFixed(2)}</td>
                        <td style={{ padding: '0.8rem 1rem' }}>{r.temperature?.toFixed(1)}°C</td>
                        <td style={{ padding: '0.8rem 1rem' }}>{r.humidity?.toFixed(1)}%</td>
                        {isAdmin && <td style={{ padding: '0.8rem 1rem', color: '#10b981' }}>{r.rssi_dbm}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <h3>Select a sensor placement to begin analysis</h3>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Analytics;