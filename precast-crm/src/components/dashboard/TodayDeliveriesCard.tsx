"use client";

import { useRouter } from "next/navigation";
import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["todayDeliveries"];
}

export function TodayDeliveriesCard({ data }: Props) {
  const router = useRouter();
  // Display the date in a compact, locale-friendly form (DD MMM).
  const d = new Date(data.date);
  const dateLabel = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });

  if (data.count === 0) {
    return (
      <MetricCard
        value="0"
        label={`БУГУНГИ · Today (${dateLabel})`}
        sublabel="Бугун тинч кун · A quiet day"
      />
    );
  }
  return (
    <MetricCard
      variant="success"
      value={`✓ ${data.count}`}
      label={`БУГУНГИ · Today (${dateLabel})`}
      sublabel={`${formatNumber(data.totalArea, 1)} m² етказиб бериш`}
      onClick={() => router.push("/orders")}
    />
  );
}
