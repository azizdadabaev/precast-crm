"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { RevenueThisMonthCard } from "@/components/dashboard/RevenueThisMonthCard";
import { RevenueAllTimeCard } from "@/components/dashboard/RevenueAllTimeCard";
import { AverageOrderValueCard } from "@/components/dashboard/AverageOrderValueCard";
import { ReceivablesCard } from "@/components/dashboard/ReceivablesCard";
import { ActiveCustomersCard } from "@/components/dashboard/ActiveCustomersCard";
import { TodayDeliveriesCard } from "@/components/dashboard/TodayDeliveriesCard";
import { OpenDiscrepanciesCard } from "@/components/dashboard/OpenDiscrepanciesCard";
import { CashOnTheRoadCard } from "@/components/dashboard/CashOnTheRoadCard";
import { CustomersByCityCard } from "@/components/dashboard/CustomersByCityCard";
import { TopCustomersCard } from "@/components/dashboard/TopCustomersCard";
import { WeekCapacityCard } from "@/components/dashboard/WeekCapacityCard";
import type { DashboardData } from "@/components/dashboard/types";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    retry: false,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    const msg = (error as Error).message ?? "";
    const forbidden = /403|only admin|only owner/i.test(msg);
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>Бошқарув · Dashboard</h1>
        </header>
        <article className="dash-card">
          <p
            style={{
              fontSize: "var(--dash-text-base)",
              color: "var(--dash-text-secondary)",
              margin: 0,
            }}
          >
            {forbidden
              ? "Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади."
              : `Юклаб бўлмади: ${msg}`}
          </p>
        </article>
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Бошқарув · Dashboard</h1>
        <p>Real-time view of revenue, operations, and customer activity.</p>
      </header>

      <section className="dashboard-section">
        <h2>Financial health</h2>
        <div className="dashboard-grid dashboard-grid-4">
          <RevenueThisMonthCard data={data.revenueThisMonth} />
          <RevenueAllTimeCard data={data.revenueAllTime} />
          <AverageOrderValueCard data={data.averageOrderValue} />
          <ReceivablesCard data={data.outstandingReceivables} />
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Operational status</h2>
        <div className="dashboard-grid dashboard-grid-4">
          <ActiveCustomersCard data={data.activeCustomers} />
          <TodayDeliveriesCard data={data.todayDeliveries} />
          <OpenDiscrepanciesCard data={data.openDiscrepancies} />
          <CashOnTheRoadCard data={data.cashOnTheRoad} />
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Business insights</h2>
        <div className="dashboard-grid dashboard-grid-3">
          <CustomersByCityCard data={data.customersByCity} />
          <TopCustomersCard data={data.topCustomers} />
          <WeekCapacityCard data={data.weekCapacity} />
        </div>
      </section>
    </div>
  );
}
