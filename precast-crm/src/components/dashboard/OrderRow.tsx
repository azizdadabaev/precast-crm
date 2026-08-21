'use client';

import Link from 'next/link';
import type { DashboardData } from './types';

/**
 * One order line, shared by the «Сўнгги буюртмалар» card and the full-month
 * modal it opens.
 *
 * Shared rather than duplicated on purpose: the modal is specified as "the
 * same contents and behaviour as the card", and two copies of this markup
 * would drift the first time either is touched.
 */
export type DashOrder = DashboardData['recentOrders'][number];

export function fmtSum(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const STATE_LABELS: Record<DashOrder['paymentState'], string> = {
  FULLY_PAID: 'Тўланган',
  PARTIALLY_PAID: 'Қисман',
  AWAITING_PAYMENT: 'Кутилмоқда',
};

/** Payment colours are fixed product-wide: paid green, partial accent, pending muted. */
export function stateBadge(state: DashOrder['paymentState']) {
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

/** Column headers, so both lists label the same columns identically. */
export function OrderColumnHeader() {
  return (
    <div style={{
      display: 'flex', gap: 8, paddingBottom: 8,
      borderBottom: '1px solid var(--dash-line)',
      fontFamily: 'var(--font-num)', fontSize: 10.5, letterSpacing: '.1em',
      textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
    }}>
      <div style={{ flex: '1.6', minWidth: 0 }}>Мижоз / Материал</div>
      <div style={{ flex: '0.8', textAlign: 'right' }}>Майдон</div>
      <div style={{ flex: '0.9', textAlign: 'right' }}>Сумма</div>
    </div>
  );
}

export function OrderRow({ order: o }: { order: DashOrder }) {
  return (
    <div style={{
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

      {/* Price + payment badge */}
      <div style={{ flex: '0.9', textAlign: 'right' }}>
        <div style={{
          fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
          color: 'var(--dash-ink)', whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtSum(o.totalPrice)}</div>
        {stateBadge(o.paymentState)}
      </div>
    </div>
  );
}
