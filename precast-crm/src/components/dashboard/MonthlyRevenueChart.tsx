"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipProps,
} from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";

interface MonthPoint {
  monthKey: string;
  monthLabel: string;
  year: number;
  revenue: number;
  orderCount: number;
}

interface MonthlyRevenueResponse {
  months: MonthPoint[];
  total: number;
  totalOrders: number;
  trendPct: number | null;
}

/**
 * Format UZS revenue with intelligent compaction:
 *   1_250_000     → "1.25M"
 *   124_500_000   → "124.5M"
 *   2_300_000_000 → "2.3B"
 * Tabular numerals matter — they keep the headline number from
 * jittering as months tick over.
 */
function compact(n: number): { value: string; suffix: string } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return { value: (n / 1_000_000_000).toFixed(2), suffix: "млрд" };
  if (abs >= 1_000_000) return { value: (n / 1_000_000).toFixed(1), suffix: "млн" };
  if (abs >= 1_000) return { value: (n / 1_000).toFixed(0), suffix: "минг" };
  return { value: String(n), suffix: "" };
}

/**
 * Long-form formatter for the hover tooltip. Uses ru-RU grouping
 * (matches the rest of the app's `formatMoney`) so a Tashkent
 * operator reads "12 345 678" not "12,345,678".
 */
function longForm(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

/**
 * Custom tooltip — replaces Recharts' default white box with a
 * dark, editorial card that floats above the active dot. The arrow
 * triangle at the bottom points down at the data point. The
 * `active`/`payload` typing is loose because Recharts' TS surface
 * for custom tooltips is famously incomplete.
 */
function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as MonthPoint | undefined;
  if (!point) return null;
  return (
    <div className="relative -translate-y-2">
      <div
        className="rounded-md px-3 py-2 shadow-xl ring-1 ring-black/5"
        style={{
          background: "#0c0f1a",
          color: "#ffffff",
          minWidth: 150,
          fontFamily: "var(--font-manrope), sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
          }}
        >
          {point.monthLabel} {point.year}
        </div>
        <div
          style={{
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontWeight: 600,
            fontSize: "15px",
            marginTop: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {longForm(point.revenue)}
          <span
            style={{
              fontSize: "10px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.55)",
              marginLeft: 4,
              letterSpacing: "0.04em",
            }}
          >
            UZS
          </span>
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.5)",
            marginTop: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {point.orderCount} буюртма
        </div>
      </div>
      {/* Pointer triangle */}
      <div
        style={{
          position: "absolute",
          bottom: -5,
          left: "50%",
          transform: "translateX(-50%) rotate(45deg)",
          width: 10,
          height: 10,
          background: "#0c0f1a",
        }}
      />
    </div>
  );
}

/**
 * Editorial line chart of monthly revenue (last 12 months).
 *
 * Design choices:
 *   - Single emerald line, monotone interpolation, 2.5 px stroke.
 *     One color = one story; no rainbow noise.
 *   - Area gradient beneath the line, 22% → 0%. Suggests volume
 *     without competing with the headline number.
 *   - No Y-axis labels. The headline already names the scale; the
 *     reader doesn't need exact gridline values.
 *   - Horizontal dashed gridlines only, slate at 14% opacity.
 *   - X-axis in JetBrains Mono so abbreviated month names sit on a
 *     monospaced rhythm — matches the headline's tabular digits.
 *   - Dots only on the hovered point (Recharts `activeDot`),
 *     hollow with a glowing halo.
 *   - Mount animation: built-in Recharts area draw (~1.4 s).
 */
export function MonthlyRevenueChart() {
  const t = useT();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<MonthlyRevenueResponse>({
    queryKey: ["dashboard-monthly-revenue"],
    queryFn: () => api<MonthlyRevenueResponse>("/api/dashboard/monthly-revenue"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <article className="rev-chart rev-chart-loading">
        <div className="rev-chart-skeleton-head" />
        <div className="rev-chart-skeleton-area" />
      </article>
    );
  }

  if (error || !data) {
    return (
      <article className="rev-chart">
        <p style={{ color: "var(--dash-text-secondary)", fontSize: 13 }}>
          {t("Маълумотларни юклаб бўлмади.", "Could not load revenue data.")}
        </p>
      </article>
    );
  }

  const compactTotal = compact(data.total);
  const isUp = (data.trendPct ?? 0) >= 0;

  return (
    <article className="rev-chart">
      {/* Header — eyebrow, headline number, trend pill */}
      <header className="rev-chart-head">
        <div>
          <div className="rev-chart-eyebrow">
            12 ойлик даромад
            <span className="lang-en"> · 12-month revenue</span>
          </div>
          <div className="rev-chart-number">
            <span className="rev-chart-number-value">{compactTotal.value}</span>
            <span className="rev-chart-number-suffix">{compactTotal.suffix}</span>
            <span className="rev-chart-number-unit">UZS</span>
          </div>
          <div className="rev-chart-sub">
            {data.totalOrders.toLocaleString("ru-RU")} буюртма
            <span className="lang-en"> · {data.totalOrders.toLocaleString("ru-RU")} orders</span>
          </div>
        </div>

        {data.trendPct !== null && (
          <div className={`rev-chart-trend ${isUp ? "rev-chart-trend-up" : "rev-chart-trend-down"}`}>
            {isUp ? (
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            <span>{Math.abs(data.trendPct).toFixed(1)}%</span>
            <span className="rev-chart-trend-tail">
              {t("ўтган 6 ойга нисбатан", "vs prior 6 mo")}
            </span>
          </div>
        )}
      </header>

      {/* The chart itself */}
      <div className="rev-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data.months}
            margin={{ top: 18, right: 12, left: 0, bottom: 4 }}
            onMouseMove={(state) => {
              const k = state?.activePayload?.[0]?.payload?.monthKey;
              setActiveKey(typeof k === "string" ? k : null);
            }}
            onMouseLeave={() => setActiveKey(null)}
          >
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="#9aa3bf"
              strokeOpacity={0.18}
              strokeDasharray="3 4"
            />

            <XAxis
              dataKey="monthLabel"
              tick={{
                fill: "#5a6488",
                fontSize: 10.5,
                fontFamily: "var(--font-jetbrains-mono), monospace",
                letterSpacing: "0.04em",
              }}
              tickLine={false}
              axisLine={false}
              dy={6}
            />

            {/* Hidden Y axis — only used internally for domain calc */}
            <YAxis hide domain={["dataMin", "dataMax + 1"]} />

            {/* Vertical guide line that snaps to the hovered month. */}
            {activeKey && (
              <ReferenceLine
                x={activeKey}
                stroke="#059669"
                strokeOpacity={0.55}
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            )}

            <Tooltip
              content={<ChartTooltip />}
              cursor={false}
              animationDuration={140}
              wrapperStyle={{ outline: "none" }}
            />

            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#059669"
              strokeWidth={2.5}
              fill="url(#revFill)"
              isAnimationActive
              animationDuration={1400}
              animationEasing="ease-out"
              activeDot={{
                r: 5.5,
                stroke: "#059669",
                strokeWidth: 2.5,
                fill: "#ffffff",
                // The halo: drawn as a wider, lower-opacity ring
                // around the dot. Recharts doesn't expose a halo prop
                // directly so we lean on a filter for the glow.
                style: {
                  filter: "drop-shadow(0 0 6px rgba(5, 150, 105, 0.55))",
                  transition: "all 180ms ease-out",
                },
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
