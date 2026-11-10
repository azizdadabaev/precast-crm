"use client";

/**
 * Close short: the client stopped before taking everything. Shows loaded vs ordered
 * per size and the new total (billed on loaded blocks), and needs a reason.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { shortCloseTotals, type LineQty } from "@/lib/gazoblok-quantities";

export function GazoblokCloseShortDialog({
  open,
  onClose,
  orderId,
  quantities,
  lines,
  totals,
  confirmedPaid,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantities: LineQty[];
  lines: { id: string; quantity: number; unitPrice: number }[];
  totals: { linesSubtotal: number; discountAmount: number; deliveryCost: number; totalPrice: number };
  confirmedPaid: number;
  onDone: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loaded = new Map(quantities.map((q) => [q.lineId, q.loaded]));
  const next = shortCloseTotals(lines, loaded, totals);
  const refund = Math.max(0, confirmedPaid - next.totalPrice);
  const close = useMutation({
    mutationFn: () => api(`/api/gazoblok/orders/${orderId}`, { method: "PATCH", json: { action: "close_short", reason: reason.trim() } }),
    onSuccess: () => {
      setReason("");
      onDone();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const n = (v: number) => formatNumber(v, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !close.isPending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Қолганини олмайди — буюртмани ёпиш", "Client takes no more — close the order")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "Буюртма юкланган блоклар бўйича қайта ҳисобланади. Юкланмаганлари омборда қолади. Кейин юклаш бўлмайди.",
            "The order is re-billed on the blocks that were loaded. Unloaded blocks stay in stock. No more loading after this.",
          )}
        </p>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left py-1.5">{t("Ўлчам", "Size")}</th>
              <th className="text-right py-1.5">{t("Буюртма", "Ordered")}</th>
              <th className="text-right py-1.5">{t("Юкланди", "Loaded")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {quantities.map((q) => (
              <tr key={q.lineId}>
                <td className="py-1.5">{q.label}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{n(q.ordered)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums font-semibold">{n(q.loaded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("Ҳозирги жами", "Current total")}</span><span className="font-mono tabular-nums">{n(totals.totalPrice)} UZS</span></div>
          <div className="flex justify-between font-semibold"><span>{t("Янги жами", "New total")}</span><span className="font-mono tabular-nums">{n(next.totalPrice)} UZS</span></div>
          {refund > 0 && (
            <div className="flex justify-between text-warning font-semibold"><span>{t("Қайтариш керак бўлади", "Refund will be owed")}</span><span className="font-mono tabular-nums">{n(refund)} UZS</span></div>
          )}
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Сабаб (мажбурий)", "Reason (required)")}
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal font-normal"
          />
        </label>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-[44px]" onClick={onClose} disabled={close.isPending}>{t("Орқага", "Back")}</Button>
          <Button className="min-h-[44px]" disabled={close.isPending || reason.trim().length < 3} onClick={() => { setError(null); close.mutate(); }}>
            {close.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("Юкланганлари бўйича ёпиш", "Close on loaded blocks")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
