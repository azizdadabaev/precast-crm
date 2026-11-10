"use client";

/**
 * Close as loaded: the client won't take the rest. Shows what will never be taken per
 * size, the old → new total and what that leaves owed or owed back, before pressing.
 * Reason required; the server recomputes everything.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Scissors } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLang, useT } from "@/lib/i18n";
import { uzPart } from "@/lib/gazoblok-text";
import { cn, formatNumber } from "@/lib/utils";
import { shortCloseTotals, type LineQty } from "@/lib/gazoblok-quantities";
import { NUM } from "@/components/gazoblok/order-form/ui";
import { BTN_OUTLINE, BTN_PRIMARY, ICON } from "./ui";

const n0 = (v: number) => formatNumber(v, 0);

export function CloseShortDialog({
  orderId,
  orderNumber,
  clientName,
  quantities,
  lines,
  totals,
  confirmedPaid,
  onClose,
  onDone,
}: {
  orderId: string;
  orderNumber: string;
  clientName: string;
  quantities: LineQty[];
  lines: { id: string; quantity: number; unitPrice: number }[];
  totals: { linesSubtotal: number; discountAmount: number; deliveryCost: number; totalPrice: number };
  confirmedPaid: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const next = shortCloseTotals(lines, new Map(quantities.map((q) => [q.lineId, q.loaded])), totals);
  const refund = Math.max(0, confirmedPaid - next.totalPrice);
  const debt = Math.max(0, next.totalPrice - confirmedPaid);
  const sum = (k: "ordered" | "loaded" | "left") => quantities.reduce((s, q) => s + q[k], 0);

  const close = useMutation({
    mutationFn: () => api(`/api/gazoblok/orders/${orderId}`, { method: "PATCH", json: { action: "close_short", reason: reason.trim() } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e: Error) => setError(uzPart(e.message, lang)),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !close.isPending) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[640px] gap-0 overflow-y-auto p-0 max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-lg font-bold">{t("Юкланганича ёпиш", "Close as loaded")}</DialogTitle>
          <DialogDescription className="text-[13px]">
            <span className={NUM}>{orderNumber}</span> · {clientName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <p className="text-[13px] text-muted-foreground">
            {t(
              "Мижоз қолганини олмайди. Буюртма юкланган блоклар бўйича қайта ҳисобланади; олинмаганлари омборда қолади, кейин юклаб бўлмайди.",
              "The client won't take the rest. The order is re-billed on the loaded blocks; the rest stays in stock and can't be loaded later.",
            )}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-muted-foreground">
                <th className="py-2 text-left font-semibold">{t("Ўлчам", "Size")}</th>
                <th className="py-2 text-right font-semibold">{t("Буюртма", "Ordered")}</th>
                <th className="py-2 text-right font-semibold">{t("Юкланди", "Loaded")}</th>
                <th className="py-2 text-right font-semibold">{t("Олинмайди", "Not taken")}</th>
              </tr>
            </thead>
            <tbody>
              {quantities.map((q) => (
                <tr key={q.lineId} className="border-t border-border">
                  <td className={cn(NUM, "py-2.5 font-semibold")}>{q.label}</td>
                  <td className={cn(NUM, "py-2.5 text-right")}>{n0(q.ordered)}</td>
                  <td className={cn(NUM, "py-2.5 text-right")}>{n0(q.loaded)}</td>
                  <td className={cn(NUM, "py-2.5 text-right font-semibold", q.left > 0 ? "text-warning" : "text-muted-foreground")}>{n0(q.left)}</td>
                </tr>
              ))}
              {quantities.length > 1 && (
                <tr className="border-t border-border bg-muted/50 font-semibold">
                  <td className="py-2.5 pl-1">{t("Жами", "Total")}</td>
                  <td className={cn(NUM, "py-2.5 text-right font-bold")}>{n0(sum("ordered"))}</td>
                  <td className={cn(NUM, "py-2.5 text-right font-bold")}>{n0(sum("loaded"))}</td>
                  <td className={cn(NUM, "py-2.5 text-right font-bold text-warning")}>{n0(sum("left"))}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="space-y-1.5 rounded-md bg-muted/60 px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{t("Жами", "Total")}</span>
              <span>
                <span className={cn(NUM, "text-muted-foreground line-through")}>{n0(totals.totalPrice)}</span> →{" "}
                <b className={cn(NUM, "text-[15px]")}>{n0(next.totalPrice)}</b> UZS
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{t("Тўланган", "Paid")}</span>
              <span className={cn(NUM, "font-semibold", confirmedPaid > 0 ? "text-success" : "text-muted-foreground")}>{n0(confirmedPaid)}</span>
            </div>
            {refund >= 0.01 ? (
              <div className="flex items-baseline justify-between gap-3 font-semibold text-warning">
                <span>{t("Қайтариш керак бўлади", "Refund will be owed")}</span>
                <span className={NUM}>{n0(refund)}</span>
              </div>
            ) : debt >= 0.01 ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{t("Қарздорлик бўлади", "Debt will be")}</span>
                <span className={cn(NUM, "font-semibold text-destructive")}>{n0(debt)}</span>
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="close-reason" className="mb-1.5 flex items-center gap-1 text-xs font-semibold">
              {t("Сабаб", "Reason")} <span className="text-destructive">*</span>
            </label>
            <textarea
              id="close-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("Сабаб тарихга ва буюртма бошига ёзилади.", "The reason goes into the history and the order header.")}</p>
          </div>
          {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4 sm:justify-end">
          <button type="button" className={cn(BTN_OUTLINE, "flex-1 sm:flex-none")} onClick={onClose} disabled={close.isPending}>
            {t("Орқага", "Back")}
          </button>
          <button
            type="button"
            className={cn(BTN_PRIMARY, "flex-[2] sm:flex-none")}
            disabled={close.isPending || reason.trim().length < 3}
            onClick={() => {
              setError(null);
              close.mutate();
            }}
            data-action="confirm-close-short"
          >
            {close.isPending ? <Loader2 className="animate-spin" {...ICON} /> : <Scissors {...ICON} />}
            {t("Юкланганича ёпиш", "Close as loaded")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
