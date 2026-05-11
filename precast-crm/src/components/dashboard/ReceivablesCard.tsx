"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function ReceivablesCard({
  data,
}: {
  data: DashboardData["outstandingReceivables"];
}) {
  const t = useT();
  const router = useRouter();
  const label = t("Қарздорлик", "Outstanding");
  if (data.total === 0) {
    return <Card label={label} value={<span className="dash-card-empty">{t("Қарздорлик йўқ", "All clear")}</span>} />;
  }
  return (
    <Card
      label={label}
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} ${t("буюртма тўлов кутмоқда", "orders awaiting payment")}`}
      attention="danger"
      onClick={() => router.push("/orders")}
    />
  );
}
