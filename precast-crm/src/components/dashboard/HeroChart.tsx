'use client';

import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, type TooltipProps,
} from 'recharts';
import type { DateBasis } from '@/lib/dashboard-metrics';
import { buildMonthDays, todayMarkerFor } from '@/lib/month-days';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function compact(n: number): { value: string; unit: string } {
  if (n >= 1e9) return { value: (n / 1e9).toFixed(2).replace('.', ','), unit: 'млрд UZS' };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1).replace('.', ','), unit: 'млн UZS' };
  return { value: fmt(n), unit: 'UZS' };
}


function YearTooltip(
  { active, payload, basis }: TooltipProps<number, string> & { basis: DateBasis },
) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { month: string; booked: number; count: number } | undefined;
  if (!d) return null;
  const basisNote = basis === 'delivery' ? 'етказиш санаси' : 'буюртма санаси';
  return (
    <div style={{
      background: 'var(--dash-ink)', color: 'var(--dash-bg)',
      borderRadius: 9, padding: '9px 12px',
      boxShadow: '0 12px 30px -10px rgba(0,0,0,.45)',
      fontFamily: 'var(--font-body-alt)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>{d.month}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма қилинган</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{fmt(d.booked)} UZS</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.count} та</span>
      </div>
      <div style={{ fontSize: 11, opacity: .55, marginTop: 4 }}>{basisNote} бўйича</div>
    </div>
  );
}

function MonthTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as
    | { day: number; orders: number; booked: number; future: boolean }
    | undefined;
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
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.orders} та буюртма</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма қилинган</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{fmt(d.booked)} UZS</span>
      </div>
      {/* A future delivery date has not happened yet. Saying so is the whole
          point of the hollow bar — the tooltip must not contradict it. */}
      {d.future && (
        <div style={{ fontSize: 11, opacity: .55, marginTop: 4 }}>режалаштирилган · not yet delivered</div>
      )}
    </div>
  );
}

