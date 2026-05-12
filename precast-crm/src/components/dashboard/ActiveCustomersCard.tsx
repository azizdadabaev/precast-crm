"use client";

import { Card } from "./Card";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function ActiveCustomersCard({
  data,
}: {
  data: DashboardData["activeCustomers"];
}) {
  const t = useT();
  const label = t("Фаол мижозлар", "Active customers");
  if (data.count === 0) {
    return (
      <Card
        label={label}
        value={<span className="dash-card-empty">{t("Ҳозирча мижоз йўқ", "No customers yet")}</span>}
      />
    );
  }
  const { paid, partial, awaiting } = data.breakdown;
  return (
    <Card
      label={label}
      value={String(data.count)}
      meta={`${paid} ${t("тўланган", "paid")} · ${partial} ${t("қисман", "partial")} · ${awaiting} ${t("кутилмоқда", "awaiting")}`}
    />
  );
}
