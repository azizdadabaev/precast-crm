'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/fetcher';
import type { DateBasis } from '@/lib/dashboard-metrics';
import { monthTitle, shiftMonth } from '@/lib/month-orders';
import { OrderColumnHeader, OrderRow, fmtSum, type DashOrder } from './OrderRow';

interface MonthOrdersResponse {
  month: string;
  basis: DateBasis;
  orders: DashOrder[];
  orderCount: number;
  totalSum: number;
}

interface Props {
  /** Month the dashboard was showing when «Барчаси →» was pressed. */
  initialMonth: string;
  /** Mirrors the dashboard toggle so this list reconciles with the Booked card. */
  basis: DateBasis;
  onClose: () => void;
}

/**
 * Full-screen list of every order in a month, opened from «Барчаси →».
 *
 * Month navigation here is deliberately INDEPENDENT of the dashboard: browsing
 * back through months must not move the page underneath, so closing the modal
 * returns the owner exactly where they were.
 */
export function MonthOrdersModal({ initialMonth, basis, onClose }: Props) {
  const [month, setMonth] = useState(initialMonth);

  // Esc closes. Registered on the document because focus may sit on a row link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while a full-screen overlay is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const { data, isLoading, isError } = useQuery<MonthOrdersResponse>({
    queryKey: ['dashboard', 'month-orders', month, basis],
    queryFn: () => api<MonthOrdersResponse>(`/api/dashboard/month-orders?month=${month}&basis=${basis}`),
    // Keeps the previous month's rows on screen while the next loads, so
    // stepping through months does not flash an empty list each time.
    placeholderData: (prev) => prev,
  });

  const step = useCallback((delta: number) => setMonth((m) => shiftMonth(m, delta)), []);

  const basisCaption = basis === 'delivery'
    ? 'Етказиш санаси бўйича · by delivery date'
    : 'Буюртма санаси бўйича · by order date';

  const navBtn: React.CSSProperties = {
    width: 34, height: 34, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--dash-line)', background: 'var(--dash-surface)',
    color: 'var(--dash-ink)', fontFamily: 'var(--font-num)', fontSize: 15,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ойлик буюртмалар рўйхати"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'color-mix(in srgb, var(--dash-ink) 55%, transparent)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Clicks inside must not reach the backdrop's close handler. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--dash-bg)',
          border: '1px solid var(--dash-line)',
          borderRadius: 'var(--dash-radius)',
          width: '100%', maxWidth: 1500, height: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)',
        }}
      >
        {/* ── Header: month, navigation, totals ───────────────────── */}
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--dash-line)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 22, color: 'var(--dash-ink)',
            }}>{monthTitle(month)}</h2>
            <div style={{
              marginTop: 4, fontFamily: 'var(--font-body-alt)',
              fontSize: 11.5, color: 'var(--dash-muted)',
            }}>{basisCaption}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button type="button" style={navBtn} onClick={() => step(-1)} aria-label="Олдинги ой">‹</button>
            <button type="button" style={navBtn} onClick={() => step(1)} aria-label="Кейинги ой">›</button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Ёпиш"
              style={{ ...navBtn, marginLeft: 6, fontSize: 17 }}
            >×</button>
          </div>
        </div>

        {/* Totals — summed from the same rows below, so they cannot disagree. */}
        <div style={{
          padding: '12px 22px', borderBottom: '1px solid var(--dash-line)',
          display: 'flex', gap: 28, alignItems: 'baseline', flexShrink: 0,
          background: 'var(--dash-surface)',
        }}>
          <div>
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 700,
              color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
            }}>{data?.orderCount ?? 0}</span>
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, color: 'var(--dash-muted)' }}> та буюртма</span>
          </div>
          <div>
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 700,
              color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
            }}>{fmtSum(data?.totalSum ?? 0)}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-muted)' }}> UZS</span>
          </div>
        </div>

        {/* ── Scrolling list ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px 22px' }}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--dash-bg)', paddingTop: 14,
          }}>
            <OrderColumnHeader />
          </div>

          {isError && (
            <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-neg)', marginTop: 16 }}>
              Рўйхатни юклаб бўлмади. Қайта уриниб кўринг.
            </p>
          )}

          {!isError && isLoading && !data && (
            <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)', marginTop: 16 }}>
              Юкланмоқда…
            </p>
          )}

          {!isError && data?.orders.map((o) => <OrderRow key={o.id} order={o} />)}

          {!isError && data && data.orders.length === 0 && (
            <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)', marginTop: 16 }}>
              Бу ойда буюртма йўқ
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
