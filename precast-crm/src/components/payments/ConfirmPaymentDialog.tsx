"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChainOfCustodyPanel } from "@/components/payments/ChainOfCustodyPanel";
import {
  DiscrepancyChoice,
  type DiscrepancyAction,
} from "@/components/payments/DiscrepancyChoice";
import { formatNumber } from "@/lib/utils";

export interface PaymentForConfirm {
  id: string;
  amount: string;
  method: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
  collectedByDriver: { id: string; name: string } | null;
  collectedAt: string | null;
  recordedBy: { id: string; name: string } | null;
  recordedAt: string;
  handedOverTo: { id: string; name: string } | null;
  handedOverToOfficeAt: string | null;
  confirmedBy: { id: string; name: string } | null;
  confirmedAt: string | null;
  order: {
    id: string;
    orderNumber: string;
    totalPrice: string;
    confirmedPaid: string;
    dispatch: { expectedCollection: string; driver: { id: string; name: string } | null } | null;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  payment: PaymentForConfirm | null;
  onConfirmed: () => void;
}

/**
 * Owner-only Confirm dialog. Embeds:
 *   - ChainOfCustodyPanel showing every step the cash made
 *   - editable amount (kicks adjustmentNote into "required" mode if changed)
 *   - DiscrepancyChoice when amount < dispatch.expectedCollection
 *   - separate "Reject" button that opens a tiny prompt-style flow
 */
export function ConfirmPaymentDialog({ open, onClose, payment, onConfirmed }: Props) {
  const [amount, setAmount] = useState<number | "">("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [discrepancyAction, setDiscrepancyAction] = useState<DiscrepancyAction>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Reset when payment changes
  useEffect(() => {
    if (payment) {
      setAmount(Number(payment.amount));
      setAdjustmentNote("");
      setDiscrepancyAction(null);
      setDiscrepancyNote("");
      setError(null);
      setSubmitting(false);
      setRejectMode(false);
      setRejectReason("");
    }
  }, [payment]);

  if (!payment) return null;

  // The dispatch's expectedCollection is the amount the DRIVER was sent
  // to collect on a particular delivery — it only makes sense to compare
  // against payments actually collected by that driver. For in-office
  // cash and bank/online transfers the dispatch number is unrelated, so
  // showing "shortfall" against it is misleading and would force the
  // owner to pick a discrepancy action for a payment that isn't actually
  // short of anything. Gate on whether this payment carries a driver.
  const fromDriver = !!payment.collectedByDriver;
  const expected =
    fromDriver && payment.order.dispatch?.expectedCollection
      ? Number(payment.order.dispatch.expectedCollection)
      : 0;
  const original = Number(payment.amount);
  const finalAmount = amount === "" ? 0 : Number(amount);
  const amountChanged = finalAmount !== original;
  const hasShortfall = expected > 0 && finalAmount < expected;

  async function confirm() {
    setError(null);
    if (amountChanged && adjustmentNote.trim().length < 5) {
      setError("Adjustment note (min 5 chars) is required when changing the amount");
      return;
    }
    if (hasShortfall && !discrepancyAction) {
      setError("Choose a discrepancy action (TRACK / DISCOUNT / WRITEOFF) to confirm");
      return;
    }
    if (hasShortfall && discrepancyNote.trim().length < 5) {
      setError("Discrepancy note (min 5 chars) is required");
      return;
    }
    setSubmitting(true);
    try {
      await fetch(`/api/payments/${payment!.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountChanged ? finalAmount : undefined,
          adjustmentNote: amountChanged ? adjustmentNote.trim() : undefined,
          discrepancyAction: hasShortfall ? discrepancyAction : undefined,
          discrepancyNote: hasShortfall ? discrepancyNote.trim() : undefined,
        }),
      }).then(async (r) => {
        const j = (await r.json()) as { ok: boolean; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Confirm failed");
      });
      onConfirmed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function reject() {
    setError(null);
    if (rejectReason.trim().length < 3) {
      setError("Reason is required (min 3 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await fetch(`/api/payments/${payment!.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      }).then(async (r) => {
        const j = (await r.json()) as { ok: boolean; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Reject failed");
      });
      onConfirmed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {rejectMode ? "Тўловни рад этиш · Reject payment" : "Тўловни тасдиқлаш · Confirm payment"}
          </DialogTitle>
          <DialogDescription>
            Order{" "}
            <span className="font-mono font-semibold">{payment.order.orderNumber}</span> · method{" "}
            <span className="font-semibold">{payment.method}</span>
          </DialogDescription>
        </DialogHeader>

        <ChainOfCustodyPanel payment={payment} />

        {!rejectMode && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold">
                Сумма · Amount (UZS)
              </Label>
              <Input
                type="number"
                min="0"
                step="1000"
                className="tabular-nums text-right"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
              <div className="text-[11px] text-muted-foreground">
                Recorded: <span className="tabular-nums">{formatNumber(original, 0)}</span>
                {expected > 0 && (
                  <>
                    {" · "}
                    Dispatch expected: <span className="tabular-nums">{formatNumber(expected, 0)}</span>
                  </>
                )}
              </div>
            </div>

            {amountChanged && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-bold">
                  Adjustment note (required, min 5 chars)
                </Label>
                <Input
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="e.g. Operator typo — corrected from receipt"
                />
              </div>
            )}

            <DiscrepancyChoice
              expected={expected}
              recorded={finalAmount}
              action={discrepancyAction}
              onAction={setDiscrepancyAction}
              note={discrepancyNote}
              onNote={setDiscrepancyNote}
            />
          </>
        )}

        {rejectMode && (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Сабаб · Reason (required)
            </Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Driver said amount on receipt is different"
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {rejectMode ? (
            <Button variant="ghost" size="sm" onClick={() => setRejectMode(false)}>
              ← Back to confirm
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-700 hover:bg-rose-50"
              onClick={() => setRejectMode(true)}
            >
              <X className="h-4 w-4 mr-1.5" /> Reject
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            {rejectMode ? (
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={reject}
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reject
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={confirm}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Тасдиқлаш · Confirm
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
