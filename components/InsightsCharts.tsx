'use client';

import { money } from '@/lib/format';

export interface SeriesPoint {
  label: string;
  draws: number;
  payments: number;
  visits: number;
}

/**
 * Six-month bars, drawn with plain divs.
 *
 * No charting library on purpose: three small series do not justify pulling
 * recharts or d3 into the admin bundle, and this keeps the palette exactly on
 * brand instead of fighting a library's defaults.
 */
function Bars({
  title, points, pick, format, color,
}: {
  title: string;
  points: SeriesPoint[];
  pick: (p: SeriesPoint) => number;
  format: (n: number) => string;
  color: string;
}) {
  const values = points.map(pick);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ color: 'var(--navy)', margin: 0, fontSize: 18 }}>{title}</h2>
        <span className="muted" style={{ fontSize: 13 }}>6 months · {format(total)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150, marginTop: 20 }}>
        {points.map((p, i) => {
          const v = pick(p);
          const h = max > 0 ? Math.round((v / max) * 116) : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {v > 0 ? format(v) : ''}
              </span>
              <div
                title={`${p.label}: ${format(v)}`}
                style={{
                  width: '100%', height: Math.max(h, v > 0 ? 3 : 1),
                  background: v > 0 ? color : 'var(--navy-soft)',
                  borderRadius: '4px 4px 0 0', transition: 'height .2s ease',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InsightsCharts({ series }: { series: SeriesPoint[] }) {
  const compact = (n: number) =>
    n >= 1000 ? '$' + Math.round(n / 1000) + 'k' : money(n).replace('.00', '');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 4 }}>
      <Bars title="Draws Advanced" points={series} pick={p => p.draws} format={compact} color="var(--navy-med)" />
      <Bars title="Payments Received" points={series} pick={p => p.payments} format={compact} color="var(--brass)" />
      <Bars title="Portal Visits" points={series} pick={p => p.visits} format={n => String(n)} color="var(--navy)" />
    </div>
  );
}
