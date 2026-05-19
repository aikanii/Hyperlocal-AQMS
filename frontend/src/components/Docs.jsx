const Docs = () => {
  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Upper Row: Health & Context */}
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

      {/* Lower Row: Technical Docs */}
      <div className="grid-2-col">
        <div className="firmware-panel glass-panel" style={{ padding: '2.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>Firmware Architecture</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>Hardware specifications and data communication protocol.</p>
          
          <div style={{ background: 'var(--panel)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
            <h4>Sensor Payload (JSON-over-MQTT)</h4>
            <pre style={{ margin: 0, padding: '1rem', background: '#2c3e50', color: 'var(--text)', borderRadius: '4px', fontSize: '0.8rem' }}>
{`{
  "pm1_0": float,       // PM1.0 concentration
  "pm2_5": float,       // PM2.5 concentration
  "pm10": float,        // PM10 concentration
  "temperature": float,  // Celsius
  "humidity": float,     // Relative %
  "rssi_dbm": int,      // WiFi Strength
  "battery_mv": int     // Battery Voltage
}`}
            </pre>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: '2rem', paddingTop: '2rem' }}>
            <h4>System Components</h4>
            <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.8', color: 'var(--text-dim)' }}>
              <li><strong style={{color: 'var(--text)'}}>MCU:</strong> ESP32-WROOM-32E</li>
              <li><strong style={{color: 'var(--text)'}}>PM Sensor:</strong> Plantower PMS7003</li>
              <li><strong style={{color: 'var(--text)'}}>Temp/Hum:</strong> Sensirion SHT40</li>
              <li><strong style={{color: 'var(--text)'}}>Protocol:</strong> MQTT (TCP/1883 or TLS/8883)</li>
            </ul>
          </div>
        </div>

        <div className="api-panel glass-panel" style={{ padding: '2.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>REST API Documentation</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>Available endpoints for 3rd party integrations.</p>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{ padding: '0.85rem', background: 'rgba(33,150,243,0.1)', borderLeft: '4px solid #2196f3', marginBottom: '1rem' }}>
              <strong>GET</strong> <code>/api/devices</code> <span style={{color: 'var(--text-dim)', marginLeft: '0.5rem'}}>- List all registered sensors.</span>
            </div>
            <div style={{ padding: '0.85rem', background: 'rgba(33,150,243,0.1)', borderLeft: '4px solid #2196f3', marginBottom: '1rem' }}>
              <strong>GET</strong> <code>/api/readings/latest</code> <span style={{color: 'var(--text-dim)', marginLeft: '0.5rem'}}>- Current values for all devices.</span>
            </div>
            <div style={{ padding: '0.85rem', background: 'rgba(33,150,243,0.1)', borderLeft: '4px solid #2196f3', marginBottom: '1rem' }}>
              <strong>GET</strong> <code>/api/stats/city</code> <span style={{color: 'var(--text-dim)', marginLeft: '0.5rem'}}>- 24h city-wide trends.</span>
            </div>
            <div style={{ padding: '0.85rem', background: 'rgba(251,192,45,0.1)', borderLeft: '4px solid #fbc02d', marginBottom: '1rem' }}>
              <strong>POST</strong> <code>/api/auth/login</code> <span style={{color: 'var(--text-dim)', marginLeft: '0.5rem'}}>- Issue JWT access token.</span>
            </div>
            <div style={{ padding: '0.85rem', background: 'rgba(233,30,99,0.1)', borderLeft: '4px solid #e91e63', marginBottom: '1rem' }}>
              <strong>POST</strong> <code>/api/simulate</code> <span style={{color: 'var(--text-dim)', marginLeft: '0.5rem'}}>- Push test data.</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Real-time Data (WebSocket)</h4>
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>Subscribe to <code>new_reading</code> event on Socket.IO for live telemetry.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Docs;
