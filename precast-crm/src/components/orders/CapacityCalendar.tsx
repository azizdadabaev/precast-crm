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

/** Tier label + accent classes for a given totalArea. The cell stays
 *  neutral; the tier shows only as a colored left-edge stripe + dot in
 *  the corner, so the calendar reads as a calendar (dates first) and
 *  the heatmap signal is a quiet hint, not a flood-fill. */
function tierFor(total: number, t: { low: number; moderate: number; heavy: number }) {
  if (total <= t.low)        return { label: "Available",  stripe: "before:bg-success",    dot: "bg-success",     chip: "bg-success" };
  if (total <= t.moderate)   return { label: "Moderate",   stripe: "before:bg-warning",    dot: "bg-warning",     chip: "bg-warning" };
  if (total <= t.heavy)      return { label: "Heavy",      stripe: "before:bg-gold",       dot: "bg-gold",        chip: "bg-gold" };
  return                          { label: "Overbooked", stripe: "before:bg-destructive", dot: "bg-destructive", chip: "bg-destructive" };
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
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header — title is clickable to drill up to month/year picker */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/20">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={drillUp}
          disabled={view === "years"}
          className={[
            "text-sm font-semibold inline-flex items-center gap-1 rounded-md px-3 py-1 transition-colors",
            view === "years"
              ? "cursor-default text-foreground"
              : "hover:bg-accent cursor-pointer",
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
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Days view ───────────────────────────────────────────── */}
      {view === "days" && (
        <>
          <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
            {DOW_LABELS.map((d) => (
              <div key={d} className="px-1 py-2 text-center">
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
              const hasBookings = (cap?.totalArea ?? 0) > 0;
              const isPast = disablePast && d < today;
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const showPendingPreview = isSelected && pendingArea > 0;
              const totalForTier = (cap?.totalArea ?? 0) + (showPendingPreview ? pendingArea : 0);
              const tier = tierFor(totalForTier, thresholds);
              const showTier = hasBookings || showPendingPreview;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => onChange(new Date(d))}
                  className={[
                    // Base cell: neutral surface with hairline dividers; the
                    // ::before pseudo (left edge stripe) carries the tier
                    // accent only when the day has actual bookings.
                    "relative h-20 px-2 py-1.5 border-b border-r border-border/60 text-left transition-colors group",
                    "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r",
                    showTier && !isPast ? `${tier.stripe} before:opacity-100` : "before:opacity-0",
                    isPast
                      ? "cursor-not-allowed bg-muted/20"
                      : "hover:bg-surface-hover",
                    inMonth ? "" : "bg-muted/10",
                    isSelected ? "bg-primary/8 ring-1 ring-primary ring-inset" : "",
                  ].join(" ")}
                  title={
                    isPast
                      ? "Past — pick a future day"
                      : `${key} · ${cap?.totalArea ?? 0} m² booked${showPendingPreview ? ` (+ ${pendingArea} m² this order = ${totalForTier.toFixed(1)} m²)` : ""}`
                  }
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={[
                        "text-sm font-semibold tabular-nums",
                        isPast
                          ? "text-text-tertiary"
                          : !inMonth
                            ? "text-text-tertiary"
                            : isToday
                              ? "text-primary"
                              : "text-foreground",
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </span>
                    {isToday && (
                      <span className="text-[8px] uppercase tracking-wider font-bold text-primary">
                        ●
                      </span>
                    )}
                    {!isToday && cap && cap.totalOrders > 0 && (
                      <span className="text-[10px] font-mono font-medium text-text-tertiary tabular-nums">
                        {cap.totalOrders}
                      </span>
                    )}
                  </div>
                  {showTier && !isPast && (
                    <div className="mt-1 text-[10px] tabular-nums font-mono leading-tight text-muted-foreground">
                      {totalForTier.toFixed(0)}
                      <span className="text-text-tertiary"> m²</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
            {(["Available", "Moderate", "Heavy", "Overbooked"] as const).map((label, i) => {
              const sample = [0, thresholds.low + 1, thresholds.moderate + 1, thresholds.heavy + 1][i];
              const t = tierFor(sample, thresholds);
              return (
                <div key={label} className="inline-flex items-center gap-1.5">
                  <span className={`inline-block h-1 w-3 rounded-sm ${t.chip}`} />
                  <span className="font-medium uppercase tracking-wider">{label}</span>
                  <span className="font-mono opacity-70">
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
