'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/fetcher';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { HeroChart } from '@/components/dashboard/HeroChart';
import { FinancialKPIs } from '@/components/dashboard/FinancialKPIs';
import { OperationalKPIs } from '@/components/dashboard/OperationalKPIs';
import { TopClients } from '@/components/dashboard/TopClients';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { PaymentDonut } from '@/components/dashboard/PaymentDonut';
import type { DashboardData } from '@/components/dashboard/types';

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontSize: 12, letterSpacing: '.18em',
  textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 700,
  margin: '0 0 14px',
};

export default function DashboardPage() {
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

        {/* Hero chart */}
        <HeroChart
          revenueByMonth={data.revenueByMonth}
          ordersByMonth={data.ordersByMonth}
        />

        {/* Financial KPIs */}
        <div style={SECTION_LABEL}>Молиявий ҳолат</div>
        <FinancialKPIs data={data} />

        {/* Operational KPIs */}
        <div style={SECTION_LABEL}>Операцион ҳолат</div>
        <OperationalKPIs data={data} />

        {/* Bottom widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 0.85fr', gap: 16 }}>
          <TopClients clients={data.topCustomers} />
          <RecentOrders orders={data.recentOrders} />
          <PaymentDonut breakdown={data.activeCustomers.breakdown} />
        </div>

      </div>
    </div>
  );
}
