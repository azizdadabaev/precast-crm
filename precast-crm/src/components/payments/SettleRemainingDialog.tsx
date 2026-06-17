"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  /** total − confirmedPaid − writeOffAmount. The amount to be written off. */
  remaining: number;
  /** Refresh the order detail query on success. */
  onSettled: () => void;
}

/**
 * Settle remaining balance (write-off) dialog. Owner-only, deliberate:
 * writes off the leftover so the order counts as FULLY_PAID. Requires a
 * reason (min 3 chars) and a confirm — there's no money changing hands,
 * this just closes out a small uncollectable remainder.
 */
export function SettleRemainingDialog({
  open,
  onClose,
  orderId,
  remaining,
  onSettled,
}: Props) {
  const t = useT();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const validNote = note.trim().length >= 3;

  async function settle() {
    setError(null);
    if (!validNote) {
      setError(t("Сабаб камида 3 белги бўлиши керак", "Reason must be at least 3 characters"));
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/orders/${orderId}/settle-remaining`, {
        method: "PATCH",
        json: { note: note.trim() },
      });
      onSettled();
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
            <BadgeCheck className="h-5 w-5 text-amber-600" />
            Қолдиқни ёпиш<span className="lang-en"> · Settle remaining</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "Қолган қолдиқ ҳисобдан чиқарилади ва буюртма тўлиқ тўланган деб белгиланади. Пул ўтмайди — бу кичик қолдиқни ёпиш учун.",
              "The leftover is written off and the order is marked fully paid. No money changes hands — this just closes out a small remainder.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Amount to write off */}
          <div className="flex items-baseline justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/40">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Ҳисобдан чиқарилади<span className="lang-en"> · Writing off</span>
            </span>
            <span className="tabular-nums font-mono font-extrabold text-amber-900 dark:text-amber-200">
              {formatNumber(remaining, 0)}
              <span className="text-[10px] font-normal ml-1">UZS</span>
            </span>
          </div>

          {/* Required reason */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Сабаб<span className="lang-en"> · Reason</span>{" "}
              <span className="text-destructive">*</span>
            </Label>
            <textarea
              value={note}
              maxLength={300}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(
                "масалан: Думалоқлаш қолдиғи, мижоз билан келишилган",
                "e.g. Rounding remainder, agreed with the customer",
              )}
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
            className="bg-amber-600 hover:bg-amber-600/90 text-white"
            onClick={settle}
            disabled={submitting || !validNote}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BadgeCheck className="h-4 w-4 mr-2" />
            )}
            Ҳисобдан чиқариш<span className="lang-en"> · Settle</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
