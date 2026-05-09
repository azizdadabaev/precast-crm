"use client";

import { useRouter } from "next/navigation";
import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["outstandingReceivables"];
}

export function ReceivablesCard({ data }: Props) {
  const router = useRouter();
  if (data.total === 0) {
    return (
      <MetricCard
        value="0"
        label="ҚАРЗДОРЛИК · Outstanding"
        sublabel="Барчаси тўланган · All clear"
      />
    );
  }
  return (
    <MetricCard
      variant="critical"
      value={formatNumber(data.total, 0)}
      label="ҚАРЗДОРЛИК · Outstanding (UZS)"
      sublabel={`${data.orderCount} та буюртма · ${data.orderCount} orders`}
      onClick={() => router.push("/orders")}
    />
  );
}
