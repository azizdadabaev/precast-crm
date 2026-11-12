"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/select";
import { CalendarDays, Copy, Loader2, Phone, Plus, Search, Truck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber, cn } from "@/lib/utils";
import { digitsOnly, formatPhone } from "@/lib/phone";
import { Bi, useT } from "@/lib/i18n";
import { STATUS_LABELS, uzsText } from "@/lib/gazoblok-text";
import type { OrderCounts } from "@/lib/gazoblok-order-list";
import { dayChipLabel } from "@/lib/gazoblok-calendar";
import { GazoblokOrdersCalendar } from "@/components/gazoblok/GazoblokOrdersCalendar";
import {
  EMPTY_FILTERS,
  ORDER_PAGE_SIZE,
  blocksBar,
  dateFilterFromText,
  dateFilterToText,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
  nextCursor,
  remainingToPay,
  type ListFlag,
  type ListPay,
  type ListStatus,
  type OrderListFilters,
} from "@/lib/gazoblok-orders-view";

interface GazoblokOrder {
  id: string;
  orderNumber: string;
  status: ListStatus;
  paymentState: ListPay;
  confirmedPaid: string;
  totalPrice: string;
  totalBlocks: number;
  placedAt: string | null;
  client: { id: string; name: string; phone: string };
  pendingPaymentCount: number;
  loadedBlocks: number;
  deliveredWithoutTrucks: boolean;
  unpaidOverload: number;
  refundDue: number;
}

type ChipVariant = React.ComponentProps<typeof Chip>["variant"];

// Comp 05: open states read in the accent, delivered in success, cancelled neutral —
// warning is kept for refunds and payments awaiting confirmation.
const STATUS_VARIANT: Record<ListStatus, ChipVariant> = {
  PLACED: "default",
  IN_PRODUCTION: "default",
  DELIVERED: "success",
  CANCELED: "neutral",
};

const PAYMENT_META: Record<ListPay, { uz: string; en: string; variant: ChipVariant }> = {
  AWAITING_PAYMENT: { uz: "Кутилмоқда", en: "Awaiting", variant: "neutral" },
  PARTIALLY_PAID: { uz: "Қисман", en: "Partial", variant: "default" },
  FULLY_PAID: { uz: "Тўлиқ", en: "Paid", variant: "success" },
};

const FLAG_PILLS: { flag: ListFlag; uz: string; en: string; tone: string; on: string; md: string }[] = [
  {
    flag: "debt",
    uz: "Ортиқча юклаш",
    en: "Over-load",
    tone: "border-destructive/45 text-destructive",
    on: "bg-destructive text-destructive-foreground border-destructive",
    md: "md:text-destructive md:border-destructive",
  },
  {
    flag: "refund",
    uz: "Қайтариш керак",
    en: "Refund due",
    tone: "border-warning/50 text-warning",
    on: "bg-warning text-warning-foreground border-warning",
    md: "md:text-warning md:border-warning",
  },
  {
    flag: "unconfirmed",
    uz: "Тасдиқланмаган",
    en: "Unconfirmed",
    tone: "border-warning/50 text-warning",
    on: "bg-warning text-warning-foreground border-warning",
    md: "md:text-warning md:border-warning",
  },
];

// IBM Plex Mono (--font-num) has Cyrillic; the app's default mono does not, so
// figures use it here (direction.md, «Type scale»).
const NUM = "font-[family-name:var(--font-num)] tabular-nums [word-spacing:-0.38em]";
// Row chips read in sentence case in the body face, like the order screen's pills: the shared
// Chip's uppercase mono made «Қ» fall back to another font. Only this list overrides it.
const CHIP_CASE = "normal-case tracking-normal font-sans text-xs px-2.5 py-1";
// From 1400 px the calendar is a column beside the list, folded away with its own button.
// Between phones and 1400 px it opens as a side sheet; phones keep it folded above the list.
const CAL_SHEET =
  "sm:max-[1399px]:fixed sm:max-[1399px]:inset-y-0 sm:max-[1399px]:right-0 sm:max-[1399px]:z-[60] sm:max-[1399px]:w-[340px] sm:max-[1399px]:overflow-y-auto sm:max-[1399px]:border-l sm:max-[1399px]:border-border sm:max-[1399px]:bg-background sm:max-[1399px]:p-4 sm:max-[1399px]:shadow-xl";

