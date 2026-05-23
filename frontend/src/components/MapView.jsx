import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

// WHO/US-EPA Air Quality Index (PM2.5-based)
const PAQI = [
  { max: 50, color: 'var(--aqi-good)',             label: 'GOOD',              advice: 'Air quality is satisfactory, and air pollution poses little or no risk.' },
  { max: 100, color: 'var(--aqi-moderate)',         label: 'MODERATE',          advice: 'Sensitive groups: limit prolonged outdoor exertion.' },
  { max: 150, color: 'var(--aqi-sensitive)',        label: 'SENSITIVE',         advice: 'Sensitive groups should reduce outdoor exertion.' },
  { max: 200, color: 'var(--aqi-unhealthy)',        label: 'UNHEALTHY',         advice: 'Everyone may begin to experience health effects.' },
  { max: 300, color: 'var(--aqi-very-unhealthy)',   label: 'VERY UNHEALTHY',    advice: 'Health alert: everyone may experience more serious health effects.' },
  { max: Infinity, color: 'var(--aqi-hazardous)',      label: 'HAZARDOUS',         advice: 'Health warnings of emergency conditions. Stay indoors.' },
];

const getAQIInfo = (pm25) => {
  if (pm25 === null || pm25 === undefined)
    return { label: 'OFFLINE', advice: 'Sensor offline or undergoing calibration.', color: 'var(--text-dim)' };
  return PAQI.find(t => pm25 <= t.max) || PAQI[PAQI.length - 1];
};

