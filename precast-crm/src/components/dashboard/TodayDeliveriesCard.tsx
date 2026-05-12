"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function TodayDeliveriesCard({
  data,
}: {
  data: DashboardData["todayDeliveries"];
}) {
  const t = useT();
  const router = useRouter();
  const label = t("Бугунги етказиб беришлар", "Deliveries today");
  if (data.count === 0) {
    return (
      <Card
        label={label}
        value={<span className="dash-card-empty">{t("Етказиб бериш йўқ", "No deliveries")}</span>}
      />
    );
  }
  return (
    <Card
      label={label}
      value={String(data.count)}
      meta={`${formatNumber(data.totalArea, 1)} m² ${t("режалаштирилган", "scheduled")}`}
      onClick={() => router.push("/orders")}
    />
  );
}
