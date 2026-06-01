import Pm25EnvironmentalAssessment from './docs/Pm25EnvironmentalAssessment';

const Docs = () => {
  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1400px', margin: '0 auto' }}>

      <div className="grid-2-col">
        <div className="health-panel glass-panel" style={{ padding: '2.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>🌍 WHO Air Quality Guidelines</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', lineHeight: '1.6' }}>
            The HY-AQMS maps payload data against the World Health Organization's (WHO) standards to determine the Air Quality Index (AQI) and health implications.
          </p>
          
          <div style={{ padding: '0.8rem', background: 'rgba(34, 197, 94, 0.1)', borderLeft: '4px solid var(--aqi-good)', marginBottom: '0.8rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-good)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>GOOD (0 - 50)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Air quality is satisfactory. No risk.</p>
          </div>
          
          <div style={{ padding: '0.8rem', background: 'rgba(234, 179, 8, 0.1)', borderLeft: '4px solid var(--aqi-moderate)', marginBottom: '0.8rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-moderate)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>MODERATE (51 - 100)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Acceptable. Some risk for sensitive groups.</p>
          </div>
          
          <div style={{ padding: '0.8rem', background: 'rgba(249, 115, 22, 0.1)', borderLeft: '4px solid var(--aqi-sensitive)', marginBottom: '0.8rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-sensitive)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>SENSITIVE (101 - 150)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Unhealthy for sensitive groups.</p>
          </div>

          <div style={{ padding: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--aqi-unhealthy)', marginBottom: '0.8rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-unhealthy)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>UNHEALTHY (151 - 200)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Everyone begins to feel effects.</p>
          </div>

          <div style={{ padding: '0.8rem', background: 'rgba(168, 85, 247, 0.1)', borderLeft: '4px solid var(--aqi-very-unhealthy)', marginBottom: '0.8rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-very-unhealthy)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>VERY UNHEALTHY (201 - 300)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Health alert. Serious effects possible.</p>
          </div>

          <div style={{ padding: '0.8rem', background: 'rgba(136, 19, 55, 0.1)', borderLeft: '4px solid var(--aqi-hazardous)', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--aqi-hazardous)', margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>HAZARDOUS (301+)</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Emergency conditions. Stay indoors.</p>
          </div>
        </div>

        <div className="particles-panel glass-panel" style={{ padding: '2.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>🏭 Pollutants & Iligan Context</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', lineHeight: '1.6' }}>
            Known as the "Industrial City of the South", Iligan is uniquely affected by both localized industrial emissions and high-density traffic along the national highway.
          </p>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ color: 'var(--accent)', margin: '0 0 0.4rem 0' }}>PM10 (Coarse Particulate Matter)</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-dim)' }}>
              Inhalable particles with diameters 10 micrometers and smaller. In Iligan, these are primarily sourced from heavy cargo truck traffic, cement operations, and local construction sites. These coarse particles can severely irritate the eyes, nose, and throat.
            </p>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ color: 'var(--accent)', margin: '0 0 0.4rem 0' }}>PM2.5 (Fine Particulate Matter)</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-dim)' }}>
              Extremely fine particles sourced from factory exhaust and vehicle combustion. PM2.5 is highly dangerous as these microscopic particles penetrate deep into the lungs and cross into the bloodstream, putting vulnerable Iliganons at severe cardiovascular risk.
            </p>
          </div>
          
          <div style={{ padding: '1.2rem', background: 'var(--accent-bg)', border: '1px solid rgba(2, 239, 240, 0.2)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: '0.4rem' }}>Why Hyperlocal Monitoring?</div>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--text-dim)' }}>
              Topographical features like our coastal layout and local breezes create isolated micro-climates. Regional city-wide data is insufficient; barangay-level monitoring is essential to detect trapped pollutants and protect our communities accurately.
            </p>
          </div>
        </div>
      </div>

      <Pm25EnvironmentalAssessment />
    </div>
  );
};

export default Docs;
