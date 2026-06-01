import { useEffect, useRef } from 'react';

const PAQI = [
  { max: 50, color: 'var(--aqi-good)' },
  { max: 100, color: 'var(--aqi-moderate)' },
  { max: 150, color: 'var(--aqi-sensitive)' },
  { max: 200, color: 'var(--aqi-unhealthy)' },
  { max: 300, color: 'var(--aqi-very-unhealthy)' },
  { max: Infinity, color: 'var(--aqi-hazardous)' },
];

const getAQIColor = (aqi) => {
  if (aqi == null) return 'var(--text-dim)';
  return (PAQI.find((t) => aqi <= t.max) || PAQI[PAQI.length - 1]).color;
};

/**
 * Live chronological AQI timeline for the reference node (oldest → newest, scrolls to latest).
 */
const ReferenceTimeline = ({ timeline = [] }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length, timeline[timeline.length - 1]?.time]);

  if (timeline.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
        Waiting for reference AQI readings…
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="reference-timeline"
      style={{
        maxHeight: '280px',
        overflowY: 'auto',
        paddingRight: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
      }}
    >
      {timeline.map((point, index) => {
        const isLatest = index === timeline.length - 1;
        const color = getAQIColor(point.pm25_aqi);
        return (
          <div
            key={`${point.time}-${point.pm25_aqi}`}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '1rem',
              minHeight: '52px',
            }}
          >
            <div
              style={{
                width: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: isLatest ? '12px' : '8px',
                  height: isLatest ? '12px' : '8px',
                  borderRadius: '50%',
                  background: color,
                  boxShadow: isLatest ? `0 0 12px ${color}` : 'none',
                  marginTop: '6px',
                  flexShrink: 0,
                }}
              />
              {index < timeline.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    width: '2px',
                    background: 'var(--border)',
                    marginTop: '4px',
                  }}
                />
              )}
            </div>
            <div
              style={{
                flex: 1,
                paddingBottom: index < timeline.length - 1 ? '1rem' : 0,
                borderBottom: index < timeline.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                {new Date(point.time).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                {isLatest && (
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      color: '#f59e0b',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Live
                  </span>
                )}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color }}>
                {Math.round(point.pm25_aqi)}{' '}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>AQI (24h)</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReferenceTimeline;
