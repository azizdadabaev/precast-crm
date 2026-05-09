"use client";

import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["revenueAllTime"];
}

export function RevenueAllTimeCard({ data }: Props) {
  return (
    <MetricCard
      value={data.total > 0 ? formatNumber(data.total, 0) : "0"}
      label="ЖАМИ · All time (UZS)"
      sublabel={`${data.orderCount} та буюртма · ${data.orderCount} orders`}
    />
  );
}
