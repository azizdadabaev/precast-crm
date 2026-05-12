"use client";

import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function RevenueAllTimeCard({
  data,
}: {
  data: DashboardData["revenueAllTime"];
}) {
  const t = useT();
  const label = t("Жами даромад", "Revenue all time");
  if (data.total === 0) {
    return (
      <Card label={label} value={<span className="dash-card-empty">{t("Ҳозирча даромад йўқ", "No revenue yet")}</span>} />
    );
  }
  return (
    <Card
      label={label}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.orderCount} ${t("буюртма (бошланғичдан)", "orders since inception")}`}
    />
  );
}
