"use client";

import { Card } from "./Card";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

export function CustomersByCityCard({
  data,
}: {
  data: DashboardData["customersByCity"];
}) {
  const t = useT();
  const label = t("Шаҳарлар бўйича мижозлар", "Customers by city");
  if (data.length === 0) {
    return (
      <Card label={label} wide value={null}>
        <div className="dash-card-empty">{t("Маълумот етарли эмас", "Not enough data")}</div>
      </Card>
    );
  }
  // Show top 6 named cities; surface "Other" + tail in the header.
  const named = data.filter((c) => c.city !== "Other");
  const charted = named.slice(0, 6);
  const tail = named.slice(6);
  const otherBucket = data.find((c) => c.city === "Other");
  const tailCount =
    tail.reduce((s, c) => s + c.count, 0) + (otherBucket?.count ?? 0);
  const max = Math.max(...charted.map((c) => c.count), 1);

  return (
    <Card
      label={label}
      headerRight={
        <span className="dash-card-meta-inline">{t("Юқори", "Top")} {charted.length}</span>
      }
      wide
      value={null}
    >
      <ul className="dash-bar-list">
        {charted.map((city) => (
          <li key={city.city}>
            <span className="dash-bar-label">{city.city}</span>
            <div className="dash-bar-track">
              <div
                className="dash-bar-fill"
                style={{ width: `${(city.count / max) * 100}%` }}
              />
            </div>
            <span className="dash-bar-value">{city.count}</span>
          </li>
        ))}
      </ul>
      {tailCount > 0 && (
        <p
          style={{
            fontSize: "var(--dash-text-xs)",
            color: "var(--dash-text-tertiary)",
            marginTop: "var(--dash-space-3)",
          }}
        >
          + {tailCount} {t("бошқа шаҳарларда", "in other cities")}
        </p>
      )}
    </Card>
  );
}
