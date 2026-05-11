"use client";

import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function CashOnTheRoadCard({
  data,
}: {
  data: DashboardData["cashOnTheRoad"];
}) {
  const t = useT();
  const label = t("Йўлдаги нақд пул", "Cash on the road");
  if (data.total === 0) {
    return (
      <Card
        label={label}
        value={<span className="dash-card-empty">{t("Фаол жўнатиш йўқ", "No active dispatches")}</span>}
      />
    );
  }
  return (
    <Card
      label={label}
      value={formatNumber(data.total, 0)}
      unit="UZS"
      meta={`${data.dispatchCount} ${t("ҳайдовчи · йўлда", "drivers · in transit")}`}
      attention="warning"
    />
  );
}
