"use client";

import { useEffect, useState } from "react";
import { Wallet, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";
type PaymentSource = "IN_OFFICE_CASH" | "BANK_OR_ONLINE";

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH",          label: "Нақд · Cash" },
  { value: "BANK_TRANSFER", label: "Банк · Bank transfer" },
  { value: "CLICK",         label: "Click" },
  { value: "PAYME",         label: "Payme" },
  { value: "OTHER",         label: "Бошқа · Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  /** total − confirmedPaid − sum(PENDING). Hard ceiling for amount. */
  currentRemaining: number;
  /** sum of PENDING_CONFIRMATION amounts on this order (for the advisory). */
  existingPendingTotal: number;
  /** Refresh the order detail query on success. */
  onSaved: () => void;
}

/**
 * Mid-order Add Payment dialog. Used between placement and delivery to
 * record cash / bank-transfer payments. Always lands as
 * PENDING_CONFIRMATION; the owner confirms on /payments.
 *
 * Source affects which downstream chain-of-custody fields get set:
 *   IN_OFFICE_CASH   recordedAt set; handedOverToOfficeAt set if handOverNow
 *   BANK_OR_ONLINE   recordedAt set; no driver, no handover step
 */
export function AddPaymentDialog({
  open,
  onClose,
  orderId,
  currentRemaining,
  existingPendingTotal,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState<number | "">(0);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [source, setSource] = useState<PaymentSource>("IN_OFFICE_CASH");
  const [handOverNow, setHandOverNow] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / pre-fill on open
  useEffect(() => {
    if (open) {
      setAmount(currentRemaining > 0 ? currentRemaining : 0);
      setMethod("CASH");
      setSource("IN_OFFICE_CASH");
      setHandOverNow(false);
      setNotes("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, currentRemaining]);

  // Method auto-aligns with source when the operator switches source.
  // Bank/online can't be CASH; in-office cash defaults back to CASH.
  useEffect(() => {
    if (source === "BANK_OR_ONLINE" && method === "CASH") {
      setMethod("BANK_TRANSFER");
    }
    if (source === "IN_OFFICE_CASH" && method !== "CASH") {
      setMethod("CASH");
    }
    // We only react to source changes — not method — to avoid a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Bank/online has no physical handover step; force the flag off.
  useEffect(() => {
    if (source === "BANK_OR_ONLINE") setHandOverNow(false);
  }, [source]);

  const amt = amount === "" ? 0 : Number(amount);
  const overLimit = amt > currentRemaining;
  const validAmount = amt > 0 && !overLimit;

  async function save() {
    setError(null);
    if (!validAmount) {
      setError(
        amt <= 0
          ? "Amount must be greater than zero"
          : `Amount cannot exceed remaining (${formatNumber(currentRemaining, 0)})`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/payments", {
        method: "POST",
        json: {
          orderId,
          amount: amt,
          method,
          source,
          handOverNow: source === "IN_OFFICE_CASH" ? handOverNow : false,
          notes: notes.trim() || null,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Тўлов қўшиш · Add Payment
          </DialogTitle>
          <DialogDescription>
            Customer paying between placement and delivery. Goes to{" "}
            <span className="font-semibold">PENDING</span> until the owner confirms it.
          </DialogDescription>
        </DialogHeader>

        {existingPendingTotal > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <span>
              <span className="font-semibold tabular-nums">
                {formatNumber(existingPendingTotal, 0)} UZS
              </span>{" "}
              already pending confirmation on this order. Recommended to wait until the
              owner confirms it before adding more.
            </span>
          </div>
        )}

        <div className="space-y-3">
          {/* Source — radio group */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Манба · Source
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`cursor-pointer rounded-md border p-2.5 text-sm transition-colors ${
                  source === "IN_OFFICE_CASH"
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="source"
                  className="sr-only"
                  checked={source === "IN_OFFICE_CASH"}
                  onChange={() => setSource("IN_OFFICE_CASH")}
                />
                <div className="font-semibold">Офисда нақд</div>
                <div className="text-xs text-muted-foreground">In office (cash)</div>
              </label>
              <label
                className={`cursor-pointer rounded-md border p-2.5 text-sm transition-colors ${
                  source === "BANK_OR_ONLINE"
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="source"
                  className="sr-only"
                  checked={source === "BANK_OR_ONLINE"}
                  onChange={() => setSource("BANK_OR_ONLINE")}
                />
                <div className="font-semibold">Банк / Онлайн</div>
                <div className="text-xs text-muted-foreground">Bank or online transfer</div>
              </label>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Сумма · Amount (UZS)
            </Label>
            <Input
              type="number"
              min={1}
              max={currentRemaining}
              step={1000}
              value={amount}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="tabular-nums text-right"
            />
            <div className="text-[11px] text-muted-foreground">
              Қолди · Remaining (excluding pending):{" "}
              <span className="tabular-nums font-semibold">
                {formatNumber(currentRemaining, 0)}
              </span>
            </div>
            {overLimit && (
              <div className="text-xs text-rose-700">
                Amount cannot exceed remaining ({formatNumber(currentRemaining, 0)} UZS).
              </div>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Усул · Method
            </Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS
                .filter((m) =>
                  source === "IN_OFFICE_CASH" ? m.value === "CASH" : m.value !== "CASH",
                )
                .map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
            </Select>
          </div>

          {/* Hand-over checkbox — only for in-office cash */}
          {source === "IN_OFFICE_CASH" && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 accent-primary cursor-pointer"
                checked={handOverNow}
                onChange={(e) => setHandOverNow(e.target.checked)}
              />
              <div className="text-sm">
                <span className="font-semibold">Тўловни ҳозир топширдим</span>
                <span className="text-muted-foreground"> · I'm handing this cash to the owner now</span>
                <div className="text-[11px] text-muted-foreground">
                  Stamps the office hand-over step in the same record.
                </div>
              </div>
            </label>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Эслатма · Notes (optional)
            </Label>
            <Input
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Eslatma · Optional note"
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
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={save}
            disabled={submitting || !validAmount}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4 mr-2" />
            )}
            Сақлаш · Save Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
