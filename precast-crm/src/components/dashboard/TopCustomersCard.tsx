"use client";

import { useRouter } from "next/navigation";
import { Card } from "./Card";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function TopCustomersCard({
  data,
}: {
  data: DashboardData["topCustomers"];
}) {
  const t = useT();
  const router = useRouter();
  const label = t("Юқори 5 мижоз", "Top 5 customers");
  if (data.length === 0) {
    return (
      <Card label={label} wide value={null}>
        <div className="dash-card-empty">{t("Маълумот етарли эмас", "Not enough data")}</div>
      </Card>
    );
  }
  return (
    <Card label={label} wide value={null}>
      <ol className="dash-list">
        {data.map((c, i) => (
          <li key={c.id} onClick={() => router.push(`/clients/${c.id}`)}>
            <span className="dash-list-rank">{i + 1}</span>
            <div className="dash-list-content">
              <span className="dash-list-primary">{c.name}</span>
              <span className="dash-list-secondary">
                {c.orderCount} {t("буюртма", "orders")}
              </span>
            </div>
            <span className="dash-list-value">
              {formatNumber(c.totalRevenue, 0)} UZS
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
