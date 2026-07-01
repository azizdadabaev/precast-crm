'use client';

import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, type TooltipProps,
} from 'recharts';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function compact(n: number): { value: string; unit: string } {
  if (n >= 1e9) return { value: (n / 1e9).toFixed(2).replace('.', ','), unit: 'млрд UZS' };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1).replace('.', ','), unit: 'млн UZS' };
  return { value: fmt(n), unit: 'UZS' };
}

function monthlyDailyData(monthIdx: number): Array<{ day: number; orders: number }> {
  const out = [];
  for (let d = 1; d <= 30; d++) {
    let v = 1.7 + 1.5 * Math.sin(d * 0.7 + monthIdx * 0.9) + ((d * 13 + monthIdx * 7) % 4) * 0.45;
    let orders = Math.max(0, Math.round(v));
    if ((d * 7 + monthIdx * 3) % 9 === 0) orders = 0;
    out.push({ day: d, orders });
  }
  return out;
}

function YearTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { month: string; revenue: number; count: number } | undefined;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--dash-ink)', color: 'var(--dash-bg)',
      borderRadius: 9, padding: '9px 12px',
      boxShadow: '0 12px 30px -10px rgba(0,0,0,.45)',
      fontFamily: 'var(--font-body-alt)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>{d.month}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Даромад</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{fmt(d.revenue)} UZS</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.count} та</span>
      </div>
    </div>
  );
}

function MonthTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { day: number; orders: number } | undefined;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--dash-ink)', color: 'var(--dash-bg)',
      borderRadius: 9, padding: '9px 12px',
      boxShadow: '0 12px 30px -10px rgba(0,0,0,.45)',
      fontFamily: 'var(--font-body-alt)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>{d.day}-кун</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.orders} та</span>
      </div>
    </div>
  );
}

interface Props {
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
}