export default function GazoblokOrdersPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>}>
      <OrdersList />
    </Suspense>
  );
}

function OrdersList() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(search.toString())), [search]);

  function setFilters(next: OrderListFilters) {
    const qs = filtersToParams(next).toString();
    router.replace(`/gazoblok/orders${qs ? `?${qs}` : ""}`, { scroll: false });
  }
  const patch = (p: Partial<OrderListFilters>) => setFilters({ ...filters, ...p });

  // The search box types freely; the URL (and the request) follows 250 ms later.
  const [q, setQ] = useState(filters.q);
  // Back/forward or «clear» changes the URL; keep what's typed (e.g. a trailing space) when it already matches.
  useEffect(() => setQ((prev) => (prev.trim() === filters.q ? prev : filters.q)), [filters.q]);
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const id = setTimeout(() => setFilters({ ...filters, q: q.trim() }), 250);
    return () => clearTimeout(id);
    // Only the typed text schedules a URL change; other filters write the URL directly.
  }, [q]);

  const list = useInfiniteQuery<GazoblokOrder[]>({
    queryKey: ["gazoblok-orders", filters],
    queryFn: ({ pageParam }) => {
      const p = filtersToParams(filters);
      p.set("limit", String(ORDER_PAGE_SIZE));
      if (pageParam) p.set("cursor", String(pageParam));
      return api(`/api/gazoblok/orders?${p.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => nextCursor(last, ORDER_PAGE_SIZE) ?? null,
    placeholderData: keepPreviousData,
  });
  const counts = useQuery<OrderCounts>({
    queryKey: ["gazoblok-orders-counts"],
    queryFn: () => api("/api/gazoblok/orders/counts"),
  });

  // `calOpen` is the side sheet (640–1399 px); `calFolded` hides the column (from 1400 px).
  const [calOpen, setCalOpen] = useState(false);
  const [calFolded, setCalFolded] = useState(false);
  useEffect(() => {
    if (!calOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCalOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calOpen]);

  const orders = useMemo(() => (list.data?.pages ?? []).flat(), [list.data]);
  const c = counts.data;
  const filtered = hasActiveFilters(filters);

  return (
    <div className="space-y-5 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-semibold tracking-tight">
            <Bi uz="Газоблок буюртмалари" en="Gazoblok orders" enClassName="text-muted-foreground font-normal text-base" />
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("Буюртма рақами, мижоз ёки телефон бўйича қидиринг.", "Search by order number, client or phone.")}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button asChild className="h-11 flex-1 sm:flex-none">
            <Link href="/gazoblok/new">
              <Plus className="h-4 w-4 mr-2" />
              {t("Янги буюртма", "New order")}
            </Link>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "space-y-5 min-[1400px]:space-y-0",
          !calFolded &&
            "min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_280px] min-[1400px]:gap-6 min-[1400px]:items-start",
        )}
      >
        <aside
          aria-label={t("Тақвим", "Calendar")}
          className={cn(
            "min-w-0 min-[1400px]:order-2",
            calOpen ? CAL_SHEET : "sm:max-[1399px]:hidden",
            calFolded && "min-[1400px]:hidden",
          )}
        >
          {calOpen && (
            <div className="hidden sm:max-[1399px]:flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">{t("Тақвим", "Calendar")}</h2>
              <button
                type="button"
                onClick={() => setCalOpen(false)}
                aria-label={t("Ёпиш", "Close")}
                className="h-11 w-11 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <GazoblokOrdersCalendar
            selected={filters.day}
            onSelect={(day) => patch({ day })}
            onCollapse={() => setCalFolded(true)}
          />
        </aside>
        {calOpen && (
          <div
            aria-hidden
            onClick={() => setCalOpen(false)}
            className="hidden sm:max-[1399px]:block fixed inset-0 !mt-0 z-50 bg-foreground/20"
          />
        )}

      <div className="flex flex-col gap-5 sm:gap-4 min-w-0 min-[1400px]:order-1">
      {/* Search + selects */}
      <div className="flex flex-wrap gap-3 sm:gap-2">
        <div className="relative flex-1 basis-full sm:basis-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <Input
            className="pl-9 h-11 sm:h-9"
            placeholder={t("Буюртма № · Мижоз · Телефон", "Order # · Client · Phone")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          aria-label={t("Тўлов", "Payment")}
          className="h-11 sm:h-9 w-full sm:w-40"
          value={filters.pay}
          onChange={(e) => patch({ pay: e.target.value as ListPay | "" })}
        >
          <option value="">{t("Тўлов: барчаси", "Payment: all")}</option>
          {(Object.keys(PAYMENT_META) as ListPay[]).map((k) => (
            <option key={k} value={k}>
              {t(PAYMENT_META[k].uz, PAYMENT_META[k].en)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("Сотувчи", "Seller")}
          className="h-11 sm:h-9 w-full sm:w-44"
          value={filters.seller}
          onChange={(e) => patch({ seller: e.target.value })}
        >
          <option value="">{t("Сотувчи: барчаси", "Seller: all")}</option>
          {(c?.sellers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatNumber(s.count, 0)})
            </option>
          ))}
        </Select>
        <div className="flex gap-2 w-full sm:w-auto">
          <DateFilter label={t("Дан", "From")} value={filters.from} onChange={(from) => patch({ from })} />
          <DateFilter label={t("Гача", "To")} value={filters.to} onChange={(to) => patch({ to })} />
        </div>
        {/* From 1400 px this shows only while the column is folded; the calendar carries its own fold button. */}
        <Button
          variant="outline"
          className={cn("h-9 hidden sm:inline-flex sm:ml-auto", !calFolded && "min-[1400px]:hidden")}
          onClick={() => {
            if (window.matchMedia("(min-width: 1400px)").matches) setCalFolded(false);
            else setCalOpen((v) => !v);
          }}
        >
          <CalendarDays className="h-4 w-4 mr-2" />
          {t("Тақвим", "Calendar")}
        </Button>
      </div>

      {/* Status + flag picks: pills that wrap on phones, one row of slim tabs from 768 px */}
      <div className="flex flex-wrap gap-2 md:gap-x-4 md:gap-y-0 md:items-end md:justify-between md:border-b md:border-border-strong">
        <div className="contents md:flex md:flex-wrap md:items-center md:gap-0.5">
        {filters.day && (
          <button
            type="button"
            onClick={() => patch({ day: "" })}
            aria-label={t("Кун фильтрини тозалаш", "Clear the day filter")}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full border border-primary bg-primary text-primary-foreground text-[13px] font-semibold whitespace-nowrap md:min-h-0 md:h-7 md:px-2.5 md:mr-1.5 md:text-xs"
          >
            {filters.day === "none" ? (
              t("Санасиз", "No date")
            ) : (
              <>
                {t("кун:", "day:")} <span className={NUM}>{dayChipLabel(filters.day)}</span>
              </>
            )}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Pill active={filters.status === ""} count={c?.all} onClick={() => patch({ status: "" })}>
          {t("Барчаси", "All")}
        </Pill>
        {(Object.keys(STATUS_LABELS) as ListStatus[]).map((s) => (
          <Pill
            key={s}
            active={filters.status === s}
            count={c?.byStatus[s]}
            onClick={() => patch({ status: filters.status === s ? "" : s })}
          >
            {t(STATUS_LABELS[s][0], STATUS_LABELS[s][1])}
          </Pill>
        ))}
        </div>
        <div className="contents md:flex md:flex-wrap md:items-center md:gap-0.5">
        {FLAG_PILLS.map((f) => (
          <Pill
            key={f.flag}
            active={filters.flag === f.flag}
            count={c?.flags[f.flag]}
            tone={f.tone}
            activeTone={f.on}
            mdActive={f.md}
            dot
            onClick={() => patch({ flag: filters.flag === f.flag ? "" : f.flag })}
          >
            {t(f.uz, f.en)}
          </Pill>
        ))}
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {list.isError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("Маълумотни юклаб бўлмади. Уланишни текширинг.", "Failed to load. Check your connection.")}
            </p>
            <Button variant="outline" className="h-11" onClick={() => list.refetch()}>
              {t("Қайта уриниш", "Retry")}
            </Button>
          </div>
        ) : list.isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-muted-foreground">
              {filtered
                ? t("Бу шартларга мос буюртма йўқ", "No orders match these filters")
                : t("Ҳали буюртма йўқ", "No orders yet")}
            </p>
            {filtered && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setQ("");
                  setFilters(EMPTY_FILTERS);
                }}
              >
                {t("Фильтрларни тозалаш", "Clear filters")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <OrdersTable orders={orders} />
            <OrdersCards orders={orders} />
          </>
        )}
      </div>

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={list.isFetchingNextPage}
            onClick={() => list.fetchNextPage()}
          >
            {list.isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("Кўпроқ кўрсатиш", "Show more")}
          </Button>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

/** «Дан» / «Гача» typed as кк.оо.йййй; the URL keeps YYYY-MM-DD and changes only on a whole date. */
function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (ymd: string) => void }) {
  const t = useT();
  const [raw, setRaw] = useState(() => dateFilterToText(value));
  const [editing, setEditing] = useState(false);
  // «Clear filters» or back/forward changes the URL; keep what's typed when it already means the same day.
  useEffect(() => setRaw((prev) => (dateFilterFromText(prev) === value ? prev : dateFilterToText(value))), [value]);
  const bad = !editing && dateFilterFromText(raw) === null;
  return (
    <label className="flex-1 sm:flex-none flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <Input
        inputMode="numeric"
        autoComplete="off"
        placeholder={t("кк.оо.йййй", "dd.mm.yyyy")}
        aria-invalid={bad}
        title={bad ? t("Санани кк.оо.йййй кўринишида ёзинг, масалан 11.11.2026", "Type the date as dd.mm.yyyy, e.g. 11.11.2026") : undefined}
        className={cn("h-11 sm:h-9 min-w-0 sm:w-32", NUM, bad && "border-destructive focus-visible:ring-destructive/40")}
        value={raw}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          setRaw(e.target.value);
          const next = dateFilterFromText(e.target.value);
          if (next !== null && next !== value) onChange(next);
        }}
      />
    </label>
  );
}

function Pill({
  active,
  count,
  tone,
  activeTone = "bg-foreground text-background border-foreground",
  mdActive = "md:text-foreground md:border-foreground",
  dot = false,
  onClick,
  children,
}: {
  active: boolean;
  count: number | undefined;
  tone?: string;
  activeTone?: string;
  /** From 768 px the pick is a tab: the active one keeps only its text and underline colour. */
  mdActive?: string;
  dot?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors",
        "md:min-h-0 md:h-[34px] md:px-2.5 md:-mb-px md:rounded-none md:border-0 md:border-b-2 md:bg-transparent",
        active
          ? cn(activeTone, "md:bg-transparent", mdActive)
          : cn(
              "bg-card border-border-strong text-foreground hover:bg-surface-hover md:border-transparent md:hover:bg-transparent",
              tone ?? "md:text-muted-foreground md:hover:text-foreground",
            ),
      )}
    >
      {dot && <span aria-hidden className="hidden md:inline-block h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
      {count !== undefined && (
        <span className={cn(NUM, "font-medium", active ? "opacity-70" : "text-muted-foreground")}>
          {formatNumber(count, 0)}
        </span>
      )}
    </button>
  );
}

/** Status, payment and problem chips — one set, used by the table and the phone cards. */
function useRowChips() {
  const t = useT();
  return {
    status: (o: GazoblokOrder) => (
      <Chip className={CHIP_CASE} variant={STATUS_VARIANT[o.status]}>{t(STATUS_LABELS[o.status][0], STATUS_LABELS[o.status][1])}</Chip>
    ),
    // A cancelled order owes nothing — it gets no payment chip.
    payment: (o: GazoblokOrder) =>
      o.status === "CANCELED" ? null : (
        <Chip className={CHIP_CASE} variant={PAYMENT_META[o.paymentState].variant}>
          {t(PAYMENT_META[o.paymentState].uz, PAYMENT_META[o.paymentState].en)}
        </Chip>
      ),
    flags: (o: GazoblokOrder) => {
      const out: React.ReactNode[] = [];
      if (o.unpaidOverload > 0)
        out.push(
          <Chip className={CHIP_CASE} key="debt" variant="danger">
            {t("Ортиқча", "Over-load")} <span className={NUM}>{uzsText(o.unpaidOverload)}</span>
          </Chip>,
        );
      if (o.refundDue > 0)
        out.push(
          <Chip className={CHIP_CASE} key="refund" variant="warning">
            {t("Қайтариш", "Refund")} <span className={NUM}>{uzsText(o.refundDue)}</span>
          </Chip>,
        );
      if (o.pendingPaymentCount > 0)
        out.push(
          <Chip className={CHIP_CASE} key="pending" variant="warning">
            {t("Тасдиқланмаган", "Unconfirmed")}
          </Chip>,
        );
      return out;
    },
  };
}

function BlocksBar({ loaded, ordered }: { loaded: number; ordered: number }) {
  const { fillPct, overPct } = blocksBar(loaded, ordered);
  return (
    <div className="relative h-1 rounded-sm bg-muted overflow-hidden" aria-hidden>
      <i className="absolute inset-y-0 left-0 bg-foreground/65" style={{ width: `${fillPct}%` }} />
      {overPct > 0 && <b className="absolute inset-y-0 right-0 bg-destructive" style={{ width: `${overPct}%` }} />}
    </div>
  );
}

/** The phone number opens a small menu — call or copy — instead of dialling straight away. */
function PhoneMenu({ phone, className }: { phone: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const formatted = formatPhone(phone);
  if (!formatted) return null;
  const tel = `+${digitsOnly(phone)}`;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setCopy("idle");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // The row itself opens the order; the phone must not.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded px-1 -mx-1 text-xs text-primary hover:underline whitespace-nowrap font-[family-name:var(--font-num)] tabular-nums",
            className,
          )}
        >
          {formatted}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52" onClick={(e) => e.stopPropagation()}>
        <a href={`tel:${tel}`} className="flex items-center gap-2 h-10 px-2.5 rounded-md text-sm hover:bg-accent">
          <Phone className="h-4 w-4 text-muted-foreground" />
          {t("Қўнғироқ қилиш", "Call")}
        </a>
        <button
          type="button"
          className="flex w-full items-center gap-2 h-10 px-2.5 rounded-md text-sm text-left hover:bg-accent"
          onClick={() =>
            navigator.clipboard.writeText(tel).then(
              () => setCopy("done"),
              () => setCopy("failed"),
            )
          }
        >
          <Copy className="h-4 w-4 text-muted-foreground" />
          {copy === "done"
            ? t("Нусха олинди", "Copied")
            : copy === "failed"
              ? t("Нусха олиб бўлмади", "Could not copy")
              : t("Нусха олиш", "Copy")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function OrdersTable({ orders }: { orders: GazoblokOrder[] }) {
  const t = useT();
  const router = useRouter();
  const chips = useRowChips();
  return (
    <div className="hidden lg:block overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed text-[13px]">
        <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="h-8">
            <th className="text-left pl-3 pr-2 w-[126px]">№</th>
            <th className="text-left px-2">{t("Мижоз", "Client")}</th>
            <th className="text-left px-2 w-[186px]">{t("Юкланди / буюртма", "Loaded / ordered")}</th>
            <th className="text-right px-2 w-[100px]">{t("Жами, UZS", "Total, UZS")}</th>
            <th className="text-right px-2 w-[100px]">{t("Қолди", "Left")}</th>
            <th className="text-left px-2 w-[152px]">{t("Ҳолат", "Status")}</th>
            <th className="text-left pl-2 pr-3 w-[280px]">{t("Тўлов", "Payment")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const canceled = o.status === "CANCELED";
            const left = remainingToPay(o);
            const flags = chips.flags(o);
            const href = `/gazoblok/orders/${o.id}`;
            return (
              <tr
                key={o.id}
                onClick={() => router.push(href)}
                className={cn(
                  "h-11 cursor-pointer border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                  canceled && "text-muted-foreground",
                )}
              >
                <td className={cn("pl-3 pr-2 text-xs whitespace-nowrap", NUM)}>
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="font-bold text-primary hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-2">
                  <div className="flex items-baseline gap-2.5 min-w-0 whitespace-nowrap">
                    <span className="font-medium truncate" title={o.client.name}>
                      {o.client.name}
                    </span>
                    {/* Under 1440 px the name needs the room; the phone stays on the order page. */}
                    <PhoneMenu phone={o.client.phone} className="hidden min-[1440px]:inline-block shrink-0" />
                  </div>
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-2">
                    {/* Fixed slots, wide enough for five digits, so the figures line up down the list. */}
                    <span className={cn("grid grid-cols-[46px_12px_46px] shrink-0 whitespace-nowrap text-[12.5px]", NUM)}>
                      <span className={cn("text-right font-semibold", o.loadedBlocks > o.totalBlocks && "text-destructive")}>
                        {formatNumber(o.loadedBlocks, 0)}
                      </span>
                      <span className="text-center text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{formatNumber(o.totalBlocks, 0)}</span>
                    </span>
                    <span className="w-9 shrink-0">
                      <BlocksBar loaded={o.loadedBlocks} ordered={o.totalBlocks} />
                    </span>
                    {o.deliveredWithoutTrucks && (
                      <span
                        role="img"
                        aria-label={t("Машиналар қайд этилмаган", "No trucks on file")}
                        title={t("Машиналар қайд этилмаган", "No trucks on file")}
                        className="relative inline-flex shrink-0 text-muted-foreground"
                      >
                        <Truck className="h-3.5 w-3.5" aria-hidden />
                        <span aria-hidden className="absolute left-1/2 top-1/2 h-px w-[18px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
                      </span>
                    )}
                  </div>
                </td>
                <td className={cn("px-2 text-right whitespace-nowrap text-[12.5px]", NUM)}>
                  {canceled ? "—" : uzsText(Number(o.totalPrice))}
                </td>
                <td className={cn("px-2 text-right whitespace-nowrap text-[12.5px]", NUM, !left && "text-muted-foreground")}>
                  {left ? uzsText(left) : "—"}
                </td>
                <td className="px-2">{chips.status(o)}</td>
                <td className="pl-2 pr-3">
                  {chips.payment(o) || flags.length ? (
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {chips.payment(o)}
                      {flags}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersCards({ orders }: { orders: GazoblokOrder[] }) {
  const t = useT();
  const chips = useRowChips();
  return (
    <ul className="lg:hidden divide-y divide-border">
      {orders.map((o) => {
        const canceled = o.status === "CANCELED";
        const left = remainingToPay(o);
        return (
          <li key={o.id}>
            <Link
              href={`/gazoblok/orders/${o.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-surface-hover"
            >
              <span className={cn("text-[13px] text-muted-foreground", NUM)}>{o.orderNumber}</span>
              <span className={cn("text-right text-base font-semibold whitespace-nowrap", NUM)}>
                {canceled ? "—" : uzsText(Number(o.totalPrice))}
              </span>
              <span className={cn("font-semibold text-[15px] truncate", canceled && "text-muted-foreground")} title={o.client.name}>
                {o.client.name}
              </span>
              <span className="text-right text-[13px] text-muted-foreground whitespace-nowrap">
                {left === null ? null : (
                  <>
                    {t("Қолди", "Left")} <span className={NUM}>{uzsText(left)}</span>
                  </>
                )}
              </span>
              <span className={cn("col-span-2 text-xs text-muted-foreground truncate", NUM)}>{formatPhone(o.client.phone)}</span>
              <span className="col-span-2 flex flex-wrap gap-1.5 mt-1.5">
                {chips.status(o)}
                {chips.payment(o)}
                {chips.flags(o)}
              </span>
              <span className="col-span-2 text-[12.5px] text-muted-foreground mt-1">
                {t("Юкланди", "Loaded")}{" "}
                <span className={NUM}>
                  {formatNumber(o.loadedBlocks, 0)} / {formatNumber(o.totalBlocks, 0)}
                </span>{" "}
                {t("та", "pcs")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
