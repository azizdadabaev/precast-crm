"use client";

import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["cashOnTheRoad"];
}

export function CashOnTheRoadCard({ data }: Props) {
  if (data.total === 0) {
    return (
      <MetricCard
        value="0"
        label="ЙЎЛДА НАҚД · Cash on the road"
        sublabel="Йўлда ҳеч ким йўқ · No active dispatches"
      />
    );
  }
  return (
    <MetricCard
      variant="warning"
      value={formatNumber(data.total, 0)}
      label="ЙЎЛДА НАҚД · Cash on the road (UZS)"
      sublabel={`${data.dispatchCount} ҳайдовчи · ${data.dispatchCount} drivers`}
    />
  );
}
