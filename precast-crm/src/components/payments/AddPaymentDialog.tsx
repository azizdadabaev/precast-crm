"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ReceiptPicker } from "@/components/payments/ReceiptPicker";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [amount, setAmount] = useState<number | "">(0);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [source, setSource] = useState<PaymentSource>("IN_OFFICE_CASH");
  const [handOverNow, setHandOverNow] = useState(false);
  const [notes, setNotes] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canRecord = me?.permissions?.includes("payment.record") ?? false;

  // Reset / pre-fill on open
  useEffect(() => {
    if (open) {
      setAmount(currentRemaining > 0 ? currentRemaining : 0);
      setMethod("CASH");
      setSource("IN_OFFICE_CASH");
      setHandOverNow(false);
      setNotes("");
      setReceiptUrls([]);
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
          ? t("Сумма нолдан катта бўлиши керак", "Amount must be greater than zero")
          : t(
              `Сумма қолганидан ошмаслиги керак (${formatNumber(currentRemaining, 0)})`,
              `Amount cannot exceed remaining (${formatNumber(currentRemaining, 0)})`,
            ),
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
          receiptUrls,
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
            <Wallet className="h-5 w-5 text-success" />
            Тўлов қўшиш<span className="lang-en"> · Add Payment</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "Мижоз буюртма жойлаштириш ва етказиб бериш ўртасида тўлайди. Эга тасдиқлагунча",
              "Customer paying between placement and delivery. Goes to",
            )}{" "}
            <span className="font-semibold">PENDING</span>
            {t(" ҳолатида туради.", " until the owner confirms it.")}
          </DialogDescription>
        </DialogHeader>

        {existingPendingTotal > 0 && (
          <div className="flex items-start gap-2 text-sm text-warning bg-warning/10 border border-warning/30 px-3 py-2 rounded-md">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            <span>
              <span className="font-semibold tabular-nums">
                {formatNumber(existingPendingTotal, 0)} UZS
              </span>{" "}
              {t(
                "ушбу буюртма бўйича тасдиқлаш кутилмоқда. Янгисини қўшишдан олдин эга тасдиқлашини кутиш тавсия этилади.",
                "already pending confirmation on this order. Recommended to wait until the owner confirms it before adding more.",
              )}
            </span>
          </div>
        )}

        <div className="space-y-3">
          {/* Source — radio group */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Манба<span className="lang-en"> · Source</span>
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
                <div className="lang-en text-xs text-muted-foreground">In office (cash)</div>
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
                <div className="lang-en text-xs text-muted-foreground">Bank or online transfer</div>
              </label>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Сумма<span className="lang-en"> · Amount</span> (UZS)
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
              Қолди<span className="lang-en"> · Remaining</span>{" "}
              <span className="lang-en">(excluding pending)</span>:{" "}
              <span className="tabular-nums font-semibold">
                {formatNumber(currentRemaining, 0)}
              </span>
            </div>
            {overLimit && (
              <div className="text-xs text-destructive">
                {t("Сумма қолганидан", "Amount cannot exceed remaining")} ({formatNumber(currentRemaining, 0)} UZS) {t("ошмаслиги керак.", ".")}
              </div>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Усул<span className="lang-en"> · Method</span>
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
                <span className="lang-en text-muted-foreground"> · I'm handing this cash to the owner now</span>
                <div className="text-[11px] text-muted-foreground">
                  {t(
                    "Шу ёзувда офисга топшириш қадамини белгилайди.",
                    "Stamps the office hand-over step in the same record.",
                  )}
                </div>
              </div>
            </label>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-bold">
              Эслатма<span className="lang-en"> · Notes</span> ({t("ихтиёрий", "optional")})
            </Label>
            <Input
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Эслатма · Ихтиёрий", "Eslatma · Optional note")}
            />
          </div>

          {/* Receipt picker — attach proof-of-payment images (optional) */}
          {canRecord && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold">
                Чек<span className="lang-en"> · Receipt</span> ({t("ихтиёрий", "optional")})
              </Label>
              <ReceiptPicker
                urls={receiptUrls}
                onChange={setReceiptUrls}
                disabled={submitting}
              />
            </div>
          )}

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
            className="bg-success hover:bg-success/90 text-success-foreground"
            onClick={save}
            disabled={submitting || !validAmount}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4 mr-2" />
            )}
            Сақлаш<span className="lang-en"> · Save Payment</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
