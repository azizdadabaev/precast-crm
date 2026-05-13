"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { paidVariant } from "@/lib/order-display";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";
import { useT } from "@/lib/i18n";

interface Order {
  id: string;
  orderNumber: string;
  status: "PLACED" | "IN_PRODUCTION" | "DISPATCHED" | "DELIVERED" | "CANCELED";
  paymentState: "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
  confirmedPaid: string;
  totalPrice: string;
  totalArea: string;
  scheduledAt: string;
  placedAt: string;
  client: { id: string; name: string; phone: string; address: string | null };
  project: { id: string; name: string | null };
}

// Status → Chip variant + leading glyph + left-edge row border color.
const STATUS_META: Record<
  Order["status"],
  {
    label: string;
    variant: React.ComponentProps<typeof Chip>["variant"];
    glyph: string;
    rowBorder: string;
  }
> = {
  PLACED:        { label: "Placed",        variant: "default", glyph: "●", rowBorder: "border-l-primary" },
  IN_PRODUCTION: { label: "In production", variant: "warning", glyph: "⚒", rowBorder: "border-l-warning" },
  DISPATCHED:    { label: "Dispatched",    variant: "gold",    glyph: "🚚", rowBorder: "border-l-gold" },
  DELIVERED:     { label: "Delivered",     variant: "success", glyph: "✓",  rowBorder: "border-l-success" },
  CANCELED:      { label: "Canceled",      variant: "danger",  glyph: "✕",  rowBorder: "border-l-destructive" },
};

const PAYMENT_META: Record<
  Order["paymentState"],
  {
    label: string;
    variant: React.ComponentProps<typeof Chip>["variant"];
  }
> = {
  AWAITING_PAYMENT: { label: "Awaiting", variant: "warning" },
  PARTIALLY_PAID:   { label: "Partial",  variant: "default" },
  FULLY_PAID:       { label: "Paid",     variant: "success" },
};

function translateStatus(s: Order["status"], t: (uz: string, en: string) => string): string {
  switch (s) {
    case "PLACED":        return t("Қабул қилинган", "Placed");
    case "IN_PRODUCTION": return t("Ишлаб чиқилмоқда", "In production");
    case "DISPATCHED":    return t("Жўнатилган", "Dispatched");
    case "DELIVERED":     return t("Етказилган", "Delivered");
    case "CANCELED":      return t("Бекор қилинган", "Canceled");
  }
}

function translatePayment(s: Order["paymentState"], t: (uz: string, en: string) => string): string {
  switch (s) {
    case "AWAITING_PAYMENT": return t("Кутилмоқда", "Awaiting");
    case "PARTIALLY_PAID":   return t("Қисман", "Partial");
    case "FULLY_PAID":       return t("Тўлиқ", "Paid");
  }
}

const PAGE_SIZE = 20;

interface OrdersResponse {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Format a Date as YYYY-MM-DD in the user's local timezone, so the day the
// operator picks on the calendar matches the day stored on the row.
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function OrdersPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | Order["status"]>("");
  const [calendarSelected, setCalendarSelected] = useState<Date | null>(null);
  const [page, setPage] = useState(1);

  // Any change to filters must rewind to page 1, otherwise a search done
  // while on page 4 could request a non-existent page of a smaller result.
  useEffect(() => {
    setPage(1);
  }, [q, status, calendarSelected]);

