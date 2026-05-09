"use client";

import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function RevenueThisMonthCard({
  data,
}: {
  data: DashboardData["revenueThisMonth"];
}) {
  if (data.total === 0 && data.orderCount === 0) {
    return (
      <Card label="Revenue this month" value={<span className="dash-card-empty">No revenue yet</span>} />
    );
  }
  return (
    <Card
      label="Revenue this month"
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} orders · vs. last month`}
    />
  );
}
