"use client";

/**
 * Compact orders calendar for the Gazoblok tab — the CRM orders calendar's look
 * (src/components/orders/CapacityCalendar.tsx) at about half its size. A day shows
 * its whole orders and blocks on the scheduled day; picking one filters the list
 * below (`day=`) and opens that day's list here, where a date can be moved with
 * the order's own schedule dialog. With no day picked the side shows the plan:
 * the month's totals and the open orders that still have no date.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";
import { dayKey } from "@/lib/dashboard-metrics";
import { isOpen } from "@/lib/gazoblok-rules";
import { monthCells, parseMonthParam, shiftMonth, type GazoblokCalendar } from "@/lib/gazoblok-calendar";
import { MONTH_UZ_FULL } from "@/components/gazoblok/dashboard/GazoblokKpis";
import { GazoblokEditOrderDialog, type GazoblokEditOrderDetail } from "@/components/gazoblok/GazoblokEditOrderDialog";

// Same figure style as the orders list (IBM Plex Mono, tightened thousands gap).
const NUM = "font-[family-name:var(--font-num)] tabular-nums [word-spacing:-0.38em]";
const DOW = [
  ["Ду", "Mo"], ["Се", "Tu"], ["Чо", "We"], ["Па", "Th"], ["Жу", "Fr"], ["Ша", "Sa"], ["Як", "Su"],
] as const;
const MONTH_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_UZ = ["Якшанба", "Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayOrder = {
  id: string;
  orderNumber: string;
  status: string;
  shortClosedAt: string | null;
  totalBlocks: number;
  client: { name: string };
};

type Props = {
  /** The list's `day` filter: "YYYY-MM-DD", "none" (open, no date) or "". */
  selected: string;
  onSelect: (day: string) => void;
};

