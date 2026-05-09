"use client";

import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["averageOrderValue"];
}

export function AverageOrderValueCard({ data }: Props) {
  if (data.thisMonth === 0 && data.allTime === 0) {
    return (
      <MetricCard
        value="—"
        label="ЎРТАЧА · Avg order"
        sublabel="Маълумот етарли эмас · Not enough data"
      />
    );
  }
  return (
    <MetricCard
      value={formatNumber(data.thisMonth, 0)}
      label="ЎРТАЧА — БУ ОЙ · Avg this month (UZS)"
      sublabel={`Жами ўртача: ${formatNumber(data.allTime, 0)} · All-time avg`}
    />
  );
}
