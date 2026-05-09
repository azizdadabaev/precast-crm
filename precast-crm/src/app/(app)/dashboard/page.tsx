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
      <div className="dashboard-page">
        <h1 className="dashboard-h1">Бошқарув · Dashboard</h1>
        <div className="ds-info-card mt-6">
          <p className="text-sm text-[var(--ds-text-dark)]">
            {forbidden
              ? "Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади."
              : `Юклаб бўлмади: ${msg}`}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return (
    <div className="dashboard-page space-y-12">
      <header>
        <h1 className="dashboard-h1">Бошқарув · Dashboard</h1>
        <p className="dashboard-subtitle">
          Real-time view of revenue, operations, and customer activity.
        </p>
      </header>

      <section>
        <h2 className="dashboard-section-title">
          1. Молиявий · Financial health
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <RevenueThisMonthCard data={data.revenueThisMonth} />
          <RevenueAllTimeCard data={data.revenueAllTime} />
          <AverageOrderValueCard data={data.averageOrderValue} />
          <ReceivablesCard data={data.outstandingReceivables} />
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">
          2. Иш ҳолати · Operational status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <ActiveCustomersCard data={data.activeCustomers} />
          <TodayDeliveriesCard data={data.todayDeliveries} />
          <OpenDiscrepanciesCard data={data.openDiscrepancies} />
          <CashOnTheRoadCard data={data.cashOnTheRoad} />
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">
          3. Бизнес ҳақида · Business insights
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CustomersByCityCard data={data.customersByCity} />
          <TopCustomersCard data={data.topCustomers} />
          <WeekCapacityCard data={data.weekCapacity} />
        </div>
      </section>
    </div>
  );
}