export function GazoblokOrdersCalendar({ selected, onSelect }: Props) {
  const t = useT();
  const todayKey = dayKey(new Date());
  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected.slice(0, 7) : todayKey.slice(0, 7),
  );
  // A phone opens with the grid folded so the list stays in view; the header still shows the month's totals.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }, []);

  const cal = useQuery<GazoblokCalendar>({
    queryKey: ["gazoblok-calendar", month],
    queryFn: () => api(`/api/gazoblok/orders/calendar?month=${month}`),
  });
  const byDay = useMemo(() => new Map((cal.data?.days ?? []).map((d) => [d.date, d])), [cal.data]);
  const totals = useMemo(
    () => (cal.data?.days ?? []).reduce((s, d) => ({ orders: s.orders + d.orders, blocks: s.blocks + d.blocks }), { orders: 0, blocks: 0 }),
    [cal.data],
  );
  const { year, month: m } = parseMonthParam(month)!;
  const cells = useMemo(() => monthCells(year, m), [year, m]);
  const isCurrentMonth = month === todayKey.slice(0, 7);

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start min-w-0">
      <section className="rounded-lg border border-border bg-card overflow-hidden min-w-0">
        <div className="flex items-center justify-between gap-2 px-1.5 py-1 border-b border-border bg-muted/20">
          <div className="flex items-center gap-0.5 min-w-0">
            <NavButton label={t("Олдинги ой", "Previous month")} onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <span className="text-sm font-semibold px-1.5 whitespace-nowrap">
              {t(MONTH_UZ_FULL[m - 1], MONTH_EN[m - 1])} <span className={NUM}>{year}</span>
            </span>
            <NavButton label={t("Кейинги ой", "Next month")} onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </NavButton>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setMonth(todayKey.slice(0, 7))}
                className="min-h-11 sm:min-h-8 px-2 rounded-md text-xs font-medium text-primary hover:bg-accent"
              >
                {t("Бугун", "Today")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("text-[11px] text-muted-foreground whitespace-nowrap", open && "hidden sm:inline")}>
              <span className={NUM}>{formatNumber(totals.orders, 0)}</span> {t("та", "orders")} ·{" "}
              <span className={NUM}>{formatNumber(totals.blocks, 0)}</span> {t("блок", "blocks")}
              {!open && (cal.data?.unscheduledOpen ?? 0) > 0 && (
                <>
                  {" · "}
                  {t("санасиз", "no date")} <span className={NUM}>{formatNumber(cal.data!.unscheduledOpen, 0)}</span>
                </>
              )}
            </span>
            <NavButton
              label={open ? t("Тақвимни йиғиш", "Fold the calendar") : t("Тақвимни очиш", "Open the calendar")}
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </NavButton>
          </div>
        </div>

        {open && (
          <>
            <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
              {DOW.map(([uz, en]) => (
                <div key={en} className="py-1 text-center">{t(uz, en)}</div>
              ))}
            </div>
            <div className={cn("grid grid-cols-7 transition-opacity", cal.isFetching && !cal.data && "opacity-50")}>
              {cells.map((c) => {
                const d = c.inMonth ? byDay.get(c.key) : undefined;
                const isSelected = c.key === selected;
                const isToday = c.key === todayKey;
                const stripe = d?.flags.debt ? "before:bg-destructive" : d?.flags.unpaid ? "before:bg-muted-foreground/60" : null;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? "" : c.key)}
                    title={
                      d
                        ? t(
                            `${c.key} · ${d.orders} та буюртма · ${formatNumber(d.blocks, 0)} та блок`,
                            `${c.key} · ${d.orders} orders · ${formatNumber(d.blocks, 0)} blocks`,
                          )
                        : c.key
                    }
                    className={cn(
                      "relative h-11 min-w-0 px-1.5 py-1 border-b border-r border-border/60 text-left transition-colors hover:bg-surface-hover",
                      "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r",
                      stripe ? `${stripe} before:opacity-100` : "before:opacity-0",
                      !c.inMonth && "bg-muted/10",
                      isSelected && "bg-primary/8 ring-1 ring-primary ring-inset",
                    )}
                  >
                    <div className="flex items-start justify-between gap-0.5 leading-none">
                      <span
                        className={cn(
                          "text-[13px] font-semibold tabular-nums rounded-full",
                          !c.inMonth ? "text-text-tertiary" : isToday ? "text-primary ring-1 ring-primary px-1 -mx-0.5" : "text-foreground",
                        )}
                      >
                        {c.day}
                      </span>
                      {d && <span className={cn("text-[10px] font-medium text-text-tertiary", NUM)}>{d.orders}</span>}
                    </div>
                    {d && (
                      <div className={cn("mt-1 text-[10px] leading-none text-muted-foreground truncate", NUM)}>
                        {formatNumber(d.blocks, 0)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-[10px] text-muted-foreground">
              <span>
                {t("Катакда: буюртма сони ва блоклар", "In a cell: orders and blocks")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1 w-3 rounded-sm bg-muted-foreground/60" />
                {t("Тўланмаган", "Unpaid")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1 w-3 rounded-sm bg-destructive" />
                {t("Ортиқча юклаш қарзи", "Over-load debt")}
              </span>
            </div>
          </>
        )}
        {cal.isError && (
          <p className="px-3 py-2 text-xs text-destructive border-t border-border">
            {t("Тақвимни юклаб бўлмади", "Could not load the calendar")}
          </p>
        )}
      </section>

      <DayPanel
        folded={!open}
        selected={selected}
        onSelect={onSelect}
        totals={totals}
        monthLabel={t(MONTH_UZ_FULL[m - 1], MONTH_EN[m - 1])}
        unscheduledOpen={cal.data?.unscheduledOpen}
      />
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-11 w-11 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}

function dayTitle(key: string, t: (uz: string, en: string) => string): string {
  const [y, mo, d] = key.split("-").map(Number);
  const wd = new Date(y, mo - 1, d).getDay();
  return t(`${d} ${MONTH_UZ_FULL[mo - 1]}, ${WEEKDAY_UZ[wd]}`, `${WEEKDAY_EN[wd]}, ${d} ${MONTH_EN[mo - 1]}`);
}

/** The side of the calendar: the plan when no day is picked, else that day's orders with «move». */
function DayPanel({
  folded,
  selected,
  onSelect,
  totals,
  monthLabel,
  unscheduledOpen,
}: {
  folded: boolean;
  selected: string;
  onSelect: (day: string) => void;
  totals: { orders: number; blocks: number };
  monthLabel: string;
  unscheduledOpen: number | undefined;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: me } = useQuery<{ permissions: string[] }>({ queryKey: ["me"], queryFn: () => api("/api/auth/me") });
  const canEdit = (me?.permissions ?? []).includes("order.edit");
  const canEditShipped = (me?.permissions ?? []).includes("order.editShipped");

  const list = useQuery<DayOrder[]>({
    queryKey: ["gazoblok-calendar-day", selected],
    queryFn: () => api(`/api/gazoblok/orders?day=${selected}&limit=200`),
    enabled: selected !== "",
  });

  // The schedule dialog edits from the order's own detail, read fresh on each opening.
  const [editing, setEditing] = useState<GazoblokEditOrderDetail | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const openSchedule = useMutation({
    mutationFn: (id: string) => api<GazoblokEditOrderDetail>(`/api/gazoblok/orders/${id}`),
    onMutate: () => setOpenErr(null),
    onSuccess: (o) => setEditing(o),
    onError: () => setOpenErr(t("Буюртмани очиб бўлмади. Қайта уриниб кўринг.", "Could not open the order. Try again.")),
  });

  function saved(id: string) {
    for (const key of [["gazoblok-calendar"], ["gazoblok-calendar-day"], ["gazoblok-orders"], ["gazoblok-dashboard"], ["gazoblok-order", id]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  }

  if (selected === "") {
    // Folded (phones), the header already carries the month's totals and the undated count.
    if (folded) return null;
    return (
      <section className="rounded-lg border border-border bg-card p-4 grid gap-4 min-w-0">
        <div>
          <h2 className="text-base font-semibold">{t("Режа", "Plan")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Кунни танланг — ўша куннинг буюртмалари шу ерда чиқади, санасини кўчириш мумкин.",
              "Pick a day — its orders show here and their date can be moved.",
            )}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px rounded-md border border-border bg-border overflow-hidden">
          <div className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{monthLabel}</dt>
            <dd className="mt-1 text-xl font-semibold">
              <span className={NUM}>{formatNumber(totals.orders, 0)}</span>{" "}
              <span className="text-sm font-normal text-muted-foreground">{t("та буюртма", "orders")}</span>
            </dd>
            <dd className="text-xs text-muted-foreground">
              <span className={NUM}>{formatNumber(totals.blocks, 0)}</span> {t("та блок", "blocks")}
            </dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{t("Санасиз очиқ", "Open, no date")}</dt>
            <dd className={cn("mt-1 text-xl font-semibold", NUM, (unscheduledOpen ?? 0) > 0 && "text-primary")}>
              {unscheduledOpen === undefined ? "—" : formatNumber(unscheduledOpen, 0)}
            </dd>
            {(unscheduledOpen ?? 0) > 0 && (
              <dd>
                <button
                  type="button"
                  onClick={() => onSelect("none")}
                  className="min-h-11 sm:min-h-0 text-xs font-medium text-primary hover:underline"
                >
                  {t("Сана қўйиш", "Set dates")}
                </button>
              </dd>
            )}
          </div>
        </dl>
      </section>
    );
  }

  const rows = list.data ?? [];
  const blocks = rows.reduce((s, o) => s + o.totalBlocks, 0);
  return (
    <section className="rounded-lg border border-border bg-card min-w-0 overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {selected === "none" ? t("Санасиз очиқ буюртмалар", "Open orders with no date") : dayTitle(selected, t)}
          </h2>
          {list.data && (
            <p className="text-xs text-muted-foreground">
              <span className={NUM}>{formatNumber(rows.length, 0)}</span> {t("та буюртма", "orders")} ·{" "}
              <span className={NUM}>{formatNumber(blocks, 0)}</span> {t("та блок", "blocks")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect("")}
          className="min-h-11 sm:min-h-8 px-2 -mr-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent whitespace-nowrap"
        >
          {t("Ёпиш", "Close")}
        </button>
      </header>
      {openErr && <p className="px-4 py-2 text-xs text-destructive border-b border-border">{openErr}</p>}
      {list.isError ? (
        <div className="p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("Юклаб бўлмади.", "Failed to load.")}</p>
          <Button variant="outline" className="h-11" onClick={() => list.refetch()}>
            {t("Қайта уриниш", "Retry")}
          </Button>
        </div>
      ) : list.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("Бу кунга буюртма йўқ", "No orders on this day")}</p>
      ) : (
        <ul className="divide-y divide-border max-h-[320px] overflow-y-auto">
          {rows.map((o) => {
            const movable = canEdit && isOpen(o);
            return (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2 min-w-0">
                <Link href={`/gazoblok/orders/${o.id}`} className="min-w-0 flex-1 hover:underline">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className={cn("text-xs font-bold text-primary whitespace-nowrap", NUM)}>{o.orderNumber}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className={NUM}>{formatNumber(o.totalBlocks, 0)}</span> {t("та", "pcs")}
                    </span>
                  </div>
                  <div className="text-sm truncate" title={o.client.name}>{o.client.name}</div>
                </Link>
                {movable && (
                  <Button
                    variant="outline"
                    className="h-11 sm:h-9 px-3 shrink-0"
                    disabled={openSchedule.isPending}
                    onClick={() => openSchedule.mutate(o.id)}
                  >
                    {openSchedule.isPending && openSchedule.variables === o.id ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <CalendarClock className="h-4 w-4 mr-1.5" />
                    )}
                    <span>{selected === "none" ? t("Сана қўйиш", "Set date") : t("Кўчириш", "Move")}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <GazoblokEditOrderDialog
          open
          onClose={() => setEditing(null)}
          order={editing}
          catalog={[]}
          perms={{ edit: canEdit, editShipped: canEditShipped }}
          mode="schedule"
          onSaved={() => saved(editing.id)}
        />
      )}
    </section>
  );
}
