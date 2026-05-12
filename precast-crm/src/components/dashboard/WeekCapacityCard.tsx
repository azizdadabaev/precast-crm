"use client";

import { Card } from "./Card";
import { useT } from "@/lib/i18n";
import type { DashboardData } from "./types";

const DOW_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LABELS_UZ = ["Душ", "Сеш", "Чор", "Пай", "Жум", "Шан", "Якш"];

function getLoadLevel(
  bookedM2: number,
): "available" | "moderate" | "heavy" | "overbooked" {
  if (bookedM2 <= 300) return "available";
  if (bookedM2 <= 450) return "moderate";
  if (bookedM2 <= 600) return "heavy";
  return "overbooked";
}

export function WeekCapacityCard({
  data,
}: {
  data: DashboardData["weekCapacity"];
}) {
  const t = useT();
  const label = t("Бу ҳафтанинг сиғими", "This week's capacity");
  const labels = t("uz", "en") === "uz" ? DOW_LABELS_UZ : DOW_LABELS_EN;
  if (data.days.length === 0) {
    return (
      <Card label={label} wide value={null}>
        <div className="dash-card-empty">{t("Маълумот етарли эмас", "Not enough data")}</div>
      </Card>
    );
  }

  return (
    <Card
      label={label}
      headerRight={
        <span className="dash-card-meta-inline">
          {data.utilizationPct}% {t("банд", "booked")}
        </span>
      }
      wide
      value={null}
    >
      <div className="dash-week-strip">
        {data.days.map((d, i) => {
          const fillPct = Math.min(
            (d.bookedM2 / Math.max(d.capacityM2, 1)) * 100,
            100,
          );
          return (
            <div key={d.date} className="dash-week-day">
              <span className="dash-week-label">{labels[i]}</span>
              <div
                className="dash-week-bar"
                data-load={getLoadLevel(d.bookedM2)}
              >
                <div
                  className="dash-week-fill"
                  style={{ height: `${fillPct}%` }}
                />
              </div>
              <span className="dash-week-value">{Math.round(d.bookedM2)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