interface Props {
  /** «Буюртма қилинган · Booked» — Σ Order.totalPrice bucketed by
   *  `placedAt`. Explicitly NOT cash received (that is the Collected KPI
   *  card, fed from the Payment table). Never render as bare "даромад". */
  bookedByMonth: Array<{ month: string; booked: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  /** Real per-day activity from /api/dashboard/monthly-revenue. Sparse —
   *  only days that actually had orders. `monthKey` is YYYY-MM in LOCAL
   *  time, matching how every other bucket in the app is keyed.
   *  Replaces a generated sine wave that used to render here as if it
   *  were real business data. `booked` is that day's Σ totalPrice. */
  dailyByDay?: Array<{ date: number; monthKey: string; orderCount: number; booked: number }>;
  /** YYYY-MM keys aligned 1:1 with bookedByMonth, so a selected month can
   *  be matched to its days. */
  monthKeys?: string[];
  /**
   * Selected month as an index into `bookedByMonth` (last = current
   * month). CONTROLLED by the dashboard page, because the same selection
   * also scopes the financial KPI cards below the chart.
   */
  monthIdx: number;
  onMonthChange: (idx: number) => void;
  /**
   * Which of the order's two dates the series above are bucketed by.
   * 'order' = `placedAt` (immutable, trailing window only); 'delivery' =
   * `scheduledAt` (mutable, window reaches into the future). Only changes
   * labels here — the arithmetic is done server-side.
   */
  basis: DateBasis;
  /**
   * Index of the month containing today. Equal to the last index on the
   * order basis, but NOT on the delivery basis, whose window carries
   * future months after it.
   */
  currentIdx: number;
}

export function HeroChart({
  bookedByMonth, ordersByMonth, dailyByDay, monthKeys, monthIdx, onMonthChange,
  basis, currentIdx,
}: Props) {
  const [view, setView] = useState<'year' | 'month'>('year');
  const lastIdx = bookedByMonth.length - 1;
  // The current month is the LAST bucket on the order basis, but sits
  // three buckets from the end on the delivery basis, whose window carries
  // committed future work. Never assume `lastIdx` is today.
  const curIdx = Math.min(Math.max(currentIdx, 0), Math.max(lastIdx, 0));
  const futureMonths = Math.max(lastIdx - curIdx, 0);

  const yearTotal = bookedByMonth.reduce((s, m) => s + m.booked, 0);
  const yearOrders = ordersByMonth.reduce((s, m) => s + m.count, 0);
  // Headline delta = the CURRENT month vs the one before it. Comparing the
  // last two buckets would, on the delivery basis, compare two future
  // months that are still filling up and report a meaningless collapse.
  const currentMonth = bookedByMonth[curIdx];
  const monthBeforeCurrent = curIdx > 0 ? bookedByMonth[curIdx - 1] : undefined;
  const deltaPct = currentMonth && monthBeforeCurrent && monthBeforeCurrent.booked > 0
    ? ((currentMonth.booked - monthBeforeCurrent.booked) / monthBeforeCurrent.booked * 100)
    : null;

  const selectedBookedMonth = bookedByMonth[monthIdx];
  const selectedOrdMonth = ordersByMonth[monthIdx];
  const prevBookedMonth = monthIdx > 0 ? bookedByMonth[monthIdx - 1] : null;
  const monthDeltaPct = prevBookedMonth && prevBookedMonth.booked > 0 && selectedBookedMonth
    ? ((selectedBookedMonth.booked - prevBookedMonth.booked) / prevBookedMonth.booked * 100)
    : null;

  const yearData = bookedByMonth.map((m, i) => ({ ...m, count: ordersByMonth[i]?.count ?? 0 }));
  // Real orders for the selected month. The API returns only days that had
  // activity, so zero-fill the rest — an absent day is a real zero, and
  // omitting it would draw a misleadingly continuous line.
  // `future` is what makes a scheduled-but-not-yet-delivered day render
  // hollow. See src/lib/month-days.ts — the rule is unit-tested there.
  const selectedKey = monthKeys?.[monthIdx];
  const now = new Date();
  const monthData = buildMonthDays(selectedKey, dailyByDay, now);
  const todayMarker = todayMarkerFor(selectedKey, now);

  const isDelivery = basis === 'delivery';
  const windowMonths = bookedByMonth.length;
  const isFutureMonth = monthIdx > curIdx;

  const { value: headValue, unit: headUnit } = view === 'year'
    ? compact(yearTotal)
    : compact(selectedBookedMonth?.booked ?? 0);

  const headLabel = view === 'year'
    ? `${windowMonths} ОЙЛИК БУЮРТМА · BOOKED`
    : `${selectedBookedMonth?.month ?? ''} ОЙИ · BOOKED`;

  // The basis is printed under the headline rather than implied, so the
  // figure can never be read as the other date's number.
  const basisCaption = isDelivery
    ? 'Етказиш санаси бўйича · by delivery date'
    : 'Буюртма санаси бўйича · by order date';

  const headSub = view === 'year'
    ? (isDelivery
        ? `${fmt(yearOrders)} та буюртма · сўнгги ${curIdx} ой, жорий ва кейинги ${futureMonths} ой`
        : `${fmt(yearOrders)} та буюртма · сўнгги ${windowMonths} ой`)
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
          <div style={{
            marginTop: 5, fontFamily: 'var(--font-body-alt)',
            fontSize: 11.5, color: 'var(--dash-muted)',
          }}>{basisCaption}</div>

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

          {/* View toggle. Leaving the monthly view snaps the selection back
              to the current month so the KPI cards below can never stay
              pinned to a month whose picker is no longer on screen. */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 24, padding: 4,
            background: 'var(--dash-surface2)',
            border: '1px solid var(--dash-line)', borderRadius: 10,
          }}>
            <button
              type="button"
              onClick={() => { setView('year'); onMonthChange(curIdx); }}
              style={view === 'year' ? btnActive : btnInactive}
            >{windowMonths} ой · Booked</button>
            <button
              type="button"
              onClick={() => setView('month')}
              style={view === 'month' ? btnActive : btnInactive}
            >Ойлик буюртма</button>
          </div>

