"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function OpenDiscrepanciesCard({
  data,
}: {
  data: DashboardData["openDiscrepancies"];
}) {
  const t = useT();
  const router = useRouter();
  const label = t("Очиқ тафовутлар", "Open discrepancies");
  if (data.count === 0) {
    return (
      <Card
        label={label}
        value={<span className="dash-card-empty">{t("Тафовут йўқ", "All clear")}</span>}
      />
    );
  }
  return (
    <Card
      label={label}
      value={String(data.count)}
      meta={`${formatNumber(data.totalAmount, 0)} UZS ${t("ҳал қилинмаган", "unresolved")}`}
      attention="warning"
      onClick={() => router.push("/discrepancies")}
    />
  );
}
