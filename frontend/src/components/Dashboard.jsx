import { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import WeatherWidget from './WeatherWidget';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// WHO/US-EPA Air Quality Index (PM2.5-based)
const PAQI = [
  { max: 50, color: 'var(--aqi-good)',             label: 'Good',              advice: 'Air quality is satisfactory, and air pollution poses little or no risk.' },
  { max: 100, color: 'var(--aqi-moderate)',         label: 'Moderate',          advice: 'Sensitive groups: limit prolonged outdoor exertion.' },
  { max: 150, color: 'var(--aqi-sensitive)',        label: 'Sensitive',         advice: 'Sensitive groups should reduce outdoor exertion.' },
  { max: 200, color: 'var(--aqi-unhealthy)',        label: 'Unhealthy',         advice: 'Everyone may begin to experience health effects.' },
  { max: 300, color: 'var(--aqi-very-unhealthy)',   label: 'Very Unhealthy',    advice: 'Health alert: everyone may experience more serious health effects.' },
  { max: Infinity, color: 'var(--aqi-hazardous)',      label: 'Hazardous',         advice: 'Health warnings of emergency conditions. Stay indoors.' },
];

const getPAQI = (pm25) => {
  if (pm25 === null || pm25 === undefined) return { color: 'var(--text-dim)', label: '---', advice: '' };
  return PAQI.find(t => pm25 <= t.max) || PAQI[PAQI.length - 1];
};

const getAQIColor = (pm25) => getPAQI(pm25).color;

const Dashboard = ({ readings }) => {
  const [stats, setStats] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [range, setRange] = useState('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, mlRes] = await Promise.all([
          axios.get(`/api/stats/city?range=${range}`),
          axios.get('/api/ml/predict/city').catch(() => {
            console.warn('ML Prediction not available yet');
            return { data: [] };
          })
        ]);
        setStats(Array.isArray(statsRes.data) ? statsRes.data : []);
        setPredictions(Array.isArray(mlRes.data) ? mlRes.data : []);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setStats([]);
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    
    // Listen for dynamic ML prediction updates
    const socket = io(window.location.origin, { path: '/socket.io/' });
    socket.on('prediction_update', (newPredictions) => {
      setPredictions(newPredictions);
    });

    return () => socket.disconnect();
  }, [range]);

  const sensorReadings = readings.filter(r => r.device_id !== 'denr_emb_x_reference_001');
  const liveAvg = sensorReadings.length > 0 ? {
    pm1_0: sensorReadings.reduce((sum, r) => sum + (r.pm1_0 || 0), 0) / sensorReadings.length,
    pm2_5: sensorReadings.reduce((sum, r) => sum + (r.pm2_5_cal || 0), 0) / sensorReadings.length,
    pm10: sensorReadings.reduce((sum, r) => sum + (r.pm10 || 0), 0) / sensorReadings.length,
    temp: sensorReadings.reduce((sum, r) => sum + (r.temperature || 0), 0) / sensorReadings.length,
    hum: sensorReadings.reduce((sum, r) => sum + (r.humidity || 0), 0) / sensorReadings.length
  } : { pm1_0: null, pm2_5: null, pm10: null, temp: null, hum: null };

  const aqiColor = getAQIColor(liveAvg.pm2_5);
  const sortedStats = [...stats].sort((a, b) => new Date(a.bucket) - new Date(b.bucket));

  const pastLabels = sortedStats.map(s => {
    const date = new Date(s.bucket);
    if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '7d') return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });

  const pastPm25 = sortedStats.map(s => s.avg_pm2_5);
  const pastPm10 = sortedStats.map(s => s.avg_pm10);

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
        pointRadius: 4,
        pointBackgroundColor: '#0F282F',
        pointBorderColor: '#02EFF0',
        pointBorderWidth: 2,
        tension: 0.4
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
        pointRadius: 0,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { color: '#ffffff', usePointStyle: true, boxWidth: 6 } },
      tooltip: {
        backgroundColor: 'transparent',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 10 } } },
      y: { grid: { color: 'var(--border)' }, ticks: { color: '#ffffff', font: { size: 10 } }, beginAtZero: true }
    }
  };

  // Historical Insights Calculation
  const validStats = stats.filter(s => s.avg_pm2_5 != null);
  const peakPm25Stat = validStats.length ? validStats.reduce((prev, curr) => (parseFloat(prev.avg_pm2_5) > parseFloat(curr.avg_pm2_5) ? prev : curr)) : null;
  const avgTemp24h = validStats.length ? (validStats.reduce((sum, s) => sum + Number(s.avg_temperature), 0) / validStats.length).toFixed(1) : '---';
  
  const maxPredictedPm25 = predictions.length > 0 
    ? Math.max(...predictions.map(p => p.pm2_5_cal))
    : null;
  const predictedAqiColor = maxPredictedPm25 !== null ? getAQIColor(maxPredictedPm25) : 'var(--text-dim)';
  
  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)' }}>Syncing atmospheric data...</div>;

  return (
    <div className="dashboard-view animate-stagger" style={{ padding: '3rem', maxWidth: '1400px', margin: '0 auto', animationDelay: '0.1s' }}>
      <header style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0 0 0.5rem 0' }}>City Environment</h2>
        <p style={{ color: 'var(--text-dim)', margin: 0 }}>Real-time spatial average across {sensorReadings.length} stations</p>
      </header>
      
      <WeatherWidget />
      
      <div className="stat-grid animate-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem', animationDelay: '0.2s' }}>
        <div className="glass-panel hover-lift" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>Ultrafine (PM1.0)</div>
          <div style={{ fontSize: '2.8rem', fontWeight: '900', color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            {liveAvg.pm1_0?.toFixed(1) || '---'}
            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>µg/m³</span>
          </div>
        </div>

        <div className="glass-panel hover-lift" style={{ padding: '1.5rem', boxShadow: `0 0 30px ${aqiColor}15`, borderTop: `4px solid ${aqiColor}` }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>Fine (PM2.5)</div>
          <div style={{ fontSize: '2.8rem', fontWeight: '900', color: aqiColor, display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            {liveAvg.pm2_5?.toFixed(1) || '---'}
            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>µg/m³</span>
          </div>
          <div style={{ marginTop: '0.8rem', display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', background: `${aqiColor}22`, color: aqiColor, fontWeight: 'bold' }}>
            {getPAQI(liveAvg.pm2_5).label}
          </div>
        </div>

        <div className="glass-panel hover-lift" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>Coarse (PM10)</div>
          <div style={{ fontSize: '2.8rem', fontWeight: '900', color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            {liveAvg.pm10?.toFixed(1) || '---'}
            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>µg/m³</span>
          </div>
        </div>

        <div className="glass-panel hover-lift" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>Ambient Temp</div>
          <div style={{ fontSize: '2.8rem', fontWeight: '900', color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            {liveAvg.temp?.toFixed(1) || '---'}
            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>°C</span>
          </div>
        </div>

        <div className="glass-panel hover-lift" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>Rel. Humidity</div>
          <div style={{ fontSize: '2.8rem', fontWeight: '900', color: 'var(--accent)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            {liveAvg.hum?.toFixed(1) || '---'}
            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>%</span>
          </div>
        </div>
      </div>

      <div className="trends-grid animate-stagger" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1.5rem', animationDelay: '0.3s' }}>
        <div className="glass-panel hover-lift" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {range === '24h' ? '24-Hour' : range === '7d' ? '7-Day' : '30-Day'} Pollutant Trends
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
          <div style={{ height: '350px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel hover-lift" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.5rem' }}>{range.toUpperCase()} PM2.5 PEAK</div>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: getAQIColor(peakPm25Stat?.avg_pm2_5) }}>
              {peakPm25Stat ? peakPm25Stat.avg_pm2_5 : '---'} <span style={{fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 'normal'}}>µg/m³</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Occurred: <strong style={{color: 'var(--text)'}}>{peakPm25Stat?.bucket ? new Date(peakPm25Stat.bucket).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</strong></div>
          </div>
          
          <div className="glass-panel hover-lift" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: predictedAqiColor }}></div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.5rem' }}>
              AI PREDICTED PEAK PM2.5 (24H)
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: predictedAqiColor }}>
              {maxPredictedPm25 !== null ? maxPredictedPm25.toFixed(1) : '---'} <span style={{fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 'normal'}}>µg/m³</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Status: <strong style={{color: predictedAqiColor}}>{getPAQI(maxPredictedPm25).label}</strong></div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flex: 1 }}>
            <div className="glass-panel hover-lift" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--accent-bg)', border: '1px solid rgba(2, 239, 240, 0.2)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.5rem' }}>{range.toUpperCase()} AVG TEMP</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--accent)' }}>
                {avgTemp24h} <span style={{fontSize: '0.9rem', opacity: 0.7, fontWeight: 'normal'}}>°C</span>
              </div>
            </div>

            <a href="/api/export" download="HY-AQMS-Dataset.csv" className="glass-panel hover-lift" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textDecoration: 'none', background: 'var(--accent)', color: '#0F282F', cursor: 'pointer', transition: 'all 0.3s ease' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '0.5rem'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <div style={{ fontSize: '0.8rem', fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Export<br/>Dataset</div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
