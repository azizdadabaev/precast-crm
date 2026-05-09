"use client";

import type { Trend } from "./types";

/**
 * The trend pill — small green / red / neutral tag rendered in the
 * upper-right of a KPI card. Color comes from BOTH the direction of
 * the change and the metric's polarity:
 *
 *   - Revenue ↑ (positive polarity, up direction)  → green
 *   - Revenue ↓ (positive polarity, down direction) → red
 *   - Receivables ↑ (negative polarity, up)         → red (bad)
 *   - Receivables ↓ (negative polarity, down)       → green (good)
 *   - |delta| < 1% (flat)                           → neutral gray
 *
 * This is the only place green/red color appears in rows 1-2 of the
 * dashboard. Everything else is neutral.
 */
export function TrendIndicator({ trend }: { trend: Trend | null }) {
  if (!trend) return null;
  const { direction, polarity, deltaPct } = trend;

  let cls = "dash-trend-flat";
  if (direction !== "flat") {
    const isGood =
      polarity === "negative" ? direction === "down" : direction === "up";
    cls = direction === "up"
      ? isGood
        ? "dash-trend-up-good"
        : "dash-trend-up-bad"
      : isGood
        ? "dash-trend-down-good"
        : "dash-trend-down-bad";
  }

  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const sign = deltaPct > 0 ? "+" : "";
  return (
    <span className={`dash-trend ${cls}`}>
      {arrow} {sign}
      {deltaPct}%
    </span>
  );
}
