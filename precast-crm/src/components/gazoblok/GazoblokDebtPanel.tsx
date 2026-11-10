"use client";

/**
 * Money the owner must chase or give back:
 *  - over-load debt: extra blocks loaded beyond the order, billed, and how much of it
 *    is still unpaid — with the selling operator named ("where is the leftover money
 *    for overloading", owner 2026-11-10);
 *  - refund owed: confirmed money above what the client owes (cancel / close short /
 *    correction), recorded as a refund by a payment.confirm holder.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { parseDecimal } from "@/lib/gazoblok-quantities";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";

type Method = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";
const METHODS: Method[] = ["CASH", "BANK_TRANSFER", "CLICK", "PAYME", "OTHER"];

export function GazoblokDebtPanel({
  orderId,
  overBlocks,
  overshipAmount,
  unpaidOverload,
  sellerName,
  refundDue,
  canRefund,
  onChanged,
}: {
  orderId: string;
  overBlocks: number;
  overshipAmount: number;
  unpaidOverload: number;
  sellerName: string | null;
  refundDue: number;
  canRefund: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("CASH");
  const [error, setError] = useState<string | null>(null);
  const refund = useMutation({
    mutationFn: (vars: { amount: number; method: Method }) =>
      api(`/api/gazoblok/orders/${orderId}`, { method: "PATCH", json: { action: "record_refund", ...vars } }),
    onSuccess: () => {
      setAmount("");
      setError(null);
      onChanged();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (overshipAmount <= 0 && refundDue < 0.01) return null;
  const money = (n: number) => `${formatNumber(n, 0)} UZS`;

  return (
    <div className="space-y-3">
      {overshipAmount > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-destructive">
            {t("Ортиқча юклама", "Over-load")}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-mono tabular-nums font-semibold">+{formatNumber(overBlocks, 0)} {t("та", "blocks")}</span>
            <span className="font-mono tabular-nums font-semibold">+{money(overshipAmount)}</span>
            <span>
              {t("Тўланмаган", "Unpaid")}:{" "}
              <span className={`font-mono tabular-nums font-bold ${unpaidOverload > 0 ? "text-destructive" : "text-success"}`}>
                {money(unpaidOverload)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t("Сотувчи", "Seller")}: <span className="font-medium text-foreground">{sellerName ?? "—"}</span>
            </span>
          </div>
        </div>
      )}

      {refundDue >= 0.01 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-warning">
              {t("Қайтариш керак", "Refund owed")}
            </div>
            <div className="mt-1 text-xl font-black font-mono tabular-nums">{money(refundDue)}</div>
          </div>
          {canRefund && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseDecimal(amount);
                if (!n || n <= 0) return setError(t("Тўғри сумма киритинг", "Enter a valid amount"));
                refund.mutate({ amount: n, method });
              }}
            >
              <Input
                className="w-40 font-mono tabular-nums"
                inputMode="decimal"
                placeholder={formatNumber(refundDue, 0)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="w-40">
                {METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] ? t(...PAYMENT_METHOD_LABELS[m]) : m}</option>
                ))}
              </Select>
              <Button type="submit" size="sm" className="min-h-[44px]" disabled={refund.isPending}>
                {refund.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1.5" />}
                {t("Қайтарилди деб ёзиш", "Record refund")}
              </Button>
            </form>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}
