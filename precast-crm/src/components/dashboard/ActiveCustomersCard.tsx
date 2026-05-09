"use client";

import { Card } from "./Card";
import type { DashboardData } from "./types";

export function ActiveCustomersCard({
  data,
}: {
  data: DashboardData["activeCustomers"];
}) {
  if (data.count === 0) {
    return (
      <Card
        label="Active customers"
        value={<span className="dash-card-empty">No customers yet</span>}
      />
    );
  }
  const { paid, partial, awaiting } = data.breakdown;
  return (
    <Card
      label="Active customers"
      value={String(data.count)}
      meta={`${paid} paid · ${partial} partial · ${awaiting} awaiting`}
    />
  );
}
