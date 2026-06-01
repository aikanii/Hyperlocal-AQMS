import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  ASSESSMENT_SITES,
  RISK_LEGEND,
  FACTOR_DETAIL_KEYS,
  scoreColor,
  riskBadgeClass,
} from '../../data/iliganPm25Assessment';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BADGE_STYLES = {
  vh: { background: 'rgba(216, 90, 48, 0.2)', color: '#f59e0b', border: '1px solid rgba(216, 90, 48, 0.4)' },
  hi: { background: 'rgba(239, 159, 39, 0.2)', color: '#fbbf24', border: '1px solid rgba(239, 159, 39, 0.4)' },
  mo: { background: 'rgba(29, 158, 117, 0.2)', color: '#34d399', border: '1px solid rgba(29, 158, 117, 0.4)' },
  lo: { background: 'rgba(55, 138, 221, 0.2)', color: '#60a5fa', border: '1px solid rgba(55, 138, 221, 0.4)' },
  vl: { background: 'rgba(99, 153, 34, 0.2)', color: '#84cc16', border: '1px solid rgba(99, 153, 34, 0.4)' },
};

const RiskBadge = ({ level }) => {
  const cls = riskBadgeClass(level);
  const style = BADGE_STYLES[cls] || BADGE_STYLES.mo;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.7rem',
        padding: '2px 8px',
        borderRadius: '4px',
        fontWeight: 600,
        ...style,
      }}
    >
      {level}
    </span>
  );
};

const ScoreBar = ({ score }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
    {score}
    <span
      style={{
        background: 'var(--overlay-bg)',
        borderRadius: '4px',
        height: '6px',
        width: '80px',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '6px',
          borderRadius: '4px',
          width: `${score}%`,
          background: scoreColor(score),
        }}
      />
    </span>
  </span>
);

const Pm25EnvironmentalAssessment = () => {
  const chartData = useMemo(() => {
    const labels = ASSESSMENT_SITES.map((s) => s.name);
    const scores = ASSESSMENT_SITES.map((s) => s.score);
    const colors = ASSESSMENT_SITES.map((s) => scoreColor(s.score));
    return {
      labels,
      datasets: [
        {
          label: 'PM2.5 Probability Score',
          data: scores,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    };
  }, []);

  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` Score: ${ctx.parsed.x} / 100`,
        },
      },
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        grid: { color: 'var(--border)' },
        ticks: { color: 'var(--text-dim)', font: { size: 11 } },
      },
      y: {
        grid: { display: false },
        ticks: { color: 'var(--text)', font: { size: 11 } },
      },
    },
  };

  return (
    <section className="glass-panel" style={{ padding: '2.5rem' }}>
      <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>
        PM2.5 Environmental Assessment — Iligan City
      </h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
        Comprehensive multi-criteria probability scoring for 10 HY-AQMS monitoring sites.
        Scores are out of 100 and combine traffic, industrial activity, population density,
        land use, meteorology, topography, and vegetation factors.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '1.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
        }}
      >
        {RISK_LEGEND.map(({ label, color }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: color,
                display: 'inline-block',
              }}
            />
            {label}
          </span>
        ))}
      </div>

      <div style={{ height: '320px', marginBottom: '2rem' }}>
        <Bar data={chartData} options={chartOptions} />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

      <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: 'var(--accent)' }}>Summary ranking</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          marginBottom: '2rem',
        }}
      >
        {ASSESSMENT_SITES.map((site) => (
          <div
            key={site.deviceId}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px 14px',
            }}
          >
            <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '0 0 2px' }}>
              Rank {site.rank}
            </p>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px', color: 'var(--text)' }}>
              {site.name}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 6px', color: scoreColor(site.score) }}>
              {site.score}
            </p>
            <RiskBadge level={site.risk} />
          </div>
        ))}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

      <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: 'var(--accent)' }}>Full factor matrix</h3>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Traffic</th>
              <th style={thStyle}>Industrial</th>
              <th style={thStyle}>Pop. Density</th>
              <th style={thStyle}>Land Use</th>
              <th style={thStyle}>Meteorology</th>
              <th style={thStyle}>Topography</th>
              <th style={thStyle}>Vegetation</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Risk</th>
              <th style={thStyle}>Rank</th>
            </tr>
          </thead>
          <tbody>
            {ASSESSMENT_SITES.map((site) => (
              <tr key={site.deviceId}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{site.name}</td>
                <td style={tdStyle}><RiskBadge level={site.factors.traffic} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.industrial} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.population} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.landUse} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.meteorology} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.topography} /></td>
                <td style={tdStyle}><RiskBadge level={site.factors.vegetation} /></td>
                <td style={tdStyle}><ScoreBar score={site.score} /></td>
                <td style={tdStyle}><RiskBadge level={site.risk} /></td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{site.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

      <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: 'var(--accent)' }}>
        Per-location factor detail
      </h3>

      {ASSESSMENT_SITES.map((site) => (
        <div
          key={site.deviceId}
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '14px 16px',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                fontWeight: 700,
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              Rank {site.rank} · {site.risk} · {site.score}
            </span>
            <div>
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>{site.name}</p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-dim)' }}>{site.deviceId}</p>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {FACTOR_DETAIL_KEYS.map(({ key, label }) => (
              <div key={key} style={{ fontSize: '0.75rem' }}>
                <span style={{ display: 'block', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 600 }}>
                  {label}
                </span>
                <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{site.detail[key]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

const thStyle = {
  fontWeight: 600,
  fontSize: '0.7rem',
  color: 'var(--text-dim)',
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--surface)',
};

const tdStyle = {
  padding: '7px 6px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  verticalAlign: 'top',
};

export default Pm25EnvironmentalAssessment;
