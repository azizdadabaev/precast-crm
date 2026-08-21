'use client';

import { useState } from 'react';
import type { DateBasis } from '@/lib/dashboard-metrics';
import type { DashboardData } from './types';
import { OrderColumnHeader, OrderRow } from './OrderRow';
import { MonthOrdersModal } from './MonthOrdersModal';

interface Props {
  orders: DashboardData['recentOrders'];
  /** Month «Барчаси →» opens on — whichever the dashboard is showing. */
  monthKey: string;
  /** Passed through so the modal groups the month the same way the page does. */
  basis: DateBasis;
}

export function RecentOrders({ orders, monthKey, basis }: Props) {
  const [showAll, setShowAll] = useState(false);

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
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-accent)',
            fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none', padding: 0,
          }}
        >Барчаси →</button>
      </div>

      <OrderColumnHeader />

      {orders.map((o) => <OrderRow key={o.orderNumber} order={o} />)}

      {orders.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)', marginTop: 12 }}>
          Буюртмалар йўқ
        </p>
      )}

      {showAll && (
        <MonthOrdersModal
          initialMonth={monthKey}
          basis={basis}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}
