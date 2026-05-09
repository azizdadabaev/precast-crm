"use client";

import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function CashOnTheRoadCard({
  data,
}: {
  data: DashboardData["cashOnTheRoad"];
}) {
  if (data.total === 0) {
    return (
      <Card
        label="Cash on the road"
        value={<span className="dash-card-empty">No active dispatches</span>}
      />
    );
  }
  return (
    <Card
      label="Cash on the road"
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.dispatchCount} drivers · in transit`}
      attention="warning"
    />
  );
}
