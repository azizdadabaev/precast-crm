"use client";

import { useEffect, useState } from "react";
import { Undo2, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/calculation/NumberInput";
import { METHODS, type PaymentMethod } from "@/components/payments/AddPaymentDialog";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  /** What the client is owed back (refundDue). Pre-fills and caps the amount. */
  due: number;
  onRefunded: () => void;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Record money given back to a client who overpaid (owner 2026-10-20). The
 * refund can be partial, never more than is due; the reason is required so
 * the order's history explains where the money went.
 */
export function RefundDialog({ open, onClose, orderId, due, onRefunded }: Props) {
  const t = useT();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(Math.round(due));
      setMethod("CASH");
      setDate(todayLocal());
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, due]);

  const validNote = note.trim().length >= 5;
  const validAmount = amount > 0 && amount <= due + 0.005;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      // Noon local keeps the chosen day the same day in every timezone.
      const [y, m, d] = date.split("-").map(Number);
      const paidOn = new Date(y, m - 1, d, 12).toISOString();
      await api(`/api/orders/${orderId}/refund`, {
        method: "POST",
        json: { amount, method, paidOn, note: note.trim() },
      });
      onRefunded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-warning" />
            Пулни қайтариш<span className="lang-en"> · Refund</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "Мижоз буюртмадан ортиқ тўлаган. Қайтарилган пулни шу ерда қайд этинг — тўловлардан айрилади.",
              "The client paid more than the order costs. Record the money given back here — it is subtracted from the payments.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-warning">
              Қайтариш керак<span className="lang-en"> · Due back</span>
            </span>
            <span className="tabular-nums font-mono font-extrabold text-warning">
              {formatNumber(due, 0)}
              <span className="text-[10px] font-normal ml-1">UZS</span>
            </span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Қайтарилган сумма<span className="lang-en"> · Amount returned</span>
            </Label>
            <div className="relative">
              <NumberInput
                step="1000"
                min="0"
                integer
                className="grid-input is-numeric h-9 w-full rounded border border-input pr-12"
                value={amount}
                onChange={(n) => setAmount(Math.max(0, n))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                UZS
              </span>
            </div>
            {!validAmount && amount > 0 && (
              <p className="text-xs text-destructive">
                {t(`${formatNumber(due, 0)} UZS дан ошмайди`, `Cannot exceed ${formatNumber(due, 0)} UZS`)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold">
                Усул<span className="lang-en"> · Method</span>
              </Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold">
                Сана<span className="lang-en"> · Date</span>
              </Label>
              <input
                type="date"
                value={date}
                max={todayLocal()}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Изоҳ<span className="lang-en"> · Note</span> <span className="text-destructive">*</span>
            </Label>
            <textarea
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("масалан: хона кичрайди, нақд қайтарилди", "e.g. room got smaller, returned in cash")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {t("Бекор қилиш", "Cancel")}
          </Button>
          <Button
            size="sm"
            className="bg-warning hover:bg-warning/90 text-warning-foreground"
            onClick={submit}
            disabled={submitting || !validNote || !validAmount}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
            Қайтарилди<span className="lang-en"> · Record refund</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
