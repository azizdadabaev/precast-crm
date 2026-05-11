"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Search } from "lucide-react";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { paidVariant } from "@/lib/order-display";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";

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

export default function OrdersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | Order["status"]>("");
  const [calendarSelected, setCalendarSelected] = useState<Date | null>(null);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["orders", q, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      return api(`/api/orders?${p.toString()}`);
    },
  });

  // Filter by calendar-selected day, if any
  const filtered = calendarSelected
    ? orders.filter((o) => {
        const d = new Date(o.scheduledAt);
        return (
          d.getFullYear() === calendarSelected.getFullYear() &&
          d.getMonth() === calendarSelected.getMonth() &&
          d.getDate() === calendarSelected.getDate()
        );
      })
    : orders;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Буюртмалар{" "}
          <span className="text-muted-foreground font-normal text-base">
            · Orders
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Placed orders — search by order #, client, or address. Pick a day on the calendar to filter by schedule.
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
            Filtered to{" "}
            <span className="font-semibold font-mono">
              {calendarSelected.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </span>
          </span>
          <button
            type="button"
            className="text-xs underline hover:no-underline text-text-tertiary hover:text-foreground"
            onClick={() => setCalendarSelected(null)}
          >
            Clear
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Order # · Client · Phone · Address"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Underline-style status tabs (etalon pattern) */}
        <div className="flex border-b border-border">
          {(
            [
              ["", "All"],
              ["PLACED", "Placed"],
              ["IN_PRODUCTION", "In prod"],
              ["DISPATCHED", "Dispatched"],
              ["DELIVERED", "Delivered"],
              ["CANCELED", "Canceled"],
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
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No orders.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5 w-32 whitespace-nowrap">№</th>
                  <th className="text-left px-3 py-2.5">Мижоз · Client</th>
                  <th className="text-left px-3 py-2.5">Тел · Phone</th>
                  <th className="text-left px-3 py-2.5">Манзил · Address</th>
                  <th className="text-right px-3 py-2.5">Майдон · Area</th>
                  <th className="text-right px-3 py-2.5">Жами · Total</th>
                  <th className="text-right px-3 py-2.5">Тўланган · Paid</th>
                  <th className="text-left px-3 py-2.5 w-36 whitespace-nowrap">Status</th>
                  <th className="text-left px-3 py-2.5 w-28 whitespace-nowrap">Payment</th>
                  <th className="text-left px-3 py-2.5 w-32 whitespace-nowrap">Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => {
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
                      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">
                        {formatPhone(o.client.phone)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-tertiary max-w-[14rem]">
                        {o.client.address ? (
                          <span className="line-clamp-2">{o.client.address}</span>
                        ) : (
                          <span>—</span>
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
                          <span>{meta.label}</span>
                        </Chip>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Chip variant={pay.variant}>{pay.label}</Chip>
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
      </div>
    </div>
  );
}
