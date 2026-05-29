import React, { useState, useEffect, useMemo } from 'react'
import io from 'socket.io-client'
import axios from 'axios'
import { AuthProvider, useAuth } from './contexts/AuthContext'

const VALID_REGION_IDS = ['all', 'Poblacion', 'Tibanga', 'Pala-o', 'Tambacan', 'Suarez'];

const getApiBaseUrlClient = () => {
  if (typeof window === 'undefined') return 'http://localhost:3000';
  const localOverride = window.localStorage.getItem('aqms_api_url');
  if (localOverride) return localOverride;
  const prodConfigUrl = window.localStorage.getItem('aqms_production_api_url');
  if (prodConfigUrl && prodConfigUrl !== 'https://dashboard.yourdomain.com') return prodConfigUrl;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.location.hostname.endsWith('.vercel.app')) return 'http://localhost:3000';
  return window.location.origin;
};

// Components
import Dashboard from './components/Dashboard'
import MapView from './components/MapView'
import Devices from './components/Devices'
import Simulation from './components/Simulation'
import Docs from './components/Docs'
import Analytics from './components/Analytics'
import LoadingScreen from './components/LoadingScreen'
import DigitalClock from './components/DigitalClock'
import RegionSelector from './components/RegionSelector'
import DataFlow from './components/DataFlow'

