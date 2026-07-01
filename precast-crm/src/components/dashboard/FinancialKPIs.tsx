'use client';

import { useId } from 'react';
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
    'revenueThisMonth' | 'revenueAllTime' | 'averageOrderValue' |
    'outstandingReceivables' | 'revenueByMonth' | 'ordersByMonth'>;
}

export function FinancialKPIs({ data }: Props) {
  const id1 = useId();
  const id2 = useId();
  const id3 = useId();
  const id4 = useId();

  const accent = 'var(--dash-accent)';
  const neg = 'var(--dash-neg)';

  const revLast6 = data.revenueByMonth.slice(-6).map(m => m.revenue);
  const cumRevLast6 = data.revenueByMonth.reduce<number[]>((acc, m, i) => {
    const prev = acc[i - 1] ?? 0;
    acc.push(prev + m.revenue);
    return acc;
  }, []).slice(-6);
  const avgLast6 = data.revenueByMonth.slice(-6).map((m, i) => {
    const idx = data.revenueByMonth.length - 6 + i;
    const cnt = data.ordersByMonth[idx]?.count ?? 0;
    return cnt > 0 ? Math.round(m.revenue / cnt) : 0;
  });
  const recvFlat = Array.from({ length: 6 }, () => data.outstandingReceivables.total);

  function deltaBadge(trend: Trend | null, negative = false) {
    if (!trend || trend.direction === 'flat') return null;
    const isUp = trend.direction === 'up';
    const good = negative ? !isUp : isUp;
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

      {/* Card 1: Revenue this month */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Бу ойдаги даромад</span>
          {deltaBadge(data.revenueThisMonth.trend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.revenueThisMonth.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={revLast6} color={accent} id={id1} />
        </div>
        <div style={sub}>{data.revenueThisMonth.orderCount} та буюртма · ушбу ой</div>
      </div>

      {/* Card 2: Total revenue all time */}
      <div style={cardBase}>
        <div style={label}>Жами даромад</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.revenueAllTime.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={cumRevLast6} color={accent} id={id2} />
        </div>
        <div style={sub}>{data.revenueAllTime.orderCount} та буюртма · бошланғичдан</div>
      </div>

      {/* Card 3: Average order value */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Ўртача буюртма</span>
          {deltaBadge(data.averageOrderValue.trend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.averageOrderValue.thisMonth)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={avgLast6} color={accent} id={id3} />
        </div>
        <div style={sub}>Жами ўртача: {fmt(data.averageOrderValue.allTime)} UZS</div>
      </div>

      {/* Card 4: Receivables — red left border */}
      <div style={{ ...cardBase, borderLeft: '3px solid var(--dash-accent2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Қарздорлик</span>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--dash-accent2)' }}>
            тўлов кутилмоқда
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
      </div>

    </div>
  );
}
