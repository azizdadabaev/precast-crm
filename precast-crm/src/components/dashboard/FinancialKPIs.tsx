'use client';

import { useId } from 'react';
import { averageOrderValue, buildTrend } from '@/lib/dashboard-metrics';
import type { DashboardData, Trend } from './types';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const w = 110, h = 34, pad = 3;
  if (values.length < 2) return <div style={{ height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const dx = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * dx, h - pad - ((v - min) / range) * (h - pad * 2)] as [number, number]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const cardBase: React.CSSProperties = {
  background: 'var(--dash-surface)',
  border: '1px solid var(--dash-line)',
  borderRadius: 'var(--dash-radius)',
  padding: '18px 20px',
};

interface Props {
  data: Pick<DashboardData,
    'bookedAllTime' | 'collectedAllTime' |
    'averageOrderValue' | 'outstandingReceivables' |
    'bookedByMonth' | 'collectedByMonth' | 'ordersByMonth'>;
  /**
   * Index into the 12-month window. `bookedByMonth` / `collectedByMonth` /
   * `ordersByMonth` are index-aligned — `monthWindow()` builds all three —
   * so one index scopes all three cards. The LAST index is the current
   * calendar month. Driven by the hero chart's month picker.
   */
  monthIdx: number;
}

/**
 * The four money cards. Three of them (Booked / Collected / AOV) are
 * scoped to the month the operator picked in the hero chart and read
 * straight off the 12-month series, so their deltas compare the SELECTED
 * month with the one before it — not always this month vs last month.
 *
 * Receivables is the exception, deliberately: it is a point-in-time
 * balance (Σ max(0, totalPrice − confirmedPaid − writeOff)) and the
 * database keeps no historical snapshots of it, so "receivables in May"
 * cannot be reconstructed. Rather than fake one, the card always shows
 * the CURRENT outstanding figure and says so — and when a past month is
 * selected it spells out that it is not month-scoped, so it can never be
 * misread as belonging to that month.
 */
export function FinancialKPIs({ data, monthIdx }: Props) {
  const id1 = useId();
  const id2 = useId();
  const id3 = useId();
  const id4 = useId();

  const accent = 'var(--dash-accent)';
  const neg = 'var(--dash-neg)';

  const lastIdx = data.bookedByMonth.length - 1;
  const idx = Math.min(Math.max(monthIdx, 0), Math.max(lastIdx, 0));
  const isCurrentMonth = idx >= lastIdx;
  const monthLabel = data.bookedByMonth[idx]?.month ?? '';
  const scopeLabel = isCurrentMonth ? 'ушбу ой' : `${monthLabel} ойи`;

  // Selected month + the month before it — every delta compares this pair.
  const booked = data.bookedByMonth[idx]?.booked ?? 0;
  const orderCount = data.ordersByMonth[idx]?.count ?? 0;
  const collected = data.collectedByMonth[idx]?.collected ?? 0;
  const paymentCount = data.collectedByMonth[idx]?.paymentCount ?? 0;
  const prevBooked = idx > 0 ? data.bookedByMonth[idx - 1]?.booked ?? 0 : 0;
  const prevOrderCount = idx > 0 ? data.ordersByMonth[idx - 1]?.count ?? 0 : 0;
  const prevCollected = idx > 0 ? data.collectedByMonth[idx - 1]?.collected ?? 0 : 0;

  const avg = averageOrderValue(booked, orderCount);
  const prevAvg = averageOrderValue(prevBooked, prevOrderCount);

  const bookedTrend = buildTrend(booked, prevBooked, 'positive');
  const collectedTrend = buildTrend(collected, prevCollected, 'positive');
  const avgTrend = buildTrend(avg, prevAvg, 'positive');

  // Sparklines run over the six months ENDING at the selected one, so the
  // last point of the line is the big number printed above it.
  const from = Math.max(0, idx - 5);
  const bookedWindow = data.bookedByMonth.slice(from, idx + 1).map((m) => m.booked);
  const collectedWindow = data.collectedByMonth.slice(from, idx + 1).map((m) => m.collected);
  // AOV sparkline: booked ÷ orders month by month — the same formula as
  // the headline number, not collections-per-order.
  const avgWindow = data.bookedByMonth.slice(from, idx + 1).map((m, i) =>
    averageOrderValue(m.booked, data.ordersByMonth[from + i]?.count ?? 0),
  );
  const recvFlat = Array.from({ length: 6 }, () => data.outstandingReceivables.total);

  function deltaBadge(trend: Trend | null) {
    if (!trend || trend.direction === 'flat') return null;
    const isUp = trend.direction === 'up';
    const good = trend.polarity === 'negative' ? !isUp : isUp;
    const color = good ? 'var(--dash-pos)' : 'var(--dash-neg)';
    const bg = good
      ? 'color-mix(in srgb, var(--dash-pos) 14%, transparent)'
      : 'color-mix(in srgb, var(--dash-neg) 14%, transparent)';
    return (
      <span style={{
        fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700,
        padding: '3px 9px', borderRadius: 6, color, background: bg,
      }}>
        {isUp ? '↑' : '↓'} {Math.abs(trend.deltaPct)}%
      </span>
    );
  }

  const label: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontSize: 11, letterSpacing: '.12em',
    textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
  };
  const bigNum: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 23,
    letterSpacing: '-.01em', color: 'var(--dash-ink)',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  };
  const unit: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-muted)', fontWeight: 600,
  };
  const sub: React.CSSProperties = {
    fontFamily: 'var(--font-body-alt)', fontSize: 12.5, color: 'var(--dash-muted)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>

      {/* Card 1: BOOKED — Σ totalPrice of orders placed in the selected
          month. Money SOLD, not money received. */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Буюртма қилинган · Booked</span>
          {deltaBadge(bookedTrend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(booked)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={bookedWindow} color={accent} id={id1} />
        </div>
        <div style={sub}>{orderCount} та буюртма · {scopeLabel}</div>
        <div style={sub}>
          Бошланғичдан: {fmt(data.bookedAllTime.total)} UZS · {data.bookedAllTime.orderCount} та
        </div>
      </div>

      {/* Card 2: COLLECTED — Σ confirmed Payment.amount by confirmedAt in
          the selected month. Booked − Collected ≈ receivables. */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Тушган пул · Collected</span>
          {deltaBadge(collectedTrend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(collected)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={collectedWindow} color={accent} id={id2} />
        </div>
        <div style={sub}>{paymentCount} та тўлов · {scopeLabel}</div>
        <div style={sub}>
          Бошланғичдан: {fmt(data.collectedAllTime.total)} UZS · {data.collectedAllTime.paymentCount} та
        </div>
      </div>

      {/* Card 3: AOV — booked value per order in the selected month
          (Σ totalPrice ÷ orders). */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Ўртача буюртма · AOV</span>
          {deltaBadge(avgTrend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(avg)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={avgWindow} color={accent} id={id3} />
        </div>
        <div style={sub}>{scopeLabel} · жами ўртача: {fmt(data.averageOrderValue.allTime)} UZS</div>
        <div style={sub}>Ҳисоб: буюртма қилинган ÷ буюртмалар сони</div>
      </div>

      {/* Card 4: Receivables — a point-in-time balance, NOT month-scoped. */}
      <div style={{ ...cardBase, borderLeft: '3px solid var(--dash-accent2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={label}>Қарздорлик · Receivables</span>
          <span style={{
            fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700,
            color: 'var(--dash-accent2)', whiteSpace: 'nowrap',
          }}>
            Ҳозирги ҳолат · current
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.outstandingReceivables.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={recvFlat} color={neg} id={id4} />
        </div>
        <div style={sub}>{data.outstandingReceivables.orderCount} та буюртма тўлов кутмоқда</div>
        {isCurrentMonth ? (
          <div style={sub}>Ой бўйича бўлинмайди · бугунги қолдиқ</div>
        ) : (
          <div style={{ ...sub, color: 'var(--dash-accent2)', fontWeight: 600, marginTop: 2 }}>
            {monthLabel} ойига тегишли эмас · not month-scoped
          </div>
        )}
      </div>

    </div>
  );
}
