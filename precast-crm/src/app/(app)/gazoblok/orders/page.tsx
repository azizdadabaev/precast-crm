"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Boxes, Plus, Search } from "lucide-react";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { useT } from "@/lib/i18n";

type Status = "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED";
type PaymentState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";

interface GazoblokOrder {
  id: string;
  orderNumber: string;
  status: Status;
  paymentState: PaymentState;
  confirmedPaid: string;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  discountAmount: string;
  deliveryCost: string;
  scheduledAt: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  client: { id: string; name: string; phone: string };
  lines: Array<{ id: string; productLabel: string; unitPrice: string; quantity: number; lineTotal: string }>;
}

const STATUS_META: Record<
  Status,
  { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"]; rowBorder: string }
> = {
  PLACED:        { uz: "Қабул қилинган",   en: "Placed",        variant: "default", rowBorder: "border-l-primary" },
  IN_PRODUCTION: { uz: "Ишлаб чиқилмоқда", en: "In production", variant: "warning", rowBorder: "border-l-warning" },
  DELIVERED:     { uz: "Етказилган",       en: "Delivered",     variant: "success", rowBorder: "border-l-success" },
  CANCELED:      { uz: "Бекор қилинган",   en: "Canceled",      variant: "danger",  rowBorder: "border-l-destructive" },
};

const PAYMENT_META: Record<
  PaymentState,
  { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }
> = {
  AWAITING_PAYMENT: { uz: "Кутилмоқда", en: "Awaiting", variant: "warning" },
  PARTIALLY_PAID:   { uz: "Қисман",     en: "Partial",  variant: "default" },
  FULLY_PAID:       { uz: "Тўлиқ",      en: "Paid",     variant: "success" },
};

export default function GazoblokOrdersPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | Status>("");

  const { data, isLoading } = useQuery<GazoblokOrder[]>({
    queryKey: ["gazoblok-orders", q, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      const qs = p.toString();
      return api(`/api/gazoblok/orders${qs ? `?${qs}` : ""}`);
    },
  });

  const orders = data ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 text-primary p-2.5">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Газоблок буюртмалари
              <span className="lang-en text-muted-foreground font-normal text-base"> · Gazoblok orders</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Газоблок буюртмалари — буюртма №, мижоз ёки телефон бўйича қидиринг.",
                "Gazoblok orders — search by order #, client, or phone.",
              )}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/gazoblok/new">
            <Plus className="h-4 w-4 mr-2" />
            Янги буюртма<span className="lang-en font-normal"> · New order</span>
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <Input
            className="pl-9"
            placeholder={t("Буюртма № · Мижоз · Телефон", "Order # · Client · Phone")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex border-b border-border">
          {(
            [
              ["", t("Барчаси", "All")],
              ["PLACED", t("Қабул қилинган", "Placed")],
              ["IN_PRODUCTION", t("Ишлаб чиқилмоқда", "In prod")],
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
                  active ? "text-primary" : "text-text-tertiary hover:text-foreground",
                )}
                onClick={() => setStatus(v)}
              >
                {label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
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
                  <th className="text-left px-3 py-2.5 w-36 whitespace-nowrap">{t("Ҳолат", "Status")}</th>
                  <th className="text-left px-3 py-2.5 w-28 whitespace-nowrap">{t("Тўлов", "Payment")}</th>
                  <th className="text-right px-3 py-2.5">Жами<span className="lang-en"> · Total</span></th>
                  <th className="text-right px-3 py-2.5">Блок<span className="lang-en"> · Blocks</span></th>
                  <th className="text-left px-3 py-2.5 w-32 whitespace-nowrap">{t("Сана", "Date")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const meta = STATUS_META[o.status];
                  const pay = PAYMENT_META[o.paymentState];
                  const dateLabel = o.scheduledAt ?? o.placedAt;
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
                        <Link href={`/gazoblok/orders/${o.id}`} className="hover:underline">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{o.client.name}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                        {formatPhone(o.client.phone)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Chip variant={meta.variant}>{t(meta.uz, meta.en)}</Chip>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Chip variant={pay.variant}>{t(pay.uz, pay.en)}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatNumber(Number(o.totalPrice), 0)}
                        <span className="text-text-tertiary text-xs ml-1">UZS</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatNumber(o.totalBlocks, 0)}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary whitespace-nowrap">
                        {dateLabel ? formatDate(dateLabel) : "—"}
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
