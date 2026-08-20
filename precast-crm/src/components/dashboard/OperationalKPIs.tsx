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

/** One decimal, space thousands, decimal COMMA — the house number format. */
function fmt1(n: number): string {
  const [whole, frac] = (Math.round(n * 10) / 10).toFixed(1).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac}`;
}

/** Loaded volume for the selected month. */
interface LoadedMonth {
  blocks: number;
  beamCount: number;
  beamMeters: number;
  area: number;
  orderCount: number;
}

interface Props {
  data: Pick<DashboardData, 'activeCustomers' | 'ordersByPaymentState' | 'todayDeliveries' | 'openDiscrepancies'>;
  /** Already resolved for the selected month by the dashboard page. */
  loaded: LoadedMonth;
  /** Short Cyrillic month label, e.g. «авг». */
  monthLabel: string;
}

export function OperationalKPIs({ data, loaded, monthLabel }: Props) {
  // The big number counts DISTINCT clients; the bar underneath splits
  // ORDER ROWS by payment state. Two different units, so the sub-label
  // says which is which — a client can hold orders in several states.
  const breakdown = data.ordersByPaymentState;
  const total = breakdown.paid + breakdown.partial + breakdown.awaiting || 1;

  const delivered = Math.min(data.todayDeliveries.count, 8);
  const dotsTotal = 8;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 34 }}>

      {/* Card 1: Active clients */}
      <div style={cardBase}>
        <div style={labelStyle}>Фаол мижозлар · Active clients</div>
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
          Буюртмалар: {breakdown.paid} тўланган · {breakdown.partial} қисман · {breakdown.awaiting} кутилмоқда
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

      {/* Card 4: Loaded volume — what physically left the yard this month.
          Blocks lead because they are the largest count; beam METRES sit
          beside them because a piece count cannot be compared across orders
          (a 3.35 m and a 6.40 m beam are one piece each). */}
      <div style={cardBase}>
        <div style={labelStyle}>Юкланган ҳажм · {monthLabel}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '10px 0 12px' }}>
          <span style={bigNum}>{fmt(loaded.blocks)}</span>
          <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
            блок
          </span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          paddingTop: 10, borderTop: '1px solid var(--dash-line)', marginBottom: 9,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700,
              color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
              // Five-figure metres must not split from their unit.
              whiteSpace: 'nowrap',
            }}>
              {fmt1(loaded.beamMeters)}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--dash-muted)' }}> м</span>
            </div>
            <div style={{ ...labelStyle, fontSize: 9, marginTop: 2 }}>Балка</div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700,
              color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
              // Five-figure metres must not split from their unit.
              whiteSpace: 'nowrap',
            }}>
              {fmt1(loaded.area)}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--dash-muted)' }}> м²</span>
            </div>
            <div style={{ ...labelStyle, fontSize: 9, marginTop: 2 }}>Майдон</div>
          </div>
        </div>
        <div style={sub}>
          {loaded.orderCount > 0
            ? `${loaded.orderCount} та буюртма · ${fmt(loaded.beamCount)} та балка`
            : 'Бу ойда юклаш йўқ'}
        </div>
      </div>

    </div>
  );
}
