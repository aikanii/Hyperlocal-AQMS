import { useState, useEffect } from 'react';
import axios from 'axios';
import { getDisplayPm25, getPm25Unit, isReferenceDevice, formatPm25 } from '../utils/referenceNode';

// Decodes the JWT and checks if it is still valid (not expired).
const getValidToken = () => {
  const token = localStorage.getItem('aqms_token');
  if (!token) {
    alert('You must be logged in as admin to perform this action.');
    return null;
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem('aqms_token');
      alert('Your session has expired. Please log in again to continue.');
      return null;
    }
  } catch {
    // If decoding fails the token is malformed — let the server reject it.
  }
  return token;
};

const Devices = ({ isAdmin = false, readings = [] }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    device_id: '',
    name: '',
    lat: 8.2281, // Defaulting to Iligan center
    lng: 124.2443,
    status: 'active',
    region: 'All',
    pm2_5_slope: 1.0,
    pm2_5_intercept: 0.0
  });

  const fetchDevices = async () => {
    try {
      const res = await axios.get('/api/devices');
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleOpenModal = (device = null) => {
    if (device) {
      setEditingDevice(device);
      setFormData({
        device_id: device.device_id,
        name: device.name,
        lat: device.lat,
        lng: device.lng,
        status: device.status,
        region: device.region || 'All',
        pm2_5_slope: device.calibration_coefficients?.pm2_5_slope || 1.0,
        pm2_5_intercept: device.calibration_coefficients?.pm2_5_intercept || 0.0
      });
    } else {
      setEditingDevice(null);
      setFormData({
        device_id: '',
        name: '',
        lat: 8.2281,
        lng: 124.2443,
        status: 'active',
        region: 'All',
        pm2_5_slope: 1.0,
        pm2_5_intercept: 0.0
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getValidToken();
    if (!token) return;
    const config = { headers: { Authorization: `Bearer ${token}` } };
    
    const payload = {
      device_id: formData.device_id,
      name: formData.name,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      status: formData.status,
      region: formData.region,
      calibration_coefficients: {
        pm2_5_slope: parseFloat(formData.pm2_5_slope),
        pm2_5_intercept: parseFloat(formData.pm2_5_intercept)
      }
    };

    try {
      if (editingDevice) {
        await axios.put(`/api/devices/${editingDevice.device_id}`, payload, config);
      } else {
        await axios.post('/api/devices', payload, config);
      }
      setModalOpen(false);
      fetchDevices();
    } catch (err) {
      alert(`Error: ${err.response?.data?.error || 'Failed to save device'}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure you want to delete device ${id}?`)) return;
    const token = getValidToken();
    if (!token) return;
    const config = { headers: { Authorization: `Bearer ${token}` } };
    
    try {
      await axios.delete(`/api/devices/${id}`, config);
      fetchDevices();
    } catch {
      alert('Failed to delete device. Ensure you are logged in as admin.');
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading devices...</div>;

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header Section */}
      <div className="devices-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', fontWeight: '800' }}>
            {isAdmin ? '🔌 Device Management' : '📡 Monitoring Network'}
          </h2>
          <p style={{ color: 'var(--text-dim)', margin: 0 }}>
            {isAdmin ? 'Advanced hardware diagnostics and calibration control' : 'Explore our hyper-local sensor deployment sites'}
          </p>
        </div>
        
        {isAdmin ? (
          <button
            onClick={() => handleOpenModal()}
            className="hover-lift"
            style={{ 
              padding: '0.8rem 1.5rem', 
              background: 'var(--brand-gradient)', 
              color: 'var(--bg)', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              boxShadow: '0 4px 15px rgba(2, 239, 240, 0.3)'
            }}
          >
            + Register New Device
          </button>
        ) : (
          <div style={{
            padding: '0.6rem 1.2rem',
            background: 'var(--overlay-bg)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
            {devices.filter(d => d.status === 'active').length} Active Stations
          </div>
        )}
      </div>

      {!isAdmin ? (
        /* PUBLIC VIEW: Premium Station Gallery */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
          {devices.map(device => {
            const isReference = isReferenceDevice(device.device_id);
            const latest = readings.find(r => r.device_id === device.device_id);
            const pm25Value = getDisplayPm25(latest, device.device_id);
            const pm25Unit = getPm25Unit(device.device_id);
            const pm25Display = formatPm25(pm25Value, device.device_id);
            const isOffline = device.status !== 'active' || (latest && (new Date() - new Date(latest.time)) > 600000);
            
            return (
              <div key={device.device_id} className="glass-panel hover-lift animate-stagger" style={{ 
                padding: '2rem', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
                border: isReference ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--border)',
                background: isReference ? 'rgba(245,158,11,0.05)' : 'var(--panel)',
                boxShadow: isReference ? '0 0 20px rgba(245,158,11,0.1)' : 'none'
              }}>
                {/* Status Indicator Top Right */}
                <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div className={!isOffline ? 'pulse' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOffline ? '#ef4444' : '#10b981' }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isOffline ? '#ef4444' : '#10b981', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {isOffline ? 'Offline' : 'Online'}
                  </span>
                </div>

                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem', fontWeight: '800', color: isReference ? '#f59e0b' : 'var(--text)' }}>
                  {device.name} {isReference && <span style={{ fontSize: '0.65rem', marginLeft: '0.6rem', color: '#ffffff', background: '#f59e0b', padding: '0.15rem 0.4rem', borderRadius: '6px', fontWeight: '700' }}>DENR-EMB Reference</span>}
                </h3>

                {/* Sensor Suite Icons */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', padding: '1rem', background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div title="Particulate Matter (PM2.5, PM10)" style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>🌫️</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>PM SUITE</div>
                  </div>
                  <div title="Ambient Environment" style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>🌡️</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>AMB SUITE</div>
                  </div>
                  <div title="Telemetry" style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>📡</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>RADIO</div>
                  </div>
                </div>

                {/* Key Metrics Quick View */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ padding: '0.8rem', background: 'var(--accent-bg)', borderRadius: '8px', border: '1px solid rgba(2, 239, 240, 0.1)' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.2rem' }}>PM2.5</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800' }}>{pm25Display} <small style={{fontSize: '0.6rem', fontWeight: 'normal'}}>{pm25Unit}</small></div>
                  </div>
                  <div style={{ padding: '0.8rem', background: 'var(--overlay-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '0.2rem' }}>TEMP</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800' }}>{latest?.temperature?.toFixed(1) || '---'}°C</div>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  {device.status === 'active' ? 'Verified operational data' : 'Station currently undergoing maintenance'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ADMIN VIEW: High-Density Technical Management */
        <div className="glass-panel" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--panel)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Device ID</th>
                <th style={{ padding: '1rem' }}>Name</th>
                <th style={{ padding: '1rem' }}>Location</th>
                <th style={{ padding: '1rem' }}>Calibration (m, c)</th>
                <th style={{ padding: '1rem' }}>Sensors Health</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(device => {
                const isReference = isReferenceDevice(device.device_id);
                const latest = readings.find(r => r.device_id === device.device_id);
                const now = new Date();
                const lastSeen = latest ? new Date(latest.time) : null;
                const isStale = lastSeen && (now - lastSeen) > 600000; // 10 mins
                const isMissing = !latest;

                const check = (val, type) => {
                  if (isMissing) return 'gray';
                  if (isStale) return '#64748b';
                  if (val === null || val === undefined) return '#ef4444'; // Red
                  if (type === 'rssi' && val < -90) return '#f59e0b'; // Orange
                  if (type === 'batt' && val < 3300) return '#f59e0b'; // Orange
                  return '#10b981'; // Green
                };

                return (
                  <tr key={device.device_id} style={{ 
                    borderBottom: '1px solid var(--border)',
                    background: isReference ? 'rgba(245,158,11,0.08)' : 'transparent'
                  }}>
                    <td style={{ padding: '1rem' }}><code>{device.device_id}</code>{isReference && <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '4px', fontWeight: 'bold' }}>⭐ Reference Grade</div>}</td>
                    <td style={{ padding: '1rem', fontWeight: '500', color: isReference ? '#f59e0b' : 'inherit' }}>{device.name}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-dim)' }}>{device.lat.toFixed(4)}, {device.lng.toFixed(4)}</td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                      {device.calibration_coefficients?.pm2_5_slope || 1.0}x + {device.calibration_coefficients?.pm2_5_intercept || 0.0}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div title="PM Sensors" style={{ width: '8px', height: '8px', borderRadius: '50%', background: check(latest?.pm2_5_cal) }} />
                        <div title="Ambient Sensors" style={{ width: '8px', height: '8px', borderRadius: '50%', background: check(latest?.temperature) }} />
                        <div title="Network (RSSI)" style={{ width: '8px', height: '8px', borderRadius: '50%', background: check(latest?.rssi_dbm, 'rssi') }} />
                        <div title="Power (Battery)" style={{ width: '8px', height: '8px', borderRadius: '50%', background: check(latest?.battery_mv, 'batt') }} />
                        {isStale && <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: '4px' }}>OFFLINE</span>}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                        background: device.status === 'active' ? 'rgba(2,239,240,0.1)' : 'rgba(245,158,11,0.1)',
                        color: device.status === 'active' ? 'var(--accent)' : '#f59e0b',
                        textTransform: 'uppercase', border: device.status === 'active' ? '1px solid rgba(2,239,240,0.2)' : '1px solid rgba(245,158,11,0.2)'
                      }}>
                        {device.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button onClick={() => handleOpenModal(device)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginRight: '1rem', fontWeight: 'bold' }}>Edit</button>
                      <button onClick={() => handleDelete(device.device_id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && modalOpen && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 
        }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '450px', background: 'var(--bg)' }}>
            <h3 style={{ marginTop: 0 }}>{editingDevice ? '✏️ Edit Device' : '➕ Register Device'}</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Device ID (Unique)</label>
                <input 
                  disabled={!!editingDevice}
                  value={formData.device_id} 
                  onChange={e => setFormData({...formData, device_id: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} 
                  required 
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Display Name</label>
                <input 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} 
                  required 
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Lat</label>
                  <input type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Lng</label>
                  <input type="number" step="any" value={formData.lng} onChange={e => setFormData({...formData, lng: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} required />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Assigned Barangay / Region</label>
                <select 
                  value={formData.region} 
                  onChange={e => setFormData({...formData, region: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} 
                >
                  <option value="All">All of Iligan City</option>
                  <option value="Poblacion">Poblacion</option>
                  <option value="Tibanga">Tibanga</option>
                  <option value="Pala-o">Pala-o</option>
                  <option value="Tambacan">Tambacan</option>
                  <option value="Suarez">Suarez</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>PM2.5 Slope (m)</label>
                  <input type="number" step="any" value={formData.pm2_5_slope} onChange={e => setFormData({...formData, pm2_5_slope: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>Intercept (c)</label>
                  <input type="number" step="any" value={formData.pm2_5_intercept} onChange={e => setFormData({...formData, pm2_5_intercept: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }} required />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" onClick={() => setModalOpen(false)} style={{ padding: '0.6rem 1.2rem', background: 'var(--overlay-bg-hover)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.2rem', background: 'var(--brand-gradient)', color: 'var(--bg)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Devices;
