"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Area,
  Scatter,
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

interface DayPoint {
  date: number;
  dayLabel: string;
  monthKey: string;
  revenue: number;
  orderCount: number;
}

interface MonthlyRevenueResponse {
  months: MonthPoint[];
  days: DayPoint[];
  total: number;
  totalOrders: number;
  trendPct: number | null;
}

const MONTH_UZ_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function compact(n: number): { value: string; suffix: string } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return { value: (n / 1_000_000_000).toFixed(2), suffix: "млрд" };
  if (abs >= 1_000_000) return { value: (n / 1_000_000).toFixed(1), suffix: "млн" };
  if (abs >= 1_000) return { value: (n / 1_000).toFixed(0), suffix: "минг" };
  return { value: String(n), suffix: "" };
}

function longForm(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as MonthPoint | undefined;
  if (!point || !("monthKey" in point)) return null;
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
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
          {point.monthLabel} {point.year}
        </div>
        <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontWeight: 600, fontSize: "15px", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {longForm(point.revenue)}
          <span style={{ fontSize: "10px", fontWeight: 400, color: "rgba(255,255,255,0.55)", marginLeft: 4, letterSpacing: "0.04em" }}>UZS</span>
        </div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {point.orderCount} буюртма
        </div>
      </div>
      <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10, background: "#0c0f1a" }} />
    </div>
  );
}

interface DayHover {
  key: string;
  cx: number;
  cy: number;
  data: DayPoint;
}

function DayTooltip({ cx, cy, data }: { cx: number; cy: number; data: DayPoint }) {
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        transform: "translate(-50%, calc(-100% - 14px))",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        style={{
          background: "#0c0f1a",
          color: "#ffffff",
          borderRadius: 6,
          padding: "8px 12px",
          minWidth: 140,
          fontFamily: "var(--font-manrope), sans-serif",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
          {data.dayLabel}
        </div>
        <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontWeight: 600, fontSize: "15px", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {longForm(data.revenue)}
          <span style={{ fontSize: "10px", fontWeight: 400, color: "rgba(255,255,255,0.55)", marginLeft: 4 }}>UZS</span>
        </div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {data.orderCount} буюртма
        </div>
      </div>
      <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10, background: "#0c0f1a" }} />
    </div>
  );
}