// ---------------------------------------------------------------------------
// AccessNotification — premium pop-up for auth state changes
// ---------------------------------------------------------------------------
const AccessNotification = ({ message, type }) => {
  if (!message) return null;
  return (
    <div className="access-notification">
      <h2>{type === 'login' ? '✔ ACCESS GRANTED' : '👁 PUBLIC VIEW'}</h2>
      <p>{message}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// LoginSection — reads/writes auth via context, hidden by default
// ---------------------------------------------------------------------------
const LoginSection = ({ setShowSplash, setNotify, showLoginPanel, setShowLoginPanel }) => {
  const { isLoggedIn, isAdmin, username, login, logout } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setShowSplash(true); // Trigger global splash screen on login
    
    try {
      const res = await axios.post('/api/auth/login', credentials);
      
      // Delay to let the beautiful splash screen play during the login transition
      setTimeout(() => {
        login(res.data.token);
        setCredentials({ username: '', password: '' });
        setShowSplash(false);
        setShowLoginPanel(false);  // Hide panel after successful login
        setNotify({ type: 'login', message: 'Administrator Session Established' });
        setTimeout(() => setNotify(null), 4000);
      }, 5000);
      
    } catch (err) {
      setShowSplash(false);
      console.error('[HY-AQMS] Login Error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Unknown connection error';
      alert(`Login failed: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setShowLoginPanel(false);  // Hide panel on logout
    setNotify({ type: 'logout', message: 'Returned to General Public View' });
    setTimeout(() => setNotify(null), 4000);
  };

  if (isLoggedIn) {

    return (
      <div style={{ padding: '1rem', margin: '0 1rem 1rem 1rem', background: 'var(--overlay-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
          {/* Avatar */}
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isAdmin ? 'var(--brand-gradient)' : '#475569', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.75rem', flexShrink: 0 }}>
            {username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{username ?? 'User'}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: isAdmin ? 'var(--accent)' : 'var(--text-dim)' }}>
              {isAdmin ? '🔑 Administrator' : '👁 Viewer'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '0.5rem', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}
        >
          Logout Session
        </button>
      </div>

    );
  }

  // Only show login panel if showLoginPanel is true (toggled by logo click)
  if (!showLoginPanel) {
    return null;
  }

  return (
    <div style={{ padding: '1rem', margin: '0 1rem 1rem 1rem', background: 'var(--overlay-bg)', borderRadius: '12px' }}>
      <button 
        onClick={() => setShowLoginPanel(false)}
        style={{ width: '100%', background: 'transparent', border: '1px solid rgba(2, 239, 240, 0.3)', color: 'var(--accent)', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}
      >
        <span>✖ CLOSE</span>
      </button>

      <div style={{ display: 'block' }}>
        <p style={{ margin: '1rem 0 0.8rem 0', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: '600' }}>RESTRICTED ACCESS</p>
        <form onSubmit={handleLogin}>
          <input
            placeholder="Username"
            value={credentials.username}
            onChange={e => setCredentials({ ...credentials, username: e.target.value })}
            style={{ width: '100%', padding: '0.6rem', marginBottom: '0.5rem', borderRadius: '6px', border: 'none', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.8rem', boxSizing: 'border-box' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={credentials.password}
            onChange={e => setCredentials({ ...credentials, password: e.target.value })}
            style={{ width: '100%', padding: '0.6rem', marginBottom: '0.8rem', borderRadius: '6px', border: 'none', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.8rem', boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.6rem', background: loading ? '#2c3e50' : 'var(--accent)', color: '#0F282F', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
          >
            {loading ? 'Authenticating…' : 'Initialize Command Link'}
          </button>
        </form>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
const AppInner = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('map');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showLoginPanel, setShowLoginPanel] = useState(false);  // Hidden by default, toggle with logo click

  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showSplash, setShowSplash] = useState(true);
  const [showRegionSelect, setShowRegionSelect] = useState(false);
  const apiBaseUrl = useMemo(() => getApiBaseUrlClient(), []);
  const API_URL = apiBaseUrl.replace(/\/$/, '');

  const [selectedRegion, setSelectedRegion] = useState(() => {
    const stored = localStorage.getItem('aqms_region');
    return VALID_REGION_IDS.includes(stored) ? stored : 'all';
  });
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [socketError, setSocketError] = useState(null);
  const [notify, setNotify] = useState(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  // Show splash on initial boot, then Region Selector if no region is saved
  useEffect(() => {
    const t = setTimeout(() => {
      setShowSplash(false);
      // If no region is saved or user specifically asked for "every startup", we show it.
      // The prompt says "every startup or just opening", so we show it unless we want to be more subtle.
      // I'll show it if selectedRegion is 'all' or just always if it's a new session.
      setShowRegionSelect(true);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('aqms_theme', 'dark');
  }, []);

  // Build the nav tab list — admins see Simulation, viewers do not
  const NAV_TABS = [
    { id: 'dashboard',  label: '📊 Dashboard' },
    { id: 'analytics',  label: '📈 Analytics' },
    { id: 'map',        label: '🗺️ AQI Map' },
    { id: 'devices',    label: '🔌 Devices' },
    ...(isAdmin ? [
      { id: 'simulation', label: '🚀 Simulation' },
      { id: 'dataflow',   label: '🔄 Pipeline' },
    ] : []),
    { id: 'docs',       label: '📚 Documentation' },
  ];

  const safeActiveTab = NAV_TABS.some(t => t.id === activeTab) ? activeTab : 'map';

  const EMBR_X_DEVICE_ID = 'denr_emb_x_reference_001';

  useEffect(() => {
    axios.defaults.baseURL = API_URL;

    const fetchInitial = async () => {
      try {
        const [readingsRes, devicesRes] = await Promise.all([
          axios.get('/api/readings/latest'),
          axios.get('/api/devices')
        ]);
        let initialReadings = Array.isArray(readingsRes.data) ? readingsRes.data : [];
        // Try to fetch external EMBR-X latest reading and merge it
        try {
          const ext = await axios.get('/api/external/embrx/latest');
          if (ext?.data && ext.data.device_id === EMBR_X_DEVICE_ID) {
            const idx = initialReadings.findIndex(r => r.device_id === EMBR_X_DEVICE_ID);
            if (idx > -1) initialReadings[idx] = ext.data; else initialReadings.push(ext.data);
          }
        } catch (e) {
          // ignore external read error — backend poller may not have run yet
        }

        setReadings(initialReadings);
        setDevices(Array.isArray(devicesRes.data) ? devicesRes.data : []);
      } catch (err) {
        console.error('Error fetching initial data:', err);
      }
    };

    const refreshExternalReference = async () => {
      try {
        const ext = await axios.get('/api/external/embrx/latest');
        if (ext?.data && ext.data.device_id === EMBR_X_DEVICE_ID) {
          setReadings(prev => {
            const idx = prev.findIndex(r => r.device_id === EMBR_X_DEVICE_ID);
            if (idx > -1) {
              const updated = [...prev];
              updated[idx] = ext.data;
              return updated;
            }
            return [...prev, ext.data];
          });
        }
      } catch (err) {
        console.debug('[HY-AQMS] External EMBR-X refresh failed:', err.message);
      }
    };

    fetchInitial();
    const externalRefreshInterval = setInterval(refreshExternalReference, 300000); // refresh every 5 minutes
    refreshExternalReference();
    fetchInitial();

    const socket = io(API_URL, {
      path: '/socket.io',
      timeout: 30000, // connection attempt timeout
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 20000,
      // Prefer websocket and fallback to polling if needed
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setSocketStatus('connected');
      setSocketError(null);
      console.info('[HY-AQMS] Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setSocketStatus('disconnected');
      setSocketError(reason);
      console.warn('[HY-AQMS] Socket disconnected - Reason:', reason);
      
      // Distinguish between intentional and unintentional disconnects
      if (reason === 'client namespace disconnect') {
        console.debug('[HY-AQMS] Client-initiated disconnect (normal)');
      } else if (reason.includes('transport')) {
        console.warn('[HY-AQMS] Network transport error - will auto-reconnect');
      } else if (reason.includes('timeout')) {
        console.warn('[HY-AQMS] Connection timeout - will auto-reconnect');
      }
    });

    socket.on('connect_error', (error) => {
      setSocketStatus('disconnected');
      setSocketError(error?.message || 'Connection error');
      console.error('[HY-AQMS] Socket connection error:', error);
    });

    socket.on('reconnect_attempt', (attempt) => {
      setSocketStatus('reconnecting');
      setSocketError(null);
      console.info('[HY-AQMS] Socket reconnect attempt', attempt);
    });

    socket.on('reconnect', (attempt) => {
      setSocketStatus('connected');
      setSocketError(null);
      console.info('[HY-AQMS] Socket reconnected after', attempt, 'attempt(s)');
      
      // Fetch fresh data after reconnection to catch any missed updates
      (async () => {
        try {
          console.debug('[HY-AQMS] Refreshing data after reconnect...');
          const readingsRes = await axios.get('/api/readings/latest');
          if (Array.isArray(readingsRes.data)) {
            setReadings(readingsRes.data);
            console.debug('[HY-AQMS] Data refreshed after reconnect', readingsRes.data.length, 'readings');
          }
        } catch (err) {
          console.error('[HY-AQMS] Failed to refresh data after reconnect:', err.message);
        }
      })();
    });

    socket.on('new_reading', (payload) => {
      setReadings(prev => {
        const index = prev.findIndex(r => r.device_id === payload.device_id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = payload;
          return updated;
        }
        return [...prev, payload];
      });
    });

    // Store socket in ref to prevent stale closures
    const socketRef = { current: socket };

    // Fallback polling - fetch latest data every 15 seconds if socket is not connected
    const pollInterval = setInterval(async () => {
      if (socket.connected) {
        // Socket is connected, no need to poll
        return;
      }
      
      try {
        console.debug('[HY-AQMS] Polling for latest data (socket disconnected)');
        const readingsRes = await axios.get('/api/readings/latest');
        if (Array.isArray(readingsRes.data) && readingsRes.data.length > 0) {
          setReadings(readingsRes.data);
          console.debug('[HY-AQMS] Polling refreshed', readingsRes.data.length, 'readings');
        }
      } catch (err) {
        console.debug('[HY-AQMS] Polling failed:', err.message);
      }
    }, 15000);

    // Only disconnect on actual unmount or when switching API URLs
    return () => {
      console.debug('[HY-AQMS] Cleaning up socket connection');
      clearInterval(pollInterval);
      clearInterval(externalRefreshInterval);
      // Properly close the socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    localStorage.setItem('aqms_region', region);
    setShowRegionSelect(false);
  };

  // Filtered Data Logic
  const filteredReadings = readings.filter(r => {
    if (selectedRegion === 'all') return true;
    const device = devices.find(d => d.device_id === r.device_id);
    const region = device?.region;
    return region === selectedRegion || String(region).toLowerCase() === 'all';
  });

  // Note: We render Simulation unconditionally (if admin) but hide it when inactive,
  // so the auto-pilot interval and log state persist in the background.
  const renderContent = () => {
    switch (safeActiveTab) {
      case 'dashboard':  return <Dashboard readings={filteredReadings} />;
      case 'analytics':  return <Analytics />;
      case 'map':        return <MapView readings={filteredReadings} />;
      case 'devices':    return <Devices isAdmin={isAdmin} readings={readings} />;
      case 'dataflow':   return <DataFlow readings={readings} />;
      case 'docs':       return <Docs />;
      default:           return safeActiveTab === 'simulation' ? null : <MapView readings={filteredReadings} />;
    }
  };

  return (
    <>
      {showSplash && <LoadingScreen />}
      {showRegionSelect && !showSplash && <RegionSelector onSelect={handleRegionSelect} />}
      <AccessNotification message={notify?.message} type={notify?.type} />
      
      {/* Global Atmospheric Tech Layers */}
      <div className="bg-overlay" />
      <div className="tech-bg" />
      <div className="atm-glow glow-1" />
      <div className="atm-glow glow-2" />

      {/* Mobile Top Header Bar */}
      <div className="mobile-header">
        <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.2rem', fontWeight: '800', letterSpacing: '1px' }}>HY-AQMS</h2>
        <button className="mobile-menu-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
          ☰
        </button>
      </div>

      {/* Sidebar Backdrop Overlay */}
      <div className={`sidebar-backdrop ${isMobileSidebarOpen ? 'active' : ''}`} onClick={() => setIsMobileSidebarOpen(false)} />
      
      <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', background: 'transparent', overflow: 'hidden', position: 'relative' }}>
      {/* Sidebar */}
      <aside className={`sidebar glass-panel ${isMobileSidebarOpen ? 'open' : ''}`} style={{ width: '280px', border: 'none', borderRadius: '0', borderRight: '1px solid var(--border)', boxShadow: '5px 0 30px var(--shadow)', zIndex: 10, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
        <div style={{ padding: '2.5rem 2rem', borderBottom: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease' }} onClick={() => setShowLoginPanel(!showLoginPanel)}>
          <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.6rem', fontWeight: '800', letterSpacing: '1px', textShadow: '0 0 10px rgba(2, 239, 240, 0.5)', transition: 'all 0.3s ease' }} onMouseEnter={(e) => e.target.style.filter = 'brightness(1.2)'} onMouseLeave={(e) => e.target.style.filter = 'brightness(1)'}>HY-AQMS</h2>
          <div style={{ background: 'var(--accent-bg-hover)', border: '1px solid rgba(2, 239, 240, 0.2)', padding: '0.2rem 0.6rem', borderRadius: '12px', display: 'inline-block', marginTop: '0.5rem' }}>
            <span style={{ color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              📍 {selectedRegion === 'all' ? 'City-wide View' : selectedRegion}
            </span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '2rem 1rem' }}>
          {NAV_TABS.map(tab => {
            const isActive = safeActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileSidebarOpen(false); // Close sidebar on mobile
                }}
                className={`nav-btn hover-lift ${isActive ? 'active' : ''}`}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  marginBottom: '1rem',
                  background: isActive ? 'var(--accent-bg-hover)' : 'var(--panel)',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--accent-border)' : 'var(--border)',
                  borderRadius: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? '600' : '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: isActive ? '0 0 20px rgba(2, 239, 240, 0.15)' : '0 4px 6px var(--shadow)',
                  transition: 'all 0.3s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <LoginSection setShowSplash={setShowSplash} setNotify={setNotify} showLoginPanel={showLoginPanel} setShowLoginPanel={setShowLoginPanel} />

        <div style={{ padding: '1.5rem 2rem', background: 'var(--overlay-bg)', borderTop: '1px solid var(--border)' }}>
          <div>
            <DigitalClock />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', letterSpacing: '1px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: socketStatus === 'connected' ? '#2ecc71' : socketStatus === 'reconnecting' ? '#f59e0b' : '#ef4444',
                boxShadow: socketStatus === 'connected'
                  ? '0 0 10px #2ecc71'
                  : socketStatus === 'reconnecting'
                    ? '0 0 10px #f59e0b'
                    : '0 0 10px #ef4444'
              }} />
              {socketStatus === 'connected' && 'NETWORK ONLINE'}
              {socketStatus === 'reconnecting' && 'RECONNECTING...'}
              {socketStatus === 'disconnected' && 'NETWORK OFFLINE'}
            </div>
            <button
              onClick={() => setShowConnectionModal(true)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.95rem', padding: '2px',
                transition: 'color 0.2s'
              }}
              title="Connection Settings"
              onMouseEnter={(e) => e.target.style.color = 'var(--accent)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-dim)'}
            >
              ⚙️
            </button>
          </div>
        </div>
      </aside>

      {/* HUD Main content */}
      <main className="hud-wrapper">
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% -20%, var(--accent-bg) 0%, transparent 50%)', zIndex: 0 }} />
        <div style={{ flex: 1, zIndex: 1, position: 'relative', overflowY: 'auto' }}>
          {renderContent()}
          {isAdmin && (
            <div style={{ display: activeTab === 'simulation' ? 'block' : 'none', height: '100%' }}>
              <Simulation />
            </div>
          )}
        </div>
      </main>
    </div>

    {showConnectionModal && (
      <div className="modal-overlay" style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(5, 11, 13, 0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        fontFamily: '"Times New Roman", Times, serif'
      }}>
        <div className="glass-panel" style={{
          maxWidth: '480px', width: '90%', padding: '2.5rem',
          border: '1px solid var(--border)', borderRadius: '16px',
          background: 'var(--panel)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          position: 'relative'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '1.4rem', fontWeight: '800', letterSpacing: '1px' }}>
            🛰️ CONNECTION SETTINGS
          </h3>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: '1.4' }}>
            Configure your active backend API URL (e.g. localhost, local network IP, or public ngrok/localtunnel URL). This enables synchronization across different devices and screen sizes.
          </p>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.5rem', letterSpacing: '1px' }}>
              BACKEND API URL
            </label>
            <input
              type="text"
              id="connection-api-url"
              defaultValue={localStorage.getItem('aqms_api_url') || apiBaseUrl}
              placeholder="e.g. http://192.168.1.100:3000"
              style={{
                width: '100%', padding: '0.8rem',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem',
                fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => {
                const val = document.getElementById('connection-api-url').value.trim();
                if (val) {
                  localStorage.setItem('aqms_api_url', val);
                } else {
                  localStorage.removeItem('aqms_api_url');
                }
                window.location.reload();
              }}
              style={{
                flex: 1, padding: '0.8rem',
                background: 'linear-gradient(135deg, #02eff0, #00d2ff)',
                color: '#0b1519', border: 'none', borderRadius: '8px',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Apply & Reload
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('aqms_api_url');
                window.location.reload();
              }}
              style={{
                padding: '0.8rem 1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Reset
            </button>
            <button
              onClick={() => setShowConnectionModal(false)}
              style={{
                padding: '0.8rem 1.2rem',
                background: 'transparent',
                color: 'var(--text-dim)', border: '1px solid var(--border)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HY-AQMS ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', width: '100vw',
          background: '#0B1519', color: '#E2F1F5',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '2rem', boxSizing: 'border-box',
          fontFamily: '"Times New Roman", Times, serif',
          position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: '-10%', left: '30%', width: '40%', height: '40%', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '50%', filter: 'blur(100px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '30%', width: '40%', height: '40%', background: 'rgba(2, 239, 240, 0.05)', borderRadius: '50%', filter: 'blur(100px)' }} />
          
          <div style={{
            background: 'rgba(11, 21, 25, 0.8)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px', padding: '3rem',
            maxWidth: '600px', width: '100%',
            textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)', zIndex: 10
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>⚠️</div>
            <h2 style={{ color: '#ef4444', margin: '0 0 1rem 0', fontSize: '1.8rem', fontWeight: '800', letterSpacing: '1px' }}>
              CRITICAL INTERFACE FAULT
            </h2>
            <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: '1.6', margin: '0 0 2rem 0' }}>
              An unexpected rendering crash occurred. This is commonly caused by an unreachable backend API.
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '1rem', marginBottom: '2rem',
              textAlign: 'left', overflowX: 'auto', maxHeight: '150px'
            }}>
              <code style={{ fontSize: '0.8rem', color: '#f87171', fontFamily: 'monospace', display: 'block', whiteSpace: 'pre-wrap' }}>
                {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
              </code>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: '100%', padding: '0.8rem',
                  background: 'linear-gradient(135deg, #02eff0, #00d2ff)',
                  color: '#0b1519', border: 'none', borderRadius: '8px',
                  fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                  boxShadow: '0 4px 15px rgba(2, 239, 240, 0.3)', transition: 'all 0.2s'
                }}
              >
                Re-establish Link (Reload)
              </button>
              <a
                href="https://vercel.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.8rem', color: '#64748b', textDecoration: 'underline',
                  cursor: 'pointer', display: 'inline-block', marginTop: '0.5rem'
                }}
              >
                Configure VITE_API_URL on Vercel Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrap AppInner in the provider and error boundary so every child can call useAuth()
const App = () => (
  <ErrorBoundary>
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