const createGlowingIcon = (color) => {
  return new L.DivIcon({
    className: 'custom-icon',
    html: `
      <div class="aqi-marker-container" style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div class="aqi-marker-glow breathe" style="position: absolute; width: 30px; height: 30px; background: ${color}; opacity: 0.3; border-radius: 50%; filter: blur(8px);"></div>
        <div class="aqi-marker-core pulse" style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 15px ${color}; z-index: 2;"></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

const MapView = ({ readings }) => {
  const [devices, setDevices] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    axios.get('/api/devices')
      .then(res => setDevices(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        console.error('Error fetching devices:', err);
        setDevices([]);
      });
  }, []);

  // Compute live analytics
  const analytics = useMemo(() => {
    const validReadings = readings.filter(r => r && (now - new Date(r.time).getTime() < 300000));
    const count = validReadings.length;
    const pm25Avg = count > 0 ? (validReadings.reduce((sum, r) => sum + (r.pm2_5_cal || 0), 0) / count).toFixed(1) : '--';
    const status = getAQIInfo(pm25Avg === '--' ? null : Number(pm25Avg));
    
    let maxStation = 'No Data';
    let maxPm25 = 0;
    validReadings.forEach(r => {
      if(r.pm2_5_cal >= maxPm25) {
        maxPm25 = r.pm2_5_cal;
        const d = devices.find(d => d.device_id === r.device_id);
        maxStation = d ? (d.name || d.device_id) : r.device_id;
      }
    });

    return { count, pm25Avg, status, maxStation, maxPm25: maxPm25 ? maxPm25.toFixed(1) : '--' };
  }, [readings, devices, now]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', background: 'var(--bg)' }}>
      
      {/* Analytics Overlay Panel */}
      <div className="glass-panel" style={{
        position: 'absolute', top: '20px', right: '20px', zIndex: 1000,
        padding: '1.5rem', width: '320px', display: 'flex', flexDirection: 'column', gap: '1rem',
        boxShadow: '0 4px 15px var(--shadow)', border: '1px solid var(--border)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Spatial Analytics</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Real-time Iligan Area Aggregation</p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ background: 'var(--overlay-bg)', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem', letterSpacing: '1px', fontWeight: 'bold' }}>AVG PM2.5</div>
            <div style={{ fontSize: '1.6rem', color: analytics.status.color, fontWeight: 'bold' }}>{analytics.pm25Avg} <span style={{fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal'}}>µg</span></div>
          </div>
          <div style={{ background: 'var(--overlay-bg)', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem', letterSpacing: '1px', fontWeight: 'bold' }}>ACTIVE NODES</div>
            <div style={{ fontSize: '1.6rem', color: 'var(--text)', fontWeight: 'bold' }}>{analytics.count} <span style={{fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'normal'}}>/ {devices.length}</span></div>
          </div>
        </div>

        <div style={{ background: 'var(--overlay-bg)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${analytics.status.color}` }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.2rem', letterSpacing: '1px', fontWeight: 'bold' }}>CITY WIDE STATUS</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 'bold' }}>{analytics.status.label}</div>
        </div>

        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: '#ef4444', marginBottom: '0.5rem', letterSpacing: '1px', fontWeight: 'bold' }}>LOCAL PM2.5 HOTSPOT</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: '1.2rem', color: '#ef4444', fontWeight: 'bold' }}>{analytics.maxPm25} <span style={{fontSize: '0.65rem', color: 'var(--text-dim)'}}>µg</span></div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px' }}>{analytics.maxStation}</div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: showHeatmap ? 'white' : 'var(--text-dim)' }}>
            <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} style={{accentColor: 'var(--accent)'}} />
            Predictive Heatmap
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: showSensors ? 'white' : 'var(--text-dim)' }}>
            <input type="checkbox" checked={showSensors} onChange={e => setShowSensors(e.target.checked)} style={{accentColor: 'var(--accent)'}} />
            Sensor Nodes
          </label>
        </div>
      </div>

      <MapContainer 
        center={[8.2280, 124.2452]} 
        zoom={12} 
        zoomControl={false}
        style={{ height: '100%', width: '100%', background: 'var(--bg)' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Heatmap Overlay Layer via Concentric Gradients */}
        {showHeatmap && devices.map(device => {
          const reading = readings.find(r => r.device_id === device.device_id);
          const pm25 = reading ? reading.pm2_5_cal : null;
          if (pm25 === null) return null;
          
          const info = getAQIInfo(pm25);
          return (
            <Fragment key={`heat-${device.device_id}`}>
              {/* Core */}
              <Circle center={[device.lat, device.lng]} radius={1500} pathOptions={{color: 'transparent', fillColor: info.color, fillOpacity: 0.15}} interactive={false} />
              {/* Mid bloom */}
              <Circle center={[device.lat, device.lng]} radius={3000} pathOptions={{color: 'transparent', fillColor: info.color, fillOpacity: 0.08}} interactive={false} />
              {/* Far bloom */}
              <Circle center={[device.lat, device.lng]} radius={5000} pathOptions={{color: 'transparent', fillColor: info.color, fillOpacity: 0.03}} interactive={false} />
            </Fragment>
          );
        })}
        
        {/* Physical Sensor Nodes */}
        {showSensors && devices.map(device => {
          const reading = readings.find(r => r.device_id === device.device_id);
          const pm25 = reading ? reading.pm2_5_cal : null;
          const info = getAQIInfo(pm25);
          const color = info.color;
          
          return (
            <Marker 
              key={device.device_id}
              position={[device.lat, device.lng]}
              icon={createGlowingIcon(color)}
            >
              <Popup className="glass-popup">
                <div style={{ 
                  minWidth: '240px', maxWidth: '280px',
                  padding: '0.5rem', 
                  background: 'none', 
                  color: 'var(--text)',
                  fontFamily: '"Times New Roman", Times, serif'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>{device.name || device.device_id}</h4>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--overlay-bg-hover)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>STATION</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: info.color, fontWeight: 'bold', marginTop: '0.4rem', letterSpacing: '0.5px' }}>
                      {info.label} AQI
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div className="glass-panel" style={{ padding: '0.6rem', textAlign: 'center', background: 'var(--overlay-bg)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>PM2.5</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: color }}>{pm25 ? pm25.toFixed(1) : '---'}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.6rem', textAlign: 'center', background: 'var(--overlay-bg)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>PM10</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{reading?.pm10 ? reading.pm10.toFixed(1) : '---'}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.6rem', textAlign: 'center', background: 'var(--overlay-bg)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>TEMP</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{reading?.temperature ? reading.temperature.toFixed(1) + '°' : '---'}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.6rem', textAlign: 'center', background: 'var(--overlay-bg)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>HUMIDITY</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{reading?.humidity ? reading.humidity.toFixed(1) + '%' : '---'}</div>
                    </div>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.8rem', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
                      <strong style={{color: 'var(--text)'}}>Health Advisory:</strong> {info.advice}
                    </p>
                  </div>

                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                    SYNCED: {reading ? new Date(reading.time).toLocaleTimeString() : 'OFFLINE'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      <style>{`
        .heatmap-blur {
          filter: blur(50px);
          transition: fill 2s ease, fill-opacity 2s ease;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: var(--panel) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid var(--border) !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 15px var(--shadow) !important;
        }
        .leaflet-popup-content { margin: 12px !important; }
      `}</style>
    </div>
  );
};

export default MapView;
