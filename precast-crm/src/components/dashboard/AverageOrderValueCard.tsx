"use client";

import { Card } from "./Card";
import { TrendIndicator } from "./TrendIndicator";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function AverageOrderValueCard({
  data,
}: {
  data: DashboardData["averageOrderValue"];
}) {
  const t = useT();
  const label = t("Ўртача буюртма қиймати", "Avg order value");
  if (data.thisMonth === 0 && data.allTime === 0) {
    return (
      <Card label={label} value={<span className="dash-card-empty">{t("Ҳозирча буюртма йўқ", "No orders yet")}</span>} />
    );
  }
  return (
    <Card
      label={label}
      headerRight={<TrendIndicator trend={data.trend} />}
      value={formatNumber(data.thisMonth, 0)}
      unit="UZS"
      meta={`${t("Жами ўртача:", "All-time avg:")} ${formatNumber(data.allTime, 0)} UZS`}
    />
  );
}
