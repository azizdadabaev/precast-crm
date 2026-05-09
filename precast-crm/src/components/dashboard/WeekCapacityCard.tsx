"use client";

import { InfoCard } from "./InfoCard";
import { describeArc } from "@/lib/svg-helpers";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["weekCapacity"];
}

function gaugeColor(pct: number): string {
  if (pct < 50) return "var(--ds-success-base)";
  if (pct < 75) return "var(--ds-info-base)";
  if (pct < 90) return "var(--ds-warning-base)";
  return "var(--ds-error-base)";
}

function dayColor(bookedM2: number): string {
  // Match the capacity calendar's published thresholds.
  if (bookedM2 <= 300) return "var(--ds-success-base)";
  if (bookedM2 <= 450) return "var(--ds-warning-base)";
  if (bookedM2 <= 600) return "var(--ds-process-base)";
  return "var(--ds-error-base)";
}

const DOW_LABELS = ["DU", "SE", "CH", "PA", "JU", "SH", "YA"]; // Mon..Sun

export function WeekCapacityCard({ data }: Props) {
  if (data.days.length === 0) {
    return (
      <InfoCard title="ХАФТАЛИК · This week's capacity">
        <div className="flex-1 grid place-items-center text-sm text-[var(--ds-text-light)]">
          Маълумот етарли эмас · Not enough data
        </div>
      </InfoCard>
    );
  }

  const pct = Math.max(0, Math.min(100, data.utilizationPct));
  // Half-circle: arc spans 0..180° going CW across the top. The
  // describeArc helper interprets degrees in that convention.
  const sweep = pct * 1.8;

  return (
    <InfoCard title="ХАФТАЛИК · This week's capacity">
      <div className="flex flex-col items-center flex-1">
        <svg
          viewBox="0 0 400 200"
          className="w-full max-w-xs h-auto"
          role="img"
          aria-label={`Weekly utilization ${pct}%`}
        >
          {/* Background arc */}
          <path
            d={describeArc(200, 180, 100, 0, 180)}
            stroke="var(--ds-bg-dark)"
            strokeWidth="28"
            fill="none"
            strokeLinecap="round"
          />
          {/* Progress arc */}
          {sweep > 0 && (
            <path
              d={describeArc(200, 180, 100, 0, sweep)}
              stroke={gaugeColor(pct)}
              strokeWidth="28"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {/* Center number */}
          <text
            x="200"
            y="170"
            textAnchor="middle"
            fontSize="42"
            fontWeight="bold"
            fill="var(--ds-text-dark)"
          >
            {pct}%
          </text>
          <text
            x="200"
            y="195"
            textAnchor="middle"
            fontSize="12"
            fill="var(--ds-text-medium)"
          >
            бронь қилинган · booked
          </text>
        </svg>

        {/* Day-by-day strip — Mon .. Sun. Bars fill from the bottom. */}
        <div className="grid grid-cols-7 gap-1 w-full mt-3">
          {data.days.map((d, i) => {
            const fillPct = Math.min(
              (d.bookedM2 / Math.max(d.capacityM2, 1)) * 100,
              100,
            );
            return (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--ds-text-medium)]">
                  {DOW_LABELS[i]}
                </span>
                <div className="w-full h-12 rounded relative overflow-hidden bg-[var(--ds-bg-dark)]">
                  <div
                    className="absolute bottom-0 left-0 w-full transition-all"
                    style={{
                      height: `${fillPct}%`,
                      background: dayColor(d.bookedM2),
                    }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-[var(--ds-text-light)]">
                  {Math.round(d.bookedM2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </InfoCard>
  );
}
