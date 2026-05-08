"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
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

const STATUS: Record<Order["status"], { label: string; cls: string }> = {
  PLACED:        { label: "Placed",        cls: "bg-sky-100 text-sky-800" },
  IN_PRODUCTION: { label: "In production", cls: "bg-amber-100 text-amber-800" },
  DISPATCHED:    { label: "Dispatched",    cls: "bg-orange-100 text-orange-800" },
  DELIVERED:     { label: "Delivered",     cls: "bg-emerald-100 text-emerald-800" },
  CANCELED:      { label: "Canceled",      cls: "bg-rose-100 text-rose-800" },
};

const PAYMENT_STATE_BADGE: Record<Order["paymentState"], { label: string; cls: string }> = {
  AWAITING_PAYMENT: { label: "Awaiting", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  PARTIALLY_PAID:   { label: "Partial",  cls: "bg-sky-50 text-sky-700 border border-sky-200" },
  FULLY_PAID:       { label: "Fully paid", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Буюртмалар <span className="text-muted-foreground font-normal text-base">· Orders</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed orders — search by order #, client, or address. Pick a day on the calendar to filter by schedule.
          </p>
        </div>
      </div>

      {/* Capacity calendar */}
      <CapacityCalendar
        value={calendarSelected}
        onChange={setCalendarSelected}
        disablePast={false}
      />
      {calendarSelected && (
        <div className="flex items-center justify-between bg-sky-50 border border-sky-200 text-sky-900 rounded px-3 py-2 text-sm">
          <span>
            Filtered to{" "}
            <span className="font-semibold tabular-nums">
              {calendarSelected.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </span>
          </span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={() => setCalendarSelected(null)}
          >
            Clear
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Order # · Client · Phone · Address"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border bg-background overflow-hidden text-xs">
          {(
            [
              ["", "All"],
              ["PLACED", "Placed"],
              ["IN_PRODUCTION", "In prod"],
              ["DELIVERED", "Delivered"],
              ["DISPATCHED", "Dispatched"],
              ["CANCELED", "Canceled"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`px-3 h-9 font-semibold uppercase tracking-wider transition-colors ${
                status === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setStatus(v as typeof status)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No orders.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">№</th>
                <th className="text-left px-3 py-2">Мижоз · Client</th>
                <th className="text-left px-3 py-2">Тел · Phone</th>
                <th className="text-left px-3 py-2">Манзил · Address</th>
                <th className="text-right px-3 py-2">Майдон · Area</th>
                <th className="text-right px-3 py-2">Жами · Total</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Payment</th>
                <th className="text-left px-3 py-2">Scheduled</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-bold tabular-nums">
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{o.client.name}</td>
                  <td className="px-3 py-2 tabular-nums text-xs">{formatPhone(o.client.phone)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {o.client.address ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(o.totalArea, 2)} m²
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatNumber(o.totalPrice, 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${STATUS[o.status].cls}`}
                    >
                      {STATUS[o.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${PAYMENT_STATE_BADGE[o.paymentState].cls}`}
                    >
                      {PAYMENT_STATE_BADGE[o.paymentState].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(o.scheduledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
