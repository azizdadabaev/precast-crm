'use client';

interface RegionRow {
  /** Canonical Latin viloyat name (stable key) or `Other`. */
  region: string;
  /** Cyrillic label shown to the operator, or «Бошқа». */
  regionUz: string;
  orderCount: number;
  clientCount: number;
  /** Σ Order.totalPrice for the province — BOOKED, not cash received. */
  booked: number;
}

interface Props {
  regions: RegionRow[];
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Province (viloyat) league table, ranked by ORDERS PLACED — not by
 * clients and not by cash. All-time over live orders: the underlying
 * aggregation has no time axis, so this widget deliberately ignores the
 * month picked in the hero chart and says so in its header.
 */
export function RegionRanking({ regions }: Props) {
  const maxOrders = Math.max(...regions.map((r) => r.orderCount), 1);
  const totalOrders = regions.reduce((s, r) => s + r.orderCount, 0);

  const numCell: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
    color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap', textAlign: 'right',
  };

  return (
    <div style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      padding: '20px 22px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 18 }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19,
          color: 'var(--dash-ink)',
        }}>Ҳудудлар бўйича буюртмалар</h3>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-muted)', whiteSpace: 'nowrap' }}>
          Вилоят бўйича · барча вақт · {fmt(totalOrders)} та буюртма
        </span>
      </div>

      {regions.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
          Маълумот йўқ
        </p>
      )}

      {regions.map((r, i) => (
        <div key={r.region} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '11px 0', borderTop: '1px solid var(--dash-line)',
        }}>
          <span style={{
            width: 22, flexShrink: 0, textAlign: 'right',
            fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700,
            color: 'var(--dash-muted)', fontVariantNumeric: 'tabular-nums',
          }}>{i + 1}</span>

          <div style={{ width: 180, flexShrink: 0, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-body-alt)', fontWeight: 600, fontSize: 13.5,
              color: 'var(--dash-ink)', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{r.regionUz}</div>
            <div style={{ fontFamily: 'var(--font-body-alt)', fontSize: 11.5, color: 'var(--dash-muted)' }}>
              {r.clientCount} та мижоз
            </div>
          </div>

          <div style={{
            flex: 1, minWidth: 40, height: 6, borderRadius: 4,
            background: 'var(--dash-surface2)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: r.region === 'Other' ? 'var(--dash-muted)' : 'var(--dash-accent)',
              width: `${(r.orderCount / maxOrders) * 100}%`,
            }} />
          </div>

          <span style={{ ...numCell, width: 84 }}>{fmt(r.orderCount)} та</span>
          <span style={{ ...numCell, width: 170, color: 'var(--dash-muted)' }}>
            {fmt(r.booked)} UZS
          </span>
        </div>
      ))}
    </div>
  );
}
