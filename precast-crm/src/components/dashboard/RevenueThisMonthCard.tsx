"use client";

import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["revenueThisMonth"];
}

export function RevenueThisMonthCard({ data }: Props) {
  if (data.total === 0) {
    return (
      <MetricCard
        value="0"
        label="ЖОРИЙ ОЙ · This month"
        sublabel="Бошланғич ой · Just getting started"
      />
    );
  }
  return (
    <MetricCard
      variant="success"
      value={`${formatNumber(data.total, 0)}`}
      label="ЖОРИЙ ОЙ · This month (UZS)"
      sublabel={`${data.orderCount} та буюртма · ${data.orderCount} orders`}
    />
  );
}
