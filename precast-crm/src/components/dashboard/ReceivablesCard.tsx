"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

export function ReceivablesCard({
  data,
}: {
  data: DashboardData["outstandingReceivables"];
}) {
  const router = useRouter();
  if (data.total === 0) {
    return <Card label="Outstanding" value={<span className="dash-card-empty">All clear</span>} />;
  }
  return (
    <Card
      label="Outstanding"
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} orders awaiting payment`}
      attention="danger"
      onClick={() => router.push("/orders")}
    />
  );
}
