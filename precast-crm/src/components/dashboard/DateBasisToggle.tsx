'use client';

import type { DateBasis } from '@/lib/dashboard-metrics';

/**
 * Which of an order's two dates the money on this page is filed under.
 *
 * «Буюртма санаси · Order date»  — `Order.placedAt`, when the business was
 * won. IMMUTABLE, so a closed month is final. Default.
 * «Етказиш санаси · Delivery date» — `Order.scheduledAt`, when the work is
 * promised. MUTABLE, so rescheduling moves an order — and its value —
 * between months. That is correct behaviour, but it has to be visible on
 * screen or the figure quietly stops being trustworthy; hence the note
 * that renders only on the delivery basis. Nothing is said on the order
 * basis because there is nothing to warn about.
 *
 * The toggle drives Booked, AOV and the hero chart together so everything
 * on screen shares one clock. Collected deliberately does NOT follow it:
 * cash is dated by `Payment.confirmedAt`, a fact about money rather than
 * about when an order was promised.
 */
interface Props {
  basis: DateBasis;
  onChange: (basis: DateBasis) => void;
}

const OPTIONS: Array<{ value: DateBasis; label: string }> = [
  { value: 'order', label: 'Буюртма санаси · Order date' },
  { value: 'delivery', label: 'Етказиш санаси · Delivery date' },
];

export function DateBasisToggle({ basis, onChange }: Props) {
  const btnBase: React.CSSProperties = {
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-body-alt)',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '10px 16px',
    minHeight: 44,
    borderRadius: 8,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        marginBottom: 16,
        padding: '12px 14px',
        background: 'var(--dash-surface)',
        border: '1px solid var(--dash-line)',
        borderRadius: 'var(--dash-radius)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-num)', fontSize: 11, letterSpacing: '.14em',
            textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 700,
          }}>
            Ҳисоб санаси · Date basis
          </div>
          <div style={{
            marginTop: 3, fontFamily: 'var(--font-body-alt)',
            fontSize: 11.5, color: 'var(--dash-muted)',
          }}>
            Буюртма қилинган, ўртача буюртма ва графикка таъсир қилади · applies to Booked, AOV and the chart
          </div>
        </div>

        <div
          role="group"
          aria-label="Ҳисоб санаси · Date basis"
          style={{
            display: 'flex', gap: 6, padding: 4,
            background: 'var(--dash-surface2)',
            border: '1px solid var(--dash-line)', borderRadius: 11,
          }}
        >
          {OPTIONS.map((o) => {
            const active = o.value === basis;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(o.value)}
                style={{
                  ...btnBase,
                  background: active ? 'var(--dash-surface)' : 'transparent',
                  color: active ? 'var(--dash-ink)' : 'var(--dash-muted)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mutability note — delivery basis only. `placedAt` is immutable, so
          the order basis needs no caveat and gets none. */}
      {basis === 'delivery' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          maxWidth: 420, flex: '1 1 320px',
        }}>
          <span
            aria-hidden
            style={{
              marginTop: 6, flexShrink: 0,
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--dash-accent2)',
            }}
          />
          <span style={{
            fontFamily: 'var(--font-body-alt)', fontSize: 11.5, lineHeight: 1.5,
            color: 'var(--dash-muted)',
          }}>
            <strong style={{ color: 'var(--dash-accent2)', fontWeight: 700 }}>
              Етказиш санаси ўзгарувчан.
            </strong>{' '}
            Буюртма қайта режалаштирилса, суммаси бошқа ойга кўчади — шу сабабли ўтган ой рақами ҳам ўзгариши мумкин ·
            rescheduling moves an order between months, so past figures can change.
          </span>
        </div>
      )}
    </div>
  );
}
