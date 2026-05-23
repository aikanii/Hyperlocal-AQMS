const REGIONS = [
  { id: 'all', name: 'All of Iligan City', icon: '🏙️', desc: 'View global network statistics' },
  { id: 'Poblacion', name: 'Poblacion', icon: '🏦', desc: 'Central governance & business' },
  { id: 'Tibanga', name: 'Tibanga', icon: '🎓', desc: 'Academic & university hub' },
  { id: 'Pala-o', name: 'Pala-o', icon: '🛒', desc: 'Commercial & shopping district' },
  { id: 'Tambacan', name: 'Tambacan', icon: '🏠', desc: 'Residential & community zones' },
  { id: 'Suarez', name: 'Suarez', icon: '🏭', desc: 'Industrial & port area' }
];

const RegionSelector = ({ onSelect }) => {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(20px)',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      animation: 'fadeIn 0.8s ease'
    }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 className="region-selector-title" style={{ fontSize: '3rem', fontWeight: '900', margin: '0 0 1rem 0', color: 'var(--text)', letterSpacing: '2px' }}>
          LOCALIZE YOUR <span style={{ color: 'var(--accent)' }}>EXPERIENCE</span>
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '1rem', maxWidth: '600px', margin: '0 auto', padding: '0 1rem' }}>
          Select a Barangay to monitor hyperlocal air quality in real-time, or view the city-wide ensemble.
        </p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '1200px'
      }}>
        {REGIONS.map((r) => (
          <div
            key={r.id}
            className="region-card"
            onClick={() => onSelect(r.id)}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>{r.icon}</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text)', fontSize: '1.2rem' }}>{r.name}</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>{r.desc}</p>
          </div>
        ))}
      </div>
      
      <footer style={{ marginTop: '4rem', color: 'var(--text-dim)', fontSize: '0.8rem', opacity: 0.5 }}>
        HY-AQMS COMMAND CENTER • ILIGAN CITY DEPLOYMENT
      </footer>
    </div>
  );
};

export default RegionSelector;
