"use client";

import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function RevenueAllTimeCard({
  data,
}: {
  data: DashboardData["revenueAllTime"];
}) {
  if (data.total === 0) {
    return (
      <Card label="Revenue all time" value={<span className="dash-card-empty">No revenue yet</span>} />
    );
  }
  return (
    <Card
      label="Revenue all time"
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} orders since inception`}
    />
  );
}
