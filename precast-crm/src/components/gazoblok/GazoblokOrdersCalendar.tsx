"use client";

/**
 * Compact orders calendar for the Gazoblok orders page — the CRM orders calendar's
 * look (src/components/orders/CapacityCalendar.tsx) shrunk to a narrow column beside
 * the list. A cell shows the day and its order count (orders and blocks in the
 * tooltip); picking a day filters the list (`day=`) and opens that day's orders
 * under the grid, where a date can be moved with the order's own schedule dialog.
 * With no day picked the panel shows the open orders that still have no date.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Loader2, PanelRightClose } from "lucide-react";
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
  /** Wide screens only: folds the whole calendar column away so the list takes the page. */
  onCollapse?: () => void;
};

export function GazoblokOrdersCalendar({ selected, onSelect, onCollapse }: Props) {
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
    <div className="grid gap-4 min-w-0">
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
            {/* Folded (phones only) the header carries the month's totals; open, the footer does. */}
            <span className={cn("text-[11px] text-muted-foreground whitespace-nowrap", open ? "hidden" : "sm:hidden")}>
              <span className={NUM}>{formatNumber(totals.orders, 0)}</span> {t("та", "orders")} ·{" "}
              <span className={NUM}>{formatNumber(totals.blocks, 0)}</span> {t("блок", "blocks")}
              {(cal.data?.unscheduledOpen ?? 0) > 0 && (
                <>
                  {" · "}
                  {t("санасиз", "no date")} <span className={NUM}>{formatNumber(cal.data!.unscheduledOpen, 0)}</span>
                </>
              )}
            </span>
            <span className="sm:hidden">
              <NavButton
                label={open ? t("Тақвимни йиғиш", "Fold the calendar") : t("Тақвимни очиш", "Open the calendar")}
                onClick={() => setOpen((v) => !v)}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
              </NavButton>
            </span>
            {onCollapse && (
              <span className="hidden min-[1400px]:inline-flex">
                <NavButton label={t("Тақвимни йиғиш", "Fold the calendar")} onClick={onCollapse}>
                  <PanelRightClose className="h-4 w-4" />
                </NavButton>
              </span>
            )}
          </div>
        </div>

        <div className={cn(!open && "hidden sm:block")}>
            <div className="grid grid-cols-7 text-[10px] font-semibold text-muted-foreground border-b border-border bg-muted/40">
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
                const label = d
                  ? t(
                      `${dayTitle(c.key, t)} · ${d.orders} та буюртма · ${formatNumber(d.blocks, 0)} та блок${d.flags.debt ? " · ортиқча юклаш қарзи" : d.flags.unpaid ? " · тўланмаган" : ""}`,
                      `${dayTitle(c.key, t)} · ${d.orders} orders · ${formatNumber(d.blocks, 0)} blocks${d.flags.debt ? " · over-load debt" : d.flags.unpaid ? " · unpaid" : ""}`,
                    )
                  : dayTitle(c.key, t);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={label}
                    title={label}
                    onClick={() => onSelect(isSelected ? "" : c.key)}
                    className={cn(
                      "relative h-11 sm:h-10 min-w-0 flex flex-col items-center justify-center gap-0.5 border-b border-r border-border/60 transition-colors hover:bg-surface-hover",
                      "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r",
                      stripe ? `${stripe} before:opacity-100` : "before:opacity-0",
                      !c.inMonth && "bg-muted/10",
                      isSelected && "bg-primary/8 ring-1 ring-primary ring-inset",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums leading-4 rounded-full min-w-5 px-0.5",
                        !c.inMonth ? "text-text-tertiary" : isToday ? "text-primary ring-1 ring-primary" : "text-foreground",
                      )}
                    >
                      {c.day}
                    </span>
                    <span aria-hidden className={cn("text-[9px] leading-none font-medium text-muted-foreground h-2", NUM)}>
                      {d ? d.orders : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1.5 text-[10px] text-muted-foreground">
              <span className="whitespace-nowrap">
                <span className={NUM}>{formatNumber(totals.orders, 0)}</span> {t("та", "orders")} ·{" "}
                <span className={NUM}>{formatNumber(totals.blocks, 0)}</span> {t("блок", "blocks")}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1" title={t("Тўланмаган", "Unpaid")}>
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60" />
                  {t("Тўланмаган", "Unpaid")}
                </span>
                <span className="inline-flex items-center gap-1" title={t("Ортиқча юклаш қарзи", "Over-load debt")}>
                  <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
                  {t("Қарз", "Debt")}
                </span>
              </span>
            </div>
        </div>
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

/** Under the calendar: the undated plan when no day is picked, else that day's orders with «move». */
function DayPanel({
  folded,
  selected,
  onSelect,
  unscheduledOpen,
}: {
  folded: boolean;
  selected: string;
  onSelect: (day: string) => void;
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
    const undated = unscheduledOpen ?? 0;
    return (
      <section className="rounded-lg border border-border bg-card px-3 py-2.5 grid gap-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-sm">
            {t("Санасиз", "No date")}{" "}
            <span className={cn("font-semibold", NUM, undated > 0 && "text-primary")}>
              {unscheduledOpen === undefined ? "—" : formatNumber(undated, 0)}
            </span>{" "}
            {t("та", "open")}
          </p>
          {undated > 0 && (
            <button
              type="button"
              onClick={() => onSelect("none")}
              className="min-h-11 sm:min-h-8 px-2 -mr-2 rounded-md text-xs font-medium text-primary hover:bg-accent whitespace-nowrap"
            >
              {t("Сана қўйиш", "Set dates")}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Кунни танланг — буюртмалари шу ерда, санасини кўчириш мумкин.", "Pick a day — its orders show here and can be moved.")}
        </p>
      </section>
    );
  }

  const rows = list.data ?? [];
  const blocks = rows.reduce((s, o) => s + o.totalBlocks, 0);
  return (
    <section className="rounded-lg border border-border bg-card min-w-0 overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
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
        <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
          {rows.map((o) => {
            const movable = canEdit && isOpen(o);
            return (
              <li key={o.id} className="flex items-center gap-2 px-3 py-2 min-w-0">
                <Link href={`/gazoblok/orders/${o.id}`} className="min-w-0 flex-1 hover:underline">
                  <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
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
                    className="h-11 sm:h-9 px-2.5 shrink-0"
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
