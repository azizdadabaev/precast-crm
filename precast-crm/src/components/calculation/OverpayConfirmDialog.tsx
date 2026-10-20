"use client";

import { AlertTriangle, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { Bi, useT } from "@/lib/i18n";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The refund due from a 409 OVERPAY_CONFIRM_REQUIRED, or null for any other
 * failure. Looks at the top level and under `details`, like the phone check.
 */
export function parseOverpayConfirm(err: unknown): { refundDue: number } | null {
  if (!(err instanceof ApiError) || err.status !== 409 || !isRecord(err.payload)) return null;
  const candidates: Record<string, unknown>[] = [err.payload];
  for (const key of ["details", "data", "error"]) {
    const nested = err.payload[key];
    if (isRecord(nested)) candidates.push(nested);
  }
  for (const c of candidates) {
    if (c.code === "OVERPAY_CONFIRM_REQUIRED") {
      const due = Number(c.refundDue);
      return { refundDue: Number.isFinite(due) ? due : 0 };
    }
  }
  return null;
}

interface Props {
  refundDue: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asked before an order edit that leaves the client having paid more than the
 * order now costs (owner 2026-10-20). Saving is allowed — the order then says
 * «Қайтариш керак» and the owners are notified; cancelling keeps every typed
 * value so the edit can be reconsidered.
 */
export function OverpayConfirmDialog({ refundDue, pending, onConfirm, onCancel }: Props) {
  const t = useT();
  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <Bi uz="Мижоз ортиқча тўлаган бўлади" en="The client will have overpaid" />
          </DialogTitle>
          <DialogDescription>
            {t(
              "Янги сумма мижоз аллақачон тўлаган пулдан кам. Сақласангиз, фарқни мижозга қайтариш керак бўлади.",
              "The new total is less than the client has already paid. If you save, the difference has to be given back.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-baseline justify-between rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-warning">
            Қайтариш керак<span className="lang-en"> · Refund due</span>
          </span>
          <span className="tabular-nums font-mono font-extrabold text-warning">
            {formatNumber(refundDue, 0)}
            <span className="text-[10px] font-normal ml-1">UZS</span>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            "Бекор қилсангиз, ҳеч нарса ўзгармайди — ёзганларингиз жойида қолади.",
            "Cancel and nothing changes — everything you typed stays where it is.",
          )}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {t("Бекор қилиш", "Cancel")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={onConfirm}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
            <Bi uz="Ҳа, сақлансин" en="Yes, save" enClassName="font-normal opacity-90" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
