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
import { Loader2, Plus, Search, X } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { PhoneLink } from "@/components/PhoneLink";
import { Bi, useT } from "@/lib/i18n";
import { STATUS_LABELS } from "@/lib/gazoblok-text";
import type { OrderCounts } from "@/lib/gazoblok-order-list";
import { dayChipLabel } from "@/lib/gazoblok-calendar";
import { GazoblokOrdersCalendar } from "@/components/gazoblok/GazoblokOrdersCalendar";
import {
  EMPTY_FILTERS,
  ORDER_PAGE_SIZE,
  blocksBar,
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

const FLAG_PILLS: { flag: ListFlag; uz: string; en: string; tone: string; on: string }[] = [
  {
    flag: "debt",
    uz: "Ортиқча юклаш",
    en: "Over-load",
    tone: "border-destructive/45 text-destructive",
    on: "bg-destructive text-destructive-foreground border-destructive",
  },
  {
    flag: "refund",
    uz: "Қайтариш керак",
    en: "Refund due",
    tone: "border-warning/50 text-warning",
    on: "bg-warning text-warning-foreground border-warning",
  },
  {
    flag: "unconfirmed",
    uz: "Тасдиқланмаган",
    en: "Unconfirmed",
    tone: "border-warning/50 text-warning",
    on: "bg-warning text-warning-foreground border-warning",
  },
];

// IBM Plex Mono (--font-num) has Cyrillic; the app's default mono does not, so chips and
// figures use it here (direction.md, «Type scale»).
const NUM = "font-[family-name:var(--font-num)] tabular-nums [word-spacing:-0.38em]";
const CHIP_FONT = { fontFamily: "var(--font-num)" };

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
        <Button asChild className="h-11 w-full sm:w-auto">
          <Link href="/gazoblok/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("Янги буюртма", "New order")}
          </Link>
        </Button>
      </div>

      <GazoblokOrdersCalendar selected={filters.day} onSelect={(day) => patch({ day })} />

      {/* Search + selects */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <Input
            className="pl-9 h-11"
            placeholder={t("Буюртма № · Мижоз · Телефон", "Order # · Client · Phone")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          aria-label={t("Тўлов", "Payment")}
          className="h-11 w-full sm:w-44"
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
          className="h-11 w-full sm:w-48"
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
          <label className="flex-1 sm:flex-none flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("Дан", "From")}
            <Input
              type="date"
              className={cn("h-11 sm:w-40", NUM)}
              value={filters.from}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </label>
          <label className="flex-1 sm:flex-none flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("Гача", "To")}
            <Input
              type="date"
              className={cn("h-11 sm:w-40", NUM)}
              value={filters.to}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Status + flag pills — they wrap on phones instead of scrolling */}
      <div className="flex flex-wrap gap-2">
        {filters.day && (
          <button
            type="button"
            onClick={() => patch({ day: "" })}
            aria-label={t("Кун фильтрини тозалаш", "Clear the day filter")}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full border border-primary bg-primary text-primary-foreground text-[13px] font-semibold whitespace-nowrap"
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
        <span className="hidden md:block w-px self-stretch bg-border my-1 mx-0.5" aria-hidden />
        {FLAG_PILLS.map((f) => (
          <Pill
            key={f.flag}
            active={filters.flag === f.flag}
            count={c?.flags[f.flag]}
            tone={f.tone}
            activeTone={f.on}
            onClick={() => patch({ flag: filters.flag === f.flag ? "" : f.flag })}
          >
            {t(f.uz, f.en)}
          </Pill>
        ))}
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
  );
}

function Pill({
  active,
  count,
  tone,
  activeTone = "bg-foreground text-background border-foreground",
  onClick,
  children,
}: {
  active: boolean;
  count: number | undefined;
  tone?: string;
  activeTone?: string;
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
        active ? activeTone : cn("bg-card border-border-strong text-foreground hover:bg-surface-hover", tone),
      )}
    >
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
      <Chip style={CHIP_FONT} variant={STATUS_VARIANT[o.status]}>{t(STATUS_LABELS[o.status][0], STATUS_LABELS[o.status][1])}</Chip>
    ),
    // A cancelled order owes nothing — it gets no payment chip.
    payment: (o: GazoblokOrder) =>
      o.status === "CANCELED" ? null : (
        <Chip style={CHIP_FONT} variant={PAYMENT_META[o.paymentState].variant}>
          {t(PAYMENT_META[o.paymentState].uz, PAYMENT_META[o.paymentState].en)}
        </Chip>
      ),
    flags: (o: GazoblokOrder) => {
      const out: React.ReactNode[] = [];
      if (o.unpaidOverload > 0)
        out.push(
          <Chip style={CHIP_FONT} key="debt" variant="danger">
            {t("Ортиқча", "Over-load")} {formatNumber(o.unpaidOverload, 0)}
          </Chip>,
        );
      if (o.refundDue > 0)
        out.push(
          <Chip style={CHIP_FONT} key="refund" variant="warning">
            {t("Қайтариш", "Refund")} {formatNumber(o.refundDue, 0)}
          </Chip>,
        );
      if (o.pendingPaymentCount > 0)
        out.push(
          <Chip style={CHIP_FONT} key="pending" variant="warning">
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

function OrdersTable({ orders }: { orders: GazoblokOrder[] }) {
  const t = useT();
  const chips = useRowChips();
  return (
    <div className="hidden md:block">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2.5 w-[150px]">№</th>
            <th className="text-left px-3 py-2.5">{t("Мижоз", "Client")}</th>
            <th className="text-right px-3 py-2.5 w-[110px]">{t("Блоклар", "Blocks")}</th>
            <th className="text-right px-3 py-2.5 w-[120px]">{t("Жами, UZS", "Total, UZS")}</th>
            <th className="text-right px-3 py-2.5 w-[120px]">{t("Қолди, UZS", "Left, UZS")}</th>
            <th className="text-left px-3 py-2.5 w-[150px]">{t("Ҳолат", "Status")}</th>
            <th className="text-left px-3 py-2.5 w-[110px]">{t("Тўлов", "Payment")}</th>
            <th className="text-left px-3 py-2.5 w-[170px]">{t("Белгилар", "Flags")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const canceled = o.status === "CANCELED";
            const left = remainingToPay(o);
            const flags = chips.flags(o);
            return (
              <tr
                key={o.id}
                className={cn(
                  "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors align-top",
                  canceled && "text-muted-foreground",
                )}
              >
                <td className={cn("px-3 py-3.5 text-xs whitespace-nowrap", NUM)}>
                  <Link href={`/gazoblok/orders/${o.id}`} className="font-bold text-primary hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-3 py-3.5 min-w-0">
                  <Link href={`/gazoblok/orders/${o.id}`} className="block min-w-0 hover:underline">
                    <div className="font-medium truncate" title={o.client.name}>
                      {o.client.name}
                    </div>
                  </Link>
                  <div className="text-xs truncate">
                    <PhoneLink phone={o.client.phone} />
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="grid gap-1.5">
                    <span className={cn("text-right whitespace-nowrap", NUM)}>
                      {formatNumber(o.loadedBlocks, 0)} / {formatNumber(o.totalBlocks, 0)}
                    </span>
                    <BlocksBar loaded={o.loadedBlocks} ordered={o.totalBlocks} />
                  </div>
                </td>
                <td className={cn("px-3 py-3.5 text-right whitespace-nowrap", NUM)}>
                  {canceled ? "—" : formatNumber(Number(o.totalPrice), 0)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3.5 text-right whitespace-nowrap",
                    NUM,
                    left === 0 && "text-text-tertiary",
                  )}
                >
                  {left === null ? "—" : formatNumber(left, 0)}
                </td>
                <td className="px-3 py-3.5">{chips.status(o)}</td>
                <td className="px-3 py-3.5">{chips.payment(o) ?? <span className="text-text-tertiary">—</span>}</td>
                <td className="px-3 py-3.5">
                  {flags.length ? (
                    <div className="flex flex-wrap gap-1.5">{flags}</div>
                  ) : (
                    <span className="text-text-tertiary">—</span>
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
    <ul className="md:hidden divide-y divide-border">
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
                {canceled ? "—" : formatNumber(Number(o.totalPrice), 0)}
              </span>
              <span className={cn("font-semibold text-[15px] truncate", canceled && "text-muted-foreground")} title={o.client.name}>
                {o.client.name}
              </span>
              <span className="text-right text-[13px] text-muted-foreground whitespace-nowrap">
                {left === null ? null : (
                  <>
                    {t("Қолди", "Left")} <span className={NUM}>{formatNumber(left, 0)}</span>
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