  const dayKey = calendarSelected ? toLocalDateKey(calendarSelected) : null;

  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ["orders", q, status, dayKey, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      if (dayKey) p.set("day", dayKey);
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      return api(`/api/orders?${p.toString()}`);
    },
  });

  const orders = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Буюртмалар
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Orders
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Жойлаштирилган буюртмалар — буюртма №, мижоз ёки манзил бўйича қидиринг. Жадвал бўйича фильтрлаш учун кундан танланг.",
            "Placed orders — search by order #, client, or address. Pick a day on the calendar to filter by schedule.",
          )}
        </p>
      </div>

      {/* Capacity calendar */}
      <CapacityCalendar
        value={calendarSelected}
        onChange={setCalendarSelected}
        disablePast={false}
      />
      {calendarSelected && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/30 text-foreground rounded-md px-3 py-2 text-sm">
          <span>
            {t("Фильтр:", "Filtered to")}{" "}
            <span className="font-semibold font-mono">
              {calendarSelected.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </span>
          </span>
          <button
            type="button"
            className="text-xs underline hover:no-underline text-text-tertiary hover:text-foreground"
            onClick={() => setCalendarSelected(null)}
          >
            {t("Тозалаш", "Clear")}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <Input
            className="pl-9"
            placeholder={t("Буюртма № · Мижоз · Телефон · Манзил", "Order # · Client · Phone · Address")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Underline-style status tabs (etalon pattern) */}
        <div className="flex border-b border-border">
          {(
            [
              ["", t("Барчаси", "All")],
              ["PLACED", t("Қабул қилинган", "Placed")],
              ["IN_PRODUCTION", t("Ишлаб чиқилмоқда", "In prod")],
              ["DISPATCHED", t("Жўнатилган", "Dispatched")],
              ["DELIVERED", t("Етказилган", "Delivered")],
              ["CANCELED", t("Бекор қилинган", "Canceled")],
            ] as const
          ).map(([v, label]) => {
            const active = status === v;
            return (
              <button
                key={v}
                type="button"
                className={cn(
                  "relative h-10 px-3 text-[12px] font-bold uppercase tracking-wider transition-colors",
                  active
                    ? "text-primary"
                    : "text-text-tertiary hover:text-foreground",
                )}
                onClick={() => setStatus(v as typeof status)}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">{t("Буюртма йўқ.", "No orders.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5 w-32 whitespace-nowrap">№</th>
                  <th className="text-left px-3 py-2.5">Мижоз<span className="lang-en"> · Client</span></th>
                  <th className="text-left px-3 py-2.5">Тел<span className="lang-en"> · Phone</span></th>
                  <th className="text-left px-3 py-2.5">Манзил<span className="lang-en"> · Address</span></th>
                  <th className="text-right px-3 py-2.5">Майдон<span className="lang-en"> · Area</span></th>
                  <th className="text-right px-3 py-2.5">Жами<span className="lang-en"> · Total</span></th>
                  <th className="text-right px-3 py-2.5">Тўланган<span className="lang-en"> · Paid</span></th>
                  <th className="text-left px-3 py-2.5 w-36 whitespace-nowrap">{t("Ҳолат", "Status")}</th>
                  <th className="text-left px-3 py-2.5 w-28 whitespace-nowrap">{t("Тўлов", "Payment")}</th>
                  <th className="text-left px-3 py-2.5 w-32 whitespace-nowrap">{t("Жадвал", "Scheduled")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const meta = STATUS_META[o.status];
                  const pay = PAYMENT_META[o.paymentState];
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                        "border-l-[3px]",
                        meta.rowBorder,
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-primary text-xs whitespace-nowrap">
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{o.client.name}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                        {formatPhone(o.client.phone)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[14rem]">
                        {o.client.address ? (
                          <span className="line-clamp-2">{o.client.address}</span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatNumber(o.totalArea, 2)}{" "}
                        <span className="text-text-tertiary">m²</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatNumber(o.totalPrice, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {(() => {
                          const v = paidVariant(o.confirmedPaid, o.totalPrice);
                          if (v === "zero") {
                            return <span className="text-text-tertiary">—</span>;
                          }
                          return (
                            <span
                              className={
                                v === "full"
                                  ? "text-success font-bold"
                                  : "text-foreground"
                              }
                            >
                              {formatNumber(o.confirmedPaid, 0)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Chip variant={meta.variant}>
                          <span>{meta.glyph}</span>
                          <span>{translateStatus(o.status, t)}</span>
                        </Chip>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Chip variant={pay.variant}>{translatePayment(o.paymentState, t)}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary whitespace-nowrap">
                        {formatDate(o.scheduledAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <div>
              {t("Саҳифа", "Page")}{" "}
              <span className="font-mono font-semibold text-foreground">{page}</span>{" "}
              {t("дан", "of")}{" "}
              <span className="font-mono font-semibold text-foreground">{totalPages}</span>
              <span className="mx-2 text-text-tertiary">·</span>
              <span className="font-mono font-semibold text-foreground">{total}</span>{" "}
              {t("жами", "total")}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>{t("Олдинги", "Prev")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <span>{t("Кейинги", "Next")}</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
