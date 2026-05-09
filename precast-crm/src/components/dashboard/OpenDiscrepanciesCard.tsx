"use client";

import { useRouter } from "next/navigation";
import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["openDiscrepancies"];
}

export function OpenDiscrepanciesCard({ data }: Props) {
  const router = useRouter();
  if (data.count === 0) {
    return (
      <MetricCard
        value="0"
        label="ТАФОВУТЛАР · Discrepancies"
        sublabel="Барчаси яхши · All clear"
      />
    );
  }
  return (
    <MetricCard
      variant="warning"
      value={`⚠ ${data.count}`}
      label="ТАФОВУТЛАР · Discrepancies"
      sublabel={`${formatNumber(data.totalAmount, 0)} UZS ҳал қилинмаган`}
      onClick={() => router.push("/discrepancies")}
    />
  );
}
