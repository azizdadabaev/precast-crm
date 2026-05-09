"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function TodayDeliveriesCard({
  data,
}: {
  data: DashboardData["todayDeliveries"];
}) {
  const router = useRouter();
  if (data.count === 0) {
    return (
      <Card
        label="Deliveries today"
        value={<span className="dash-card-empty">No deliveries</span>}
      />
    );
  }
  return (
    <Card
      label="Deliveries today"
      value={String(data.count)}
      meta={`${formatNumber(data.totalArea, 1)} m² scheduled`}
      onClick={() => router.push("/orders")}
    />
  );
}
