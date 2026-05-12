"use client";

import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function RevenueThisMonthCard({
  data,
}: {
  data: DashboardData["revenueThisMonth"];
}) {
  const t = useT();
  const label = t("Бу ойдаги даромад", "Revenue this month");
  if (data.total === 0 && data.orderCount === 0) {
    return (
      <Card label={label} value={<span className="dash-card-empty">{t("Ҳозирча даромад йўқ", "No revenue yet")}</span>} />
    );
  }
  return (
    <Card
      label={label}
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} ${t("буюртма · ўтган ойга нисбатан", "orders · vs. last month")}`}
    />
  );
}
