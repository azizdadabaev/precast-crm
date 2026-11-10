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
import { Undo2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/payments/RefundDialog";
import { useLang, useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { parseMoney, uzPart } from "@/lib/gazoblok-text";
import { refundBody } from "@/lib/gazoblok-order-screen";

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
  const lang = useLang();
  const [refundOpen, setRefundOpen] = useState(false);

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
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-warning">
              {t("Қайтариш керак", "Refund owed")}
            </div>
            <div className="mt-1 text-xl font-black font-mono tabular-nums">{money(refundDue)}</div>
          </div>
          {canRefund ? (
            <Button variant="outline" className="min-h-[44px]" onClick={() => setRefundOpen(true)}>
              <Undo2 className="h-4 w-4 mr-1.5" />
              {t("Пулни қайтариш", "Refund")}
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("Фақат тўловни тасдиқловчи қайтара олади", "Only a payment approver can refund")}
            </div>
          )}
        </div>
      )}
      {canRefund && (
        <RefundDialog
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          orderId={orderId}
          due={refundDue}
          onRefunded={onChanged}
          showDate={false}
          parseAmount={parseMoney}
          submit={async (v) => {
            try {
              await api(`/api/gazoblok/orders/${orderId}`, { method: "PATCH", json: refundBody(v) });
            } catch (e) {
              throw new Error(uzPart((e as Error).message, lang));
            }
          }}
        />
      )}
    </div>
  );
}
