"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, CheckCircle2, Clock, X } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { ConfirmPaymentDialog, type PaymentForConfirm } from "@/components/payments/ConfirmPaymentDialog";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

interface Me {
  role: "ADMIN" | "OWNER" | "SALES" | "ENGINEER" | "OPERATOR";
}

const STATUS_BADGE: Record<PaymentForConfirm["status"], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING_CONFIRMATION: { label: "Pending",   cls: "bg-amber-100 text-amber-800",   icon: Clock },
  CONFIRMED:            { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  REJECTED:             { label: "Rejected",  cls: "bg-rose-100 text-rose-800",     icon: X },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash · Нақд",
  BANK_TRANSFER: "Bank transfer",
  CLICK: "Click",
  PAYME: "Payme",
  OTHER: "Other",
};

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED">("PENDING_CONFIRMATION");
  const [confirmTarget, setConfirmTarget] = useState<PaymentForConfirm | null>(null);

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canConfirm = me?.role === "ADMIN" || me?.role === "OWNER";

  const { data: payments = [], isLoading } = useQuery<PaymentForConfirm[]>({
    queryKey: ["payments", tab],
    queryFn: () => api(`/api/payments?status=${tab}`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Тўловлар <span className="text-muted-foreground font-normal text-base">· Payments</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Maker-checker queue. Operators record cash; ADMIN or OWNER confirms or rejects.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-md border bg-background overflow-hidden text-xs w-fit">
        {(
          [
            ["PENDING_CONFIRMATION", "Pending"],
            ["CONFIRMED", "Confirmed"],
            ["REJECTED", "Rejected"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`px-3 h-9 font-semibold uppercase tracking-wider transition-colors ${
              tab === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setTab(v)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No {tab.toLowerCase().replace("_", " ")} payments.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Манзил · Address</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Expected</th>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-left px-3 py-2">Driver</th>
                <th className="text-left px-3 py-2">Recorded</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => {
                // The dispatch's expectedCollection is the amount the
                // DRIVER was asked to collect on a particular delivery —
                // it only makes sense to compare against payments
                // actually collected by that driver. For in-office cash
                // and bank/online payments the dispatch number is
                // unrelated, so showing "expected vs amount" produces a
                // misleading "short" delta. Gate on collectedByDriver.
                const fromDriver = !!p.collectedByDriver;
                const expected =
                  fromDriver && p.order.dispatch?.expectedCollection
                    ? Number(p.order.dispatch.expectedCollection)
                    : null;
                const recorded = Number(p.amount);
                const shortfall = expected != null ? expected - recorded : 0;
                const Badge = STATUS_BADGE[p.status];
                const BIcon = Badge.icon;
                return (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 tabular-nums font-bold">
                      <Link href={`/orders/${p.order.id}`} className="hover:underline">
                        {p.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div>{(p as PaymentForConfirm & { order: { client?: { name?: string } } }).order.client?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {(p as PaymentForConfirm & { order: { client?: { phone?: string } } }).order.client?.phone
                          ? formatPhone((p as PaymentForConfirm & { order: { client?: { phone: string } } }).order.client!.phone)
                          : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[14rem]">
                      {(() => {
                        const addr = (p as PaymentForConfirm & { order: { client?: { address?: string | null } } })
                          .order.client?.address;
                        return addr ? <span className="line-clamp-2">{addr}</span> : <span>—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatNumber(p.amount, 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {expected != null ? (
                        <>
                          {formatNumber(expected, 0)}
                          {shortfall > 0 && (
                            <div className="text-[10px] text-rose-700">
                              short {formatNumber(shortfall, 0)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.collectedByDriver?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(p.recordedAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${Badge.cls}`}>
                        <BIcon className="h-3 w-3" />
                        {Badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "PENDING_CONFIRMATION" && canConfirm && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => setConfirmTarget(p)}
                        >
                          <Wallet className="h-3.5 w-3.5 mr-1.5" />
                          Review
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ConfirmPaymentDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        payment={confirmTarget}
        onConfirmed={() => qc.invalidateQueries({ queryKey: ["payments"] })}
      />
    </div>
  );
}
