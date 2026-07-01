'use client';

import type { DashboardData } from './types';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const cardBase: React.CSSProperties = {
  background: 'var(--dash-surface)',
  border: '1px solid var(--dash-line)',
  borderRadius: 'var(--dash-radius)',
  padding: '18px 20px',
};
const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontSize: 11, letterSpacing: '.12em',
  textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
};
const bigNum: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 30,
  color: 'var(--dash-ink)', margin: '10px 0 12px',
};
const sub: React.CSSProperties = {
  fontFamily: 'var(--font-body-alt)', fontSize: 12, color: 'var(--dash-muted)',
};

interface Props {
  data: Pick<DashboardData, 'activeCustomers' | 'todayDeliveries' | 'openDiscrepancies' | 'cashOnTheRoad'>;
}

export function OperationalKPIs({ data }: Props) {
  const { breakdown } = data.activeCustomers;
  const total = breakdown.paid + breakdown.partial + breakdown.awaiting || 1;

  const delivered = Math.min(data.todayDeliveries.count, 8);
  const dotsTotal = 8;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 34 }}>

      {/* Card 1: Active clients */}
      <div style={cardBase}>
        <div style={labelStyle}>Фаол мижозлар</div>
        <div style={bigNum}>{data.activeCustomers.count}</div>
        <div style={{ display: 'flex', height: 7, borderRadius: 5, overflow: 'hidden', background: 'var(--dash-surface2)' }}>
          {breakdown.paid > 0 && (
            <div style={{ width: `${(breakdown.paid / total) * 100}%`, background: 'var(--dash-pos)', height: '100%' }} />
          )}
          {breakdown.partial > 0 && (
            <div style={{ width: `${(breakdown.partial / total) * 100}%`, background: 'var(--dash-accent)', height: '100%' }} />
          )}
          {breakdown.awaiting > 0 && (
            <div style={{ width: `${(breakdown.awaiting / total) * 100}%`, background: 'var(--dash-muted)', height: '100%' }} />
          )}
        </div>
        <div style={{ ...sub, marginTop: 9 }}>
          {breakdown.paid} тўланган · {breakdown.partial} қисман · {breakdown.awaiting} кутилмоқда
        </div>
      </div>

      {/* Card 2: Today's deliveries */}
      <div style={cardBase}>
        <div style={labelStyle}>Бугунги етказишлар</div>
        <div style={bigNum}>{data.todayDeliveries.count}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 9 }}>
          {Array.from({ length: dotsTotal }).map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 7, borderRadius: 3,
              background: i < delivered
                ? 'var(--dash-accent)'
                : 'color-mix(in srgb, var(--dash-accent) 22%, transparent)',
            }} />
          ))}
        </div>
        <div style={sub}>{data.todayDeliveries.totalArea.toFixed(1).replace('.', ',')} м² режалаштирилган</div>
      </div>

      {/* Card 3: Open discrepancies */}
      <div style={cardBase}>
        <div style={labelStyle}>Очиқ тафовутлар</div>
        <div style={bigNum}>{data.openDiscrepancies.count}</div>
        {data.openDiscrepancies.count === 0 ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--dash-pos) 14%, transparent)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dash-pos)' }} />
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, fontWeight: 600, color: 'var(--dash-pos)' }}>
              Назоратда
            </span>
          </div>
        ) : (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--dash-neg) 14%, transparent)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dash-neg)' }} />
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, fontWeight: 600, color: 'var(--dash-neg)' }}>
              Кўриб чиқилсин
            </span>
          </div>
        )}
        <div style={{ ...sub, marginTop: 9 }}>
          {fmt(data.openDiscrepancies.totalAmount)} UZS тафовут
        </div>
      </div>

      {/* Card 4: Cash on the road */}
      <div style={cardBase}>
        <div style={labelStyle}>Йўлдаги нақд пул</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '10px 0 12px' }}>
          <span style={bigNum}>{data.cashOnTheRoad.dispatchCount}</span>
          <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
            жўнатиш
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
          <span style={{
            fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700,
            color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
          }}>{fmt(data.cashOnTheRoad.total)}</span>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, color: 'var(--dash-muted)' }}>UZS</span>
        </div>
        <div style={sub}>
          {data.cashOnTheRoad.drivers.length > 0
            ? data.cashOnTheRoad.drivers.map(d => d.name).join(', ') + ' йўлда'
            : 'Ҳайдовчи йўлда эмас'}
        </div>
      </div>

    </div>
  );
}
