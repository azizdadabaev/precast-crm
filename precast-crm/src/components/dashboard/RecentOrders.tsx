'use client';

import Link from 'next/link';
import type { DashboardData } from './types';

type Order = DashboardData['recentOrders'][number];

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const STATE_LABELS: Record<Order['paymentState'], string> = {
  FULLY_PAID: 'Тўланган',
  PARTIALLY_PAID: 'Қисман',
  AWAITING_PAYMENT: 'Кутилмоқда',
};

function stateBadge(state: Order['paymentState']) {
  const label = STATE_LABELS[state];
  const colorVar = state === 'FULLY_PAID'
    ? 'var(--dash-pos)'
    : state === 'PARTIALLY_PAID'
      ? 'var(--dash-accent)'
      : 'var(--dash-muted)';
  return (
    <span style={{
      display: 'inline-block', marginTop: 4,
      fontFamily: 'var(--font-body-alt)', fontSize: 10.5, fontWeight: 600,
      padding: '2px 7px', borderRadius: 5,
      color: colorVar,
      background: `color-mix(in srgb, ${colorVar} 14%, transparent)`,
    }}>{label}</span>
  );
}

interface Props {
  orders: DashboardData['recentOrders'];
}

export function RecentOrders({ orders }: Props) {
  const colStyle = (fr: string, align?: string): React.CSSProperties => ({
    flex: fr, textAlign: (align as React.CSSProperties['textAlign']) ?? 'left', minWidth: 0,
  });

  return (
    <div style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      padding: '20px 22px',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19,
          color: 'var(--dash-ink)',
        }}>Сўнгги буюртмалар</h3>
        <span style={{
          fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-accent)',
          fontWeight: 600, cursor: 'pointer',
        }}>Барчаси →</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', gap: 8, paddingBottom: 8,
        borderBottom: '1px solid var(--dash-line)',
        fontFamily: 'var(--font-num)', fontSize: 10.5, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
      }}>
        <div style={colStyle('1.6')}>Мижоз / Материал</div>
        <div style={colStyle('0.8', 'right')}>Майдон</div>
        <div style={colStyle('0.9', 'right')}>Сумма</div>
      </div>

      {orders.map(o => (
        <div key={o.orderNumber} style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '11px 0', borderTop: '1px solid var(--dash-line)',
        }}>
          {/* Client + material */}
          <div style={{ flex: '1.6', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Link href={`/orders/${o.id}`} style={{
                fontFamily: 'var(--font-body-alt)', fontWeight: 600, fontSize: 13,
                color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: 'none',
              }}>{o.clientName}</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Link href={`/orders/${o.id}`} style={{
                fontFamily: 'var(--font-num)', fontSize: 10.5, color: 'var(--dash-accent)',
                textDecoration: 'none',
              }}>{o.orderNumber}</Link>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dash-muted)', flexShrink: 0 }} />
              <span style={{
                fontFamily: 'var(--font-body-alt)', fontSize: 11.5, color: 'var(--dash-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{o.primaryProductLabel}</span>
            </div>
          </div>

          {/* Area */}
          <div style={{ flex: '0.8', textAlign: 'right' }}>
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 12.5, color: 'var(--dash-ink)',
              fontVariantNumeric: 'tabular-nums',
            }}>{o.totalArea.toFixed(1).replace('.', ',')}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, color: 'var(--dash-muted)' }}> м²</span>
          </div>

          {/* Price + badge */}
          <div style={{ flex: '0.9', textAlign: 'right' }}>
            <div style={{
              fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
              color: 'var(--dash-ink)', whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}>{fmt(o.totalPrice)}</div>
            {stateBadge(o.paymentState)}
          </div>
        </div>
      ))}

      {orders.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)', marginTop: 12 }}>
          Буюртмалар йўқ
        </p>
      )}
    </div>
  );
}
