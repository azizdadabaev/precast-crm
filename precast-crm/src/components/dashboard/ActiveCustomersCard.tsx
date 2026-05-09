"use client";

import { MetricCard } from "./MetricCard";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["activeCustomers"];
}

export function ActiveCustomersCard({ data }: Props) {
  if (data.count === 0) {
    return (
      <MetricCard
        value="0"
        label="ФАОЛ МИЖОЗЛАР · Active customers"
        sublabel="Mижозлар йўқ ҳали · No customers yet"
      />
    );
  }
  const { paid, partial, awaiting } = data.breakdown;
  return (
    <MetricCard
      value={String(data.count)}
      label="ФАОЛ МИЖОЗЛАР · Active customers"
      sublabel={`${paid} тўланган · ${partial} қисман · ${awaiting} кутилмоқда`}
    />
  );
}
