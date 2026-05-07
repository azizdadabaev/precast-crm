"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
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

/** UZ-short month names — 3 letters each, calendar-cell friendly. */
const MONTHS_SHORT = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];
const MONTHS_LONG_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type View = "days" | "months" | "years";

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function addYears(d: Date, n: number) {
  return new Date(d.getFullYear() + n, d.getMonth(), 1);
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
  const [view, setView] = useState<View>("days");
  const [data, setData] = useState<CapacityResponse | null>(null);

  // Range to fetch: cursor month + the leading/trailing days of the visible grid
  const { gridStart, gridEnd } = useMemo(() => {
    const first = startOfMonth(cursor);
    const dow = (first.getDay() + 6) % 7; // Monday-first offset
    const start = new Date(first);
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 41); // 6 weeks × 7 days - 1
    return { gridStart: start, gridEnd: end };
  }, [cursor]);

  useEffect(() => {
    // Only fetch capacity when in days view — months/years navigation
    // doesn't render heatmap data, so the request is wasted there.
    if (view !== "days") return;
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
  }, [gridStart, gridEnd, view]);

  const lookup = useMemo(() => {
    const m = new Map<string, CapacityDay>();
    for (const d of data?.days ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const thresholds = data?.thresholds ?? { low: 300, moderate: 450, heavy: 600 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedKey = value ? fmtKey(value) : null;
  const todayKey = fmtKey(today);
  const decadeStart = Math.floor(cursor.getFullYear() / 10) * 10;

  // ── Title click: drill UP a level (days → months → years) ────────
  function drillUp() {
    if (view === "days") setView("months");
    else if (view === "months") setView("years");
  }

  // ── Arrow nav: previous/next at the active level ─────────────────
  function navigate(direction: -1 | 1) {
    if (view === "days") setCursor(addMonths(cursor, direction));
    else if (view === "months") setCursor(addYears(cursor, direction));
    else setCursor(addYears(cursor, direction * 10));
  }

  function pickMonth(monthIndex: number) {
    setCursor(new Date(cursor.getFullYear(), monthIndex, 1));
    setView("days");
  }
  function pickYear(year: number) {
    setCursor(new Date(year, cursor.getMonth(), 1));
    setView("months");
  }

  // ── Title text per view ──────────────────────────────────────────
  let titleText: string;
  if (view === "days") {
    titleText = `${MONTHS_LONG_EN[cursor.getMonth()]} ${cursor.getFullYear()}`;
  } else if (view === "months") {
    titleText = String(cursor.getFullYear());
  } else {
    titleText = `${decadeStart} – ${decadeStart + 11}`;
  }

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      {/* Header — title is clickable to drill up to month/year picker */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={drillUp}
          disabled={view === "years"}
          className={[
            "text-sm font-semibold inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors",
            view === "years"
              ? "cursor-default text-foreground"
              : "hover:bg-muted cursor-pointer",
          ].join(" ")}
          title={
            view === "days"
              ? "Click to pick a different month or year"
              : view === "months"
                ? "Click to pick a different year"
                : ""
          }
        >
          <span className="tabular-nums">{titleText}</span>
          {view !== "years" && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </button>
        <button
          type="button"
          onClick={() => navigate(1)}
          className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Days view ───────────────────────────────────────────── */}
      {view === "days" && (
        <>
          <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
            {DOW_LABELS.map((d) => (
              <div key={d} className="px-1 py-1.5 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const d = new Date(gridStart);
              d.setDate(d.getDate() + i);
              const key = fmtKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const cap = lookup.get(key);
              const isPast = disablePast && d < today;
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const showPendingPreview = isSelected && pendingArea > 0;
              const totalForTier = (cap?.totalArea ?? 0) + (showPendingPreview ? pendingArea : 0);
              const tier = tierFor(totalForTier, thresholds);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => onChange(new Date(d))}
                  className={[
                    "h-16 px-1.5 py-1 border-b border-r border-border/40 text-left transition-colors",
                    inMonth ? "" : "opacity-40",
                    isPast ? "cursor-not-allowed bg-muted/20 text-muted-foreground/60" : tier.cell,
                    isSelected ? "ring-2 ring-primary ring-inset" : "",
                    !isSelected && isToday ? "ring-1 ring-primary/40 ring-inset" : "",
                  ].join(" ")}
                  title={
                    isPast
                      ? "Past — pick a future day"
                      : `${key} · ${cap?.totalArea ?? 0} m² booked${showPendingPreview ? ` (+ ${pendingArea} m² this order = ${totalForTier.toFixed(1)} m²)` : ""}`
                  }
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
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
        </>
      )}

      {/* ── Months view ─────────────────────────────────────────── */}
      {view === "months" && (
        <div className="grid grid-cols-4 gap-1 p-2">
          {MONTHS_SHORT.map((label, i) => {
            const isCurrentMonth =
              i === today.getMonth() && cursor.getFullYear() === today.getFullYear();
            const isSelected =
              !!value &&
              i === value.getMonth() &&
              cursor.getFullYear() === value.getFullYear();
            return (
              <button
                key={label}
                type="button"
                onClick={() => pickMonth(i)}
                className={[
                  "h-14 rounded-md border text-sm font-semibold transition-colors flex flex-col items-center justify-center",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                    : isCurrentMonth
                      ? "border-primary/40 hover:bg-muted"
                      : "border-border/40 hover:bg-muted",
                ].join(" ")}
              >
                <span>{label}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-normal">
                  {MONTHS_LONG_EN[i].slice(0, 3)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Years view ──────────────────────────────────────────── */}
      {view === "years" && (
        <div className="grid grid-cols-4 gap-1 p-2">
          {Array.from({ length: 12 }, (_, i) => decadeStart + i).map((y) => {
            const isCurrentYear = y === today.getFullYear();
            const isSelectedYear = !!value && y === value.getFullYear();
            const isCursorYear = y === cursor.getFullYear();
            return (
              <button
                key={y}
                type="button"
                onClick={() => pickYear(y)}
                className={[
                  "h-14 rounded-md border text-sm font-semibold tabular-nums transition-colors flex items-center justify-center",
                  isSelectedYear
                    ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                    : isCursorYear
                      ? "border-primary/60 hover:bg-muted"
                      : isCurrentYear
                        ? "border-primary/30 hover:bg-muted"
                        : "border-border/40 hover:bg-muted",
                ].join(" ")}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
