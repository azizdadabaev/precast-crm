"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import type { GazoblokDashboard } from "@/lib/gazoblok-dashboard";
import { useT } from "@/lib/i18n";
import { GazoblokKpis } from "@/components/gazoblok/dashboard/GazoblokKpis";
import { GazoblokRevenueChart } from "@/components/gazoblok/dashboard/GazoblokRevenueChart";
import { GazoblokOverloadTable } from "@/components/gazoblok/dashboard/GazoblokOverloadTable";
import { GazoblokStockTable } from "@/components/gazoblok/dashboard/GazoblokStockTable";
import { GazoblokDayPlan } from "@/components/gazoblok/dashboard/GazoblokDayPlan";

function SkeletonBlock({ h }: { h: string }) {
  return <div className={`${h} rounded-lg border border-border bg-muted animate-pulse`} />;
}

/**
 * Gazoblok's own dashboard, apart from the beam-and-block one. Money arrives as
 * `null` for dashboard.viewBasic users (stripped server-side), so those users see
 * only stock and the 7-day plan.
 */
export default function GazoblokDashboardPage() {
  const t = useT();
  const q = useQuery<GazoblokDashboard>({
    queryKey: ["gazoblok-dashboard"],
    queryFn: () => api<GazoblokDashboard>("/api/gazoblok/dashboard"),
    refetchInterval: 60_000,
    retry: false,
  });
  // null = follow the newest month; a click pins the chosen one.
  const [picked, setPicked] = useState<number | null>(null);
  const data = q.data;
  const money = data?.money ?? null;
  const monthIdx = picked ?? Math.max(0, (money?.months.length ?? 1) - 1);

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl md:text-3xl font-semibold tracking-tight">
          Газоблок бошқаруви
          <span className="lang-en text-muted-foreground font-normal text-base"> · Gazoblok dashboard</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Пул, қарзлар, омбор ва режа. Йиғма монолитдан алоҳида.",
            "Money, debts, stock and plan. Separate from beam-and-block.",
          )}
        </p>
      </div>

      {q.isLoading ? (
        <div className="space-y-5">
          <SkeletonBlock h="h-28" />
          <SkeletonBlock h="h-56" />
          <div className="grid gap-5 lg:grid-cols-2">
            <SkeletonBlock h="h-48" />
            <SkeletonBlock h="h-48" />
          </div>
        </div>
      ) : q.isError || !data ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
          {t("Юклаб бўлмади", "Could not load")}: {q.error instanceof Error ? q.error.message : "—"}
        </p>
      ) : (
        <>
          {money && (
            <>
              <GazoblokKpis money={money} monthIdx={monthIdx} />
              <GazoblokRevenueChart months={money.months} selected={monthIdx} onSelect={setPicked} />
            </>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            {money && <GazoblokOverloadTable overload={money.overload} />}
            <div className={money ? "min-w-0" : "min-w-0 lg:col-span-2"}>
              <GazoblokStockTable stock={data.stock} />
            </div>
          </div>
          <GazoblokDayPlan plan={data.plan} unscheduledOpen={data.unscheduledOpen} />
        </>
      )}
    </div>
  );
}
