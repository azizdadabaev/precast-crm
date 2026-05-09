"use client";

import { InfoCard } from "./InfoCard";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["customersByCity"];
}

function getCityColor(index: number): string {
  // Top city: success-base. Next two: info-base. Rest of the named
  // cities: warning-base. The "Other" bar is always neutral.
  if (index === 0) return "var(--ds-success-base)";
  if (index < 4) return "var(--ds-info-base)";
  return "var(--ds-warning-base)";
}

export function CustomersByCityCard({ data }: Props) {
  if (data.length === 0) {
    return (
      <InfoCard title="ШАҲАРЛАР · Customers by city">
        <div className="flex-1 grid place-items-center text-sm text-[var(--ds-text-light)]">
          Маълумот етарли эмас · Not enough data
        </div>
      </InfoCard>
    );
  }

  // Show top 6 cities in the chart; surface the rest via a small line below.
  const charted = data.filter((c) => c.city !== "Other").slice(0, 6);
  const otherBucket = data.find((c) => c.city === "Other");
  const tail = data.filter((c) => c.city !== "Other").slice(6);
  const tailCount = tail.reduce((s, c) => s + c.count, 0);
  const max = Math.max(...charted.map((c) => c.count), 1);

  // SVG layout: each row is 38px tall, 6 rows = 228px + 30px header padding.
  const rowHeight = 38;
  const top = 14;
  const labelWidth = 96;
  const barAreaX = labelWidth + 8;
  const barAreaWidth = 220;
  const valueX = barAreaX + barAreaWidth + 14;
  const svgHeight = top + charted.length * rowHeight + 8;

  return (
    <InfoCard title="ШАҲАРЛАР · Customers by city">
      <svg
        viewBox={`0 0 400 ${svgHeight}`}
        className="w-full h-auto"
        role="img"
        aria-label="Customers by city — horizontal bar chart"
      >
        {charted.map((city, i) => {
          const y = top + i * rowHeight;
          const w = (city.count / max) * barAreaWidth;
          return (
            <g key={city.city}>
              <text
                x="0"
                y={y + 18}
                fontSize="13"
                fill="var(--ds-text-dark)"
                fontWeight="500"
              >
                {city.city}
              </text>
              <rect
                x={barAreaX}
                y={y}
                width={barAreaWidth}
                height="22"
                rx="11"
                fill="var(--ds-bg-dark)"
              />
              <rect
                x={barAreaX}
                y={y}
                width={Math.max(w, 4)}
                height="22"
                rx="11"
                fill={getCityColor(i)}
              />
              <text
                x={valueX}
                y={y + 16}
                fontSize="13"
                fill="var(--ds-text-dark)"
                fontWeight="bold"
              >
                {city.count}
              </text>
            </g>
          );
        })}
      </svg>

      {(tailCount > 0 || (otherBucket && otherBucket.count > 0)) && (
        <p className="text-xs text-[var(--ds-text-light)] mt-2">
          + {tailCount + (otherBucket?.count ?? 0)} бошқа шаҳарларда · in
          other cities
        </p>
      )}
    </InfoCard>
  );
}
