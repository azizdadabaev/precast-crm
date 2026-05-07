"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/fetcher";

export interface CapacityDay {
  date: string;        // "YYYY-MM-DD"
  totalArea: number;   // m²
  totalOrders: number;
}

interface CapacityResponse {
  days: CapacityDay[];
  thresholds: { low: number; moderate: number; heavy: number };
}

interface Props {
  /** Selected date (or null). */
  value: Date | null;
  onChange: (date: Date) => void;
  /**
   * Additional area to add to the selected day's tier — used to preview the
   * impact of placing the new order in the calendar.
   */
  pendingArea?: number;
  /** Disable past days. */
  disablePast?: boolean;
}

const DOW_LABELS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]; // Du Se Ch Pa Ju Sh Ya — UZ short

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Tier label + bg/text classes for a given totalArea. */
function tierFor(total: number, t: { low: number; moderate: number; heavy: number }) {
  if (total <= t.low)        return { label: "Available",    cell: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100", chip: "bg-emerald-500" };
  if (total <= t.moderate)   return { label: "Moderate",     cell: "bg-yellow-50 text-yellow-800 hover:bg-yellow-100",     chip: "bg-yellow-500" };
  if (total <= t.heavy)      return { label: "Heavy",        cell: "bg-orange-50 text-orange-800 hover:bg-orange-100",     chip: "bg-orange-500" };
  return                          { label: "Overbooked",   cell: "bg-rose-100 text-rose-800 hover:bg-rose-200",          chip: "bg-rose-600" };
}

export function CapacityCalendar({ value, onChange, pendingArea = 0, disablePast = true }: Props) {
  const [cursor, setCursor] = useState<Date>(startOfMonth(value ?? new Date()));
  const [data, setData] = useState<CapacityResponse | null>(null);

  // Range to fetch: cursor month + the leading/trailing days of the visible grid
  const { gridStart, gridEnd } = useMemo(() => {
    const first = startOfMonth(cursor);
    // Monday-first grid: day-of-week 1=Mon, 0=Sun → offset
    const dow = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 41); // 6 weeks × 7 days - 1
    return { gridStart: start, gridEnd: end };
  }, [cursor]);

  useEffect(() => {
    let alive = true;
    api<CapacityResponse>(
      `/api/orders/capacity?from=${gridStart.toISOString()}&to=${gridEnd.toISOString()}`,
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ days: [], thresholds: { low: 300, moderate: 450, heavy: 600 } });
      });
    return () => {
      alive = false;
    };
  }, [gridStart, gridEnd]);

  const lookup = useMemo(() => {
    const m = new Map<string, CapacityDay>();
    for (const d of data?.days ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const thresholds = data?.thresholds ?? { low: 300, moderate: 450, heavy: 600 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build the 6×7 grid
  const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    cells.push({
      date: d,
      key: fmtKey(d),
      inMonth: d.getMonth() === cursor.getMonth(),
    });
  }

  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });
  const selectedKey = value ? fmtKey(value) : null;

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, -1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week row */}
      <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
        {DOW_LABELS.map((d) => (
          <div key={d} className="px-1 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((c) => {
          const cap = lookup.get(c.key);
          const isPast = disablePast && c.date < today;
          const isSelected = c.key === selectedKey;
          const showPendingPreview = isSelected && pendingArea > 0;
          const totalForTier = (cap?.totalArea ?? 0) + (showPendingPreview ? pendingArea : 0);
          const tier = tierFor(totalForTier, thresholds);

          return (
            <button
              key={c.key}
              type="button"
              disabled={isPast}
              onClick={() => onChange(new Date(c.date))}
              className={[
                "h-16 px-1.5 py-1 border-b border-r border-border/40 text-left transition-colors",
                c.inMonth ? "" : "opacity-40",
                isPast ? "cursor-not-allowed bg-muted/20 text-muted-foreground/60" : tier.cell,
                isSelected ? "ring-2 ring-primary ring-inset" : "",
              ].join(" ")}
              title={
                isPast
                  ? "Past — pick a future day"
                  : `${c.key} · ${cap?.totalArea ?? 0} m² booked${showPendingPreview ? ` (+ ${pendingArea} m² this order = ${totalForTier.toFixed(1)} m²)` : ""}`
              }
            >
              <div className="flex items-start justify-between">
                <span className="text-sm font-semibold tabular-nums">{c.date.getDate()}</span>
                {cap && cap.totalOrders > 0 && (
                  <span className="text-[9px] bg-background/60 rounded px-1 tabular-nums font-medium">
                    {cap.totalOrders}
                  </span>
                )}
              </div>
              {(cap || showPendingPreview) && !isPast && (
                <div className="mt-1 text-[10px] tabular-nums leading-tight">
                  {totalForTier.toFixed(0)} m²
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t text-[10px] text-muted-foreground">
        {(["Available", "Moderate", "Heavy", "Overbooked"] as const).map((label, i) => {
          const sample = [0, thresholds.low + 1, thresholds.moderate + 1, thresholds.heavy + 1][i];
          const t = tierFor(sample, thresholds);
          return (
            <div key={label} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${t.chip}`} />
              <span>{label}</span>
              <span className="opacity-70">
                {label === "Available" && `≤${thresholds.low}`}
                {label === "Moderate" && `≤${thresholds.moderate}`}
                {label === "Heavy" && `≤${thresholds.heavy}`}
                {label === "Overbooked" && `>${thresholds.heavy}`}
                {" m²"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
