'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/fetcher';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { HeroChart } from '@/components/dashboard/HeroChart';
import { FinancialKPIs } from '@/components/dashboard/FinancialKPIs';
import { OperationalKPIs } from '@/components/dashboard/OperationalKPIs';
import { RegionRanking } from '@/components/dashboard/RegionRanking';
import { TopClients } from '@/components/dashboard/TopClients';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { PaymentDonut } from '@/components/dashboard/PaymentDonut';
import { DateBasisToggle } from '@/components/dashboard/DateBasisToggle';
import { remapMonthIndex, type DateBasis } from '@/lib/dashboard-metrics';
import type { DashboardData } from '@/components/dashboard/types';

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontSize: 12, letterSpacing: '.18em',
  textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 700,
  margin: '0 0 14px',
};

export default function DashboardPage() {
  // Selected month, as an index into the 12-month window. `null` means
  // "the latest bucket" = the current calendar month, which is the
  // default; it lives here rather than inside HeroChart because the same
  // selection also scopes the financial KPI cards below the chart.
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Which of the order's two dates Booked / AOV / the hero chart are filed
  // under. 'order' = `placedAt` (immutable, trailing 12 months) is the
  // default; 'delivery' = `scheduledAt` (mutable, window reaches 3 months
  // forward) exists because work rescheduled into a future month otherwise
  // reads as zero everywhere on this page. Collected never follows it.
  const [basis, setBasis] = useState<DateBasis>('order');

  // Real per-day orders for the hero chart’s monthly view. Previously that
  // view rendered a generated sine wave; this endpoint already computed the
  // real numbers and had no consumer.
  const { data: monthly } = useQuery<{
    months: Array<{ monthKey: string }>;
    days: Array<{ date: number; monthKey: string; orderCount: number; booked: number }>;
  }>({
    queryKey: ['dashboard-monthly-revenue'],
    queryFn: () => api('/api/dashboard/monthly-revenue'),
    staleTime: 60_000,
    retry: false,
  });

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/dashboard'),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    retry: false,
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  if (error) {
    const msg = (error as Error).message ?? '';
    const forbidden = /403|only admin|only owner/i.test(msg);
    return (
      <div className="dashboard-root" style={{ background: 'var(--dash-bg)', minHeight: '100%', padding: '34px 28px 64px', fontFamily: 'var(--font-body-alt)' }}>
        <p style={{ color: 'var(--dash-muted)', fontFamily: 'var(--font-body-alt)' }}>
          {forbidden
            ? 'Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.'
            : `Юклаб бўлмади: ${msg}`}
        </p>
      </div>
    );
  }

  // The active series. Both shapes expose the same index-aligned
  // bookedByMonth / collectedByMonth / ordersByMonth / monthKeys, so one
  // month index scopes the chart and every card on either basis.
  const series = basis === 'delivery' ? data.deliveryBasis : data;

  // Clamp against the series actually delivered. The current month is the
  // LAST index on the order basis but NOT on the delivery basis, whose
  // window carries committed future months after it.
  const lastMonthIdx = Math.max(series.bookedByMonth.length - 1, 0);
  const currentIdx = Math.min(Math.max(series.currentMonthIdx, 0), lastMonthIdx);
  const monthIdx = Math.min(Math.max(selectedMonth ?? currentIdx, 0), lastMonthIdx);
  const isCurrentMonth = monthIdx === currentIdx;
  const isFutureMonth = monthIdx > currentIdx;
  const monthLabel = series.bookedByMonth[monthIdx]?.month ?? '';

  /**
   * Flipping the basis keeps the SAME calendar month selected rather than
   * letting the index mean a different month on the other window (the two
   * windows start at different months). A month with no counterpart — a
   * future month, when switching back to the order basis — clamps into
   * range instead of crashing. `null` means "follow the current month" and
   * needs no remapping.
   */
  const handleBasisChange = (next: DateBasis) => {
    if (next === basis) return;
    if (selectedMonth !== null) {
      const fromKeys = basis === 'delivery' ? data.deliveryBasis.monthKeys : data.monthKeys;
      const toKeys = next === 'delivery' ? data.deliveryBasis.monthKeys : data.monthKeys;
      setSelectedMonth(remapMonthIndex(fromKeys, toKeys, monthIdx));
    }
    setBasis(next);
  };

  return (
    <div className="dashboard-root" style={{
      background: 'var(--dash-bg)', minHeight: '100%',
      fontFamily: 'var(--font-body-alt)',
    }}>
      <div style={{ padding: '34px 28px 64px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26 }}>
          <div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 48, lineHeight: 1.02, letterSpacing: '-.015em',
              color: 'var(--dash-ink)',
            }}>Бошқарув</h1>
            <p style={{
              margin: '10px 0 0', fontFamily: 'var(--font-body-alt)',
              fontSize: 15.5, color: 'var(--dash-muted)', maxWidth: 560,
            }}>
              Даромад, операциялар ва мижозлар фаолиятининг реал вақтдаги кўриниши.
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 13px', border: '1px solid var(--dash-line)',
            borderRadius: 999, background: 'var(--dash-surface)', whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--dash-pos)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--dash-pos) 22%, transparent)',
            }} />
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 12.5, color: 'var(--dash-muted)' }}>
              {new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Hero chart — owns the month picker, but not the selection */}
        <HeroChart
          bookedByMonth={series.bookedByMonth}
          ordersByMonth={series.ordersByMonth}
          dailyByDay={basis === 'delivery' ? data.deliveryBasis.dailyByDay : monthly?.days}
          monthKeys={series.monthKeys}
          monthIdx={monthIdx}
          onMonthChange={setSelectedMonth}
          basis={basis}
          currentIdx={currentIdx}
        />

        {/* Date basis — one clock for Booked, AOV and the hero chart. */}
        <DateBasisToggle basis={basis} onChange={handleBasisChange} />

        {/* Financial KPIs — scoped to the month picked in the hero chart */}
        <div style={{ ...SECTION_LABEL, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>Молиявий ҳолат · {isCurrentMonth ? 'жорий ой' : `${monthLabel} ойи`}</span>
          {!isCurrentMonth && (
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 11, fontWeight: 700,
              letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999,
              color: 'var(--dash-accent2)',
              background: 'color-mix(in srgb, var(--dash-accent2) 14%, transparent)',
            }}>
              {isFutureMonth
                ? 'келажак ой · future month'
                : 'танланган ой · not current month'}
            </span>
          )}
        </div>
        <FinancialKPIs
          data={data}
          monthIdx={monthIdx}
          basis={basis}
          currentIdx={currentIdx}
        />

        {/* Operational KPIs */}
        <div style={SECTION_LABEL}>Операцион ҳолат</div>
        <OperationalKPIs data={data} />

        {/* Bottom widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 0.85fr', gap: 16 }}>
          <TopClients clients={data.topCustomers} />
          <RecentOrders orders={data.recentOrders} />
          <PaymentDonut breakdown={data.ordersByPaymentState} />
        </div>

        {/* Region ranking sits below the per-order widgets: it answers a
            slower, territory-level question than the daily operational
            cards above. All-time, deliberately not month-scoped. */}
        <RegionRanking regions={data.ordersByRegion} />

      </div>
    </div>
  );
}