export function MonthlyRevenueChart() {
  const t = useT();
  const [activeTs, setActiveTs] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<DayHover | null>(null);
  // Stores pixel (cx, cy) for each daily dot keyed by `${date}` — populated during Scatter render.
  const dayPositions = useRef<Map<string, { cx: number; cy: number }>>(new Map());

  const { data, isLoading, error } = useQuery<MonthlyRevenueResponse>({
    queryKey: ["dashboard-monthly-revenue"],
    queryFn: () => api<MonthlyRevenueResponse>("/api/dashboard/monthly-revenue"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Monthly data with ms timestamp for the shared time X-axis.
  const monthsWithTs = useMemo(() => {
    if (!data) return [];
    return data.months.map((m) => ({
      ...m,
      ts: new Date(m.year, parseInt(m.monthKey.slice(5)) - 1, 1).getTime(),
    }));
  }, [data]);

  // Daily data: ts = date (for X placement); displayRevenue = linearly interpolated monthly
  // value so dots appear ON the line rather than at their own (much lower) daily scale.
  const dailyWithY = useMemo(() => {
    if (!data || monthsWithTs.length === 0) return [];
    return data.days.map((day) => {
      let before = monthsWithTs[0]!;
      let after = monthsWithTs[monthsWithTs.length - 1]!;
      for (let i = 0; i < monthsWithTs.length - 1; i++) {
        if (day.date >= monthsWithTs[i]!.ts && day.date < monthsWithTs[i + 1]!.ts) {
          before = monthsWithTs[i]!;
          after = monthsWithTs[i + 1]!;
          break;
        }
      }
      const frac = after.ts > before.ts ? (day.date - before.ts) / (after.ts - before.ts) : 0;
      const displayRevenue = Math.round(before.revenue + (after.revenue - before.revenue) * frac);
      return { ...day, ts: day.date, displayRevenue };
    });
  }, [data, monthsWithTs]);

  const monthTicks = monthsWithTs.map((m) => m.ts);
  const domainMin = monthTicks[0] ?? 0;
  const domainMax = monthTicks[monthTicks.length - 1] ?? 1;

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

      <div className="rev-chart-canvas" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={monthsWithTs}
            margin={{ top: 18, right: 12, left: 0, bottom: 4 }}
            onMouseMove={(state: any) => {
              // Proximity detection: find the nearest daily dot within 10px of cursor.
              // chartX/chartY are pixel coords in the SVG coordinate system, same as
              // cx/cy saved by each Scatter shape during render.
              const mx: number | undefined = state?.chartX;
              const my: number | undefined = state?.chartY;
              if (mx != null && my != null) {
                let nearest: { key: string; cx: number; cy: number; dist: number } | null = null;
                for (const [key, pos] of dayPositions.current) {
                  const dist = Math.hypot(pos.cx - mx, pos.cy - my);
                  if (dist < 10 && (!nearest || dist < nearest.dist)) {
                    nearest = { key, cx: pos.cx, cy: pos.cy, dist };
                  }
                }
                if (nearest) {
                  const dayData = dailyWithY.find((d) => `${d.date}` === nearest!.key);
                  if (dayData) {
                    setHoveredDay((prev) =>
                      prev?.key === nearest!.key
                        ? prev
                        : { key: nearest!.key, cx: nearest!.cx, cy: nearest!.cy, data: dayData },
                    );
                    setActiveTs(null);
                    return;
                  }
                }
              }
              setHoveredDay(null);
              const ts = state?.activePayload?.[0]?.payload?.ts;
              setActiveTs(typeof ts === "number" ? ts : null);
            }}
            onMouseLeave={() => {
              setActiveTs(null);
              setHoveredDay(null);
            }}
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
              dataKey="ts"
              type="number"
              scale="time"
              domain={[domainMin, domainMax]}
              ticks={monthTicks}
              tickFormatter={(ts: number) => MONTH_UZ_SHORT[new Date(ts).getMonth()] ?? ""}
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

            <YAxis hide domain={[0, (max: number) => Math.max(Math.ceil(max * 1.25), 1)]} />

            {activeTs !== null && !hoveredDay && (
              <ReferenceLine
                x={activeTs}
                stroke="#059669"
                strokeOpacity={0.55}
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            )}

            <Tooltip
              content={(props) =>
                hoveredDay ? null : <ChartTooltip {...(props as TooltipProps<number, string>)} />
              }
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
              dot={false}
              activeDot={
                hoveredDay
                  ? false
                  : {
                      r: 5.5,
                      stroke: "#059669",
                      strokeWidth: 2.5,
                      fill: "#ffffff",
                      style: {
                        filter: "drop-shadow(0 0 6px rgba(5, 150, 105, 0.55))",
                        transition: "all 180ms ease-out",
                      },
                    }
              }
            />

            {/* Invisible daily dots — positions saved to ref for proximity detection.
                Visible dot renders only for the currently hovered day. */}
            <Scatter
              data={dailyWithY}
              dataKey="displayRevenue"
              isAnimationActive={false}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null || !payload) return <g />;
                const key = `${payload.date}`;
                dayPositions.current.set(key, { cx, cy });
                const isHovered = hoveredDay?.key === key;
                if (!isHovered) return <g />;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill="#ffffff"
                    stroke="#059669"
                    strokeWidth={2.5}
                    style={{ filter: "drop-shadow(0 0 6px rgba(5,150,105,0.55))" }}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {hoveredDay && (
          <DayTooltip cx={hoveredDay.cx} cy={hoveredDay.cy} data={hoveredDay.data} />
        )}
      </div>
    </article>
  );
}