          {view === 'month' && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 10, padding: '6px 8px',
                border: '1px solid var(--dash-line)', borderRadius: 9,
              }}>
                <button
                  type="button"
                  aria-label="Олдинги ой"
                  onClick={() => onMonthChange(Math.max(0, monthIdx - 1))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
                >‹</button>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  fontSize: 16, color: 'var(--dash-ink)',
                }}>{selectedBookedMonth?.month}</span>
                <button
                  type="button"
                  aria-label="Кейинги ой"
                  onClick={() => onMonthChange(Math.min(lastIdx, monthIdx + 1))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
                >›</button>
              </div>
              <div style={{
                marginTop: 8, fontFamily: 'var(--font-body-alt)',
                fontSize: 11.5, lineHeight: 1.45, color: 'var(--dash-muted)',
              }}>
                Танланган ой қуйидаги молиявий кўрсаткичларга ҳам таъсир қилади.
              </div>
              {/* Only worth explaining when a hollow bar is actually on screen. */}
              {monthData.some((d) => d.future && d.orders > 0) && (
                <div style={{
                  marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-body-alt)', fontSize: 11.5,
                  lineHeight: 1.45, color: 'var(--dash-muted)',
                }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, flexShrink: 0,
                    border: '1.5px dashed var(--dash-accent)', borderRadius: 2,
                  }} />
                  Пунктир — режалаштирилган, ҳали етказилмаган
                </div>
              )}
              {isFutureMonth && (
                <div style={{
                  marginTop: 6, fontFamily: 'var(--font-body-alt)',
                  fontSize: 11.5, lineHeight: 1.45, color: 'var(--dash-accent2)',
                  fontWeight: 600,
                }}>
                  Келажак ой · режалаштирилган етказишлар
                </div>
              )}
            </>
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
                  content={(p) => (
                    <YearTooltip {...(p as TooltipProps<number, string>)} basis={basis} />
                  )}
                  cursor={{ stroke: 'var(--dash-accent)', strokeOpacity: .45, strokeDasharray: '3 3', strokeWidth: 1 }}
                  wrapperStyle={{ outline: 'none' }}
                />
                {/* Everything right of this line is promised, not delivered —
                    only drawn when the window actually carries future months. */}
                {futureMonths > 0 && currentMonth && (
                  <ReferenceLine
                    x={currentMonth.month}
                    stroke="var(--dash-accent2)"
                    strokeDasharray="4 4"
                    label={{
                      value: 'жорий ой',
                      position: 'top',
                      fill: 'var(--dash-accent2)',
                      fontSize: 11,
                      fontFamily: 'var(--font-num)',
                    }}
                  />
                )}
                <Area
                  type="monotone" dataKey="booked"
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
                {/* «Бугун» — the line between what happened and what is
                    merely promised. Only drawn when today is in view. */}
                {todayMarker !== null && (
                  <ReferenceLine
                    x={todayMarker}
                    stroke="var(--dash-muted)"
                    strokeDasharray="3 4"
                    label={{
                      value: 'бугун',
                      position: 'insideTopRight',
                      fill: 'var(--dash-muted)',
                      fontSize: 10,
                      fontFamily: 'var(--font-num)',
                    }}
                  />
                )}
                <Bar
                  dataKey="orders" radius={[4, 4, 0, 0]}
                  maxBarSize={24} animationDuration={800}
                >
                  {monthData.map((d) => (
                    // Hollow = scheduled but not yet delivered. Same accent
                    // hue so it still reads as one series, but unmistakably
                    // not a completed day.
                    <Cell
                      key={d.day}
                      fill={d.future ? 'transparent' : 'var(--dash-accent)'}
                      stroke="var(--dash-accent)"
                      strokeWidth={d.future ? 1.5 : 0}
                      strokeDasharray={d.future ? '3 2' : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
