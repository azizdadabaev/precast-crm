"use client";

import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function AverageOrderValueCard({
  data,
}: {
  data: DashboardData["averageOrderValue"];
}) {
  if (data.thisMonth === 0 && data.allTime === 0) {
    return (
      <Card label="Avg order value" value={<span className="dash-card-empty">No orders yet</span>} />
    );
  }
  return (
    <Card
      label="Avg order value"
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.thisMonth, 0)}
      unit="UZS"
      meta={`All-time avg: ${formatNumber(data.allTime, 0)} UZS`}
    />
  );
}
