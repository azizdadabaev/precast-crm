"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function OpenDiscrepanciesCard({
  data,
}: {
  data: DashboardData["openDiscrepancies"];
}) {
  const router = useRouter();
  if (data.count === 0) {
    return (
      <Card
        label="Open discrepancies"
        value={<span className="dash-card-empty">All clear</span>}
      />
    );
  }
  return (
    <Card
      label="Open discrepancies"
      value={String(data.count)}
      meta={`${formatNumber(data.totalAmount, 0)} UZS unresolved`}
      attention="warning"
      onClick={() => router.push("/discrepancies")}
    />
  );
}