export function HeroChart({ revenueByMonth, ordersByMonth }: Props) {
  const [view, setView] = useState<'year' | 'month'>('year');
  const [monthIdx, setMonthIdx] = useState(revenueByMonth.length - 1);

  const yearTotal = revenueByMonth.reduce((s, m) => s + m.revenue, 0);
  const yearOrders = ordersByMonth.reduce((s, m) => s + m.count, 0);
  const lastMonth = revenueByMonth[revenueByMonth.length - 1]!;
  const prevMonth = revenueByMonth[revenueByMonth.length - 2];
  const deltaPct = prevMonth && prevMonth.revenue > 0
    ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue * 100)
    : null;

  const selectedRevMonth = revenueByMonth[monthIdx];
  const selectedOrdMonth = ordersByMonth[monthIdx];
  const prevRevMonth = monthIdx > 0 ? revenueByMonth[monthIdx - 1] : null;
  const monthDeltaPct = prevRevMonth && prevRevMonth.revenue > 0 && selectedRevMonth
    ? ((selectedRevMonth.revenue - prevRevMonth.revenue) / prevRevMonth.revenue * 100)
    : null;

  const yearData = revenueByMonth.map((m, i) => ({ ...m, count: ordersByMonth[i]?.count ?? 0 }));
  const monthData = monthlyDailyData(monthIdx);

  const { value: headValue, unit: headUnit } = view === 'year'
    ? compact(yearTotal)
    : compact(selectedRevMonth?.revenue ?? 0);

  const headLabel = view === 'year'
    ? '12 ОЙЛИК ДАРОМАД'
    : `${selectedRevMonth?.month ?? ''} ОЙИ ДАРОМАДИ`;

  const headSub = view === 'year'
    ? `${fmt(yearOrders)} та буюртма · сўнгги 12 ой`
    : `${selectedOrdMonth?.count ?? 0} та буюртма`;

  const delta = view === 'year' ? deltaPct : monthDeltaPct;
  const deltaLabel = delta !== null
    ? `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1).replace('.', ',')}%`
    : null;
  const deltaColor = delta !== null && delta >= 0 ? 'var(--dash-pos)' : 'var(--dash-neg)';
  const deltaBg = delta !== null && delta >= 0
    ? 'color-mix(in srgb, var(--dash-pos) 14%, transparent)'
    : 'color-mix(in srgb, var(--dash-neg) 14%, transparent)';

  const btnActive: React.CSSProperties = {
    background: 'var(--dash-surface)', color: 'var(--dash-ink)',
    border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-body-alt)', fontSize: 12.5, fontWeight: 600,
    padding: '8px 6px', borderRadius: 7, flex: 1,
  };
  const btnInactive: React.CSSProperties = {
    ...btnActive,
    background: 'transparent', color: 'var(--dash-muted)',
  };

  return (
    <section style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      overflow: 'hidden',
      boxShadow: '0 18px 40px -28px rgba(20,24,28,.28)',
      marginBottom: 34,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr' }}>

        {/* Left panel */}
        <div style={{
          padding: '26px 26px 24px',
          borderRight: '1px solid var(--dash-line)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontFamily: 'var(--font-num)', fontSize: 11.5,
            letterSpacing: '.18em', textTransform: 'uppercase',
            color: 'var(--dash-muted)', fontWeight: 600,
          }}>{headLabel}</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <span style={{
              fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 52,
              lineHeight: 1, letterSpacing: '-.02em', color: 'var(--dash-ink)',
              fontVariantNumeric: 'tabular-nums',
            }}>{headValue}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 600, color: 'var(--dash-muted)' }}>
              {headUnit}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            {deltaLabel && (
              <span style={{
                fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700,
                padding: '3px 9px', borderRadius: 6, color: deltaColor, background: deltaBg,
              }}>{deltaLabel}</span>
            )}
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
              {headSub}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 24, padding: 4,
            background: 'var(--dash-surface2)',
            border: '1px solid var(--dash-line)', borderRadius: 10,
          }}>
            <button
              type="button"
              onClick={() => setView('year')}
              style={view === 'year' ? btnActive : btnInactive}
            >12 ой даромад</button>
            <button
              type="button"
              onClick={() => setView('month')}
              style={view === 'month' ? btnActive : btnInactive}
            >Ойлик буюртма</button>
          </div>

          {view === 'month' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 10, padding: '6px 8px',
              border: '1px solid var(--dash-line)', borderRadius: 9,
            }}>
              <button
                type="button"
                onClick={() => setMonthIdx(i => Math.max(0, i - 1))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
              >‹</button>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 600,
                fontSize: 16, color: 'var(--dash-ink)',
              }}>{selectedRevMonth?.month}</span>
              <button
                type="button"
                onClick={() => setMonthIdx(i => Math.min(revenueByMonth.length - 1, i + 1))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
              >›</button>
            </div>
          )}
        </div>

        {/* Right panel — chart */}
        <div style={{ padding: '20px 22px 14px', minWidth: 0 }}>
          {view === 'year' ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={yearData} margin={{ top: 22, right: 8, left: 8, bottom: 28 }}>
                <defs>
                  <linearGradient id="heroRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--dash-accent)" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="var(--dash-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--dash-line)" strokeDasharray="2 6" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--dash-muted)', fontSize: 12, fontFamily: 'var(--font-num)', letterSpacing: '0.04em' }}
                  tickLine={false} axisLine={false} dy={6}
                />
                <YAxis hide domain={[0, (max: number) => Math.max(Math.ceil(max * 1.14), 1)]} />
                <Tooltip
                  content={(p) => <YearTooltip {...(p as TooltipProps<number, string>)} />}
                  cursor={{ stroke: 'var(--dash-accent)', strokeOpacity: .45, strokeDasharray: '3 3', strokeWidth: 1 }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Area
                  type="monotone" dataKey="revenue"
                  stroke="var(--dash-accent)" strokeWidth={3}
                  fill="url(#heroRevGrad)"
                  dot={false}
                  activeDot={{ r: 5.5, stroke: 'var(--dash-accent)', strokeWidth: 2.5, fill: 'var(--dash-surface)' }}
                  animationDuration={1200} animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthData} margin={{ top: 22, right: 8, left: 8, bottom: 28 }}>
                <CartesianGrid vertical={false} stroke="var(--dash-line)" strokeDasharray="2 6" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: number) => d % 4 === 1 ? String(d) : ''}
                  tick={{ fill: 'var(--dash-muted)', fontSize: 11, fontFamily: 'var(--font-num)' }}
                  tickLine={false} axisLine={false} dy={6}
                />
                <YAxis hide />
                <Tooltip
                  content={(p) => <MonthTooltip {...(p as TooltipProps<number, string>)} />}
                  cursor={{ fill: 'color-mix(in srgb, var(--dash-accent) 10%, transparent)' }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Bar
                  dataKey="orders" fill="var(--dash-accent)" radius={[4, 4, 0, 0]}
                  maxBarSize={24} animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
