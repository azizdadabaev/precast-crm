"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, PackageCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";
import { ReceiptPicker } from "@/components/payments/ReceiptPicker";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH",          label: "Нақд · Cash" },
  { value: "BANK_TRANSFER", label: "Банк · Bank transfer" },
  { value: "CLICK",         label: "Click" },
  { value: "PAYME",         label: "Payme" },
  { value: "OTHER",         label: "Бошқа · Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-filled summary the user is about to commit */
  summary: {
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    rooms: number;
    totalArea: number;        // m² (visual / monolith)
    totalBeams: number;
    totalBlocks: number;
    roomsSubtotal: number;    // UZS
    discountPercent: number;
    discountAmount: number;
    deliveryCost: number;
    totalPrice: number;
    /**
     * Rooms whose Width has been rounded BELOW the engineering-calculated
     * value (originalWidth) on the calculator. Empty array when none.
     * Surfaced as a non-blocking notice in the dialog body so the operator
     * sees the over-ride in context before placing the order.
     */
    undersizedRooms?: Array<{
      name: string;
      innerWidth: number;
      innerLength: number;
      originalWidth: number;
    }>;
  };
  /** Confirm handler — receives the chosen scheduled date and the
   *  optional up-front payment captured in the dialog. paidAmount = 0
   *  means "no payment row to create". */
  onConfirm: (args: {
    scheduledAt: Date;
    paidAmount: number;
    paymentMethod: PaymentMethod;
    receiptUrls: string[];
  }) => Promise<void>;
  /** Edit-mode flag. When true the dialog renames itself to "Save edits",
   *  hides the up-front payment section (existing payments are preserved
   *  by the edit endpoint), and reports `paidAmount = 0` on confirm so
   *  the caller's onConfirm signature stays stable. */
  editMode?: boolean;
  /** Pre-fill the date picker with this. Used in edit-mode to default
   *  to the order's existing scheduledAt; leave unset for fresh
   *  placements (operator picks from the calendar). */
  defaultScheduledAt?: Date | null;
}

export function PlaceOrderDialog({
  open,
  onClose,
  summary,
  onConfirm,
  editMode = false,
  defaultScheduledAt = null,
}: Props) {
  const t = useT();
  const [date, setDate] = useState<Date | null>(defaultScheduledAt ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<number | "">(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);

  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canRecord = me?.permissions?.includes("payment.record") ?? false;

  // Sync the picker to a newly-arrived default (e.g. edit-mode loads
  // the order's scheduledAt after the dialog has already mounted).
  // Operator's subsequent picks aren't overwritten because the prop
  // only changes when entering/leaving edit-mode.
  useEffect(() => {
    if (defaultScheduledAt) setDate(defaultScheduledAt);
  }, [defaultScheduledAt]);

  if (!open) return null;

  const paidNum = paidAmount === "" ? 0 : Number(paidAmount);
  const remainder = Math.max(0, summary.totalPrice - paidNum);
  const fullyPaid = paidNum > 0 && paidNum >= summary.totalPrice;
  const overPaid = paidNum > summary.totalPrice;

  const canConfirm = !!date && !submitting && !overPaid;

  async function confirm() {
    if (!date) return;
    if (!editMode && overPaid) {
      setError(t("Тўлов жами суммадан ошмаслиги керак", "Payment cannot exceed the total"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // In edit-mode the up-front payment fields are hidden, so always
      // emit zero / CASH default — the caller routes to the edit
      // endpoint which doesn't read these fields.
      await onConfirm({
        scheduledAt: date,
        paidAmount: editMode ? 0 : paidNum,
        paymentMethod: editMode ? "CASH" : paymentMethod,
        receiptUrls: editMode ? [] : receiptUrls,
      });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">
              {editMode
                ? <>Таҳрирни сақлаш<span className="lang-en"> · Save edits</span></>
                : <>Буюртма Бериш<span className="lang-en"> · Place Order</span></>}
            </h2>
            <p className="text-xs text-muted-foreground">
              {editMode
                ? t(
                    "Жойида мавжуд снепшотни алмаштиради. Тўловлар сақланиб қолади.",
                    "Replaces the existing snapshot in place. Existing payments preserved.",
                  )
                : t(
                    "Етказиб бериш / ишлаб чиқариш санасини танланг. Календарь жорий юкламани кўрсатади.",
                    "Pick a delivery / production date. Calendar shows existing load.",
                  )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div>
            {summary.undersizedRooms && summary.undersizedRooms.length > 0 && (
              <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {summary.undersizedRooms.length === 1
                      ? t(
                          "1 та хона муҳандислик ҳисоб-китобидаги эни кичикроқ",
                          "1 room is smaller than the engineering-calculated width",
                        )
                      : t(
                          `${summary.undersizedRooms.length} та хона муҳандислик ҳисоб-китобидаги эни кичикроқ`,
                          `${summary.undersizedRooms.length} rooms are smaller than the engineering-calculated width`,
                        )}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs pl-6 tabular-nums">
                  {summary.undersizedRooms.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>
                        {formatNumber(r.innerWidth, 2)} × {formatNumber(r.innerLength, 2)} m
                      </span>
                      <span className="text-warning">
                        ⚠ ўлчам кичикроқ ({formatNumber(r.originalWidth, 3)} → {formatNumber(r.innerWidth, 3)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <CapacityCalendar
              value={date}
              onChange={setDate}
              pendingArea={summary.totalArea}
              disablePast
            />
            {date && (
              <div className="mt-3 text-sm bg-success/10 border border-success/30 text-success rounded-md px-3 py-2">
                {t("Жадвалга қўйилади:", "Will be scheduled for")}{" "}
                <span className="font-semibold">
                  {date.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                </span>
                . {t("Буюртма", "The order's")} {formatNumber(summary.totalArea, 1)} m²{" "}
                {t("юқоридаги календарьда олдиндан кўрсатилган.", "is previewed in the calendar above.")}
              </div>
            )}
          </div>

          {/* Summary panel */}
          <aside className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Мижоз<span className="lang-en"> · Client</span>
              </div>
              <div className="font-semibold">{summary.clientName}</div>
              <div className="text-xs tabular-nums">{summary.clientPhone}</div>
              {summary.clientAddress && (
                <div className="text-xs text-muted-foreground">{summary.clientAddress}</div>
              )}
            </div>
            <div className="border-t border-border pt-3">
              <Row label={<>Хоналар<span className="lang-en"> · Rooms</span></>} value={summary.rooms} />
              <Row label={<>Майдон<span className="lang-en"> · Slab area</span></>} value={`${formatNumber(summary.totalArea, 2)} m²`} />
              <Row label={<>Балка<span className="lang-en"> · Beams</span></>} value={summary.totalBeams} />
              <Row label={<>Ғишт<span className="lang-en"> · Blocks</span></>} value={summary.totalBlocks} />
            </div>
            <div className="border-t border-border pt-3">
              <Row label={<>Сумма<span className="lang-en"> · Subtotal</span></>} value={formatNumber(summary.roomsSubtotal, 0)} />
              {summary.discountPercent > 0 && (
                <Row
                  label={`Чегирма ${summary.discountPercent}%`}
                  value={`− ${formatNumber(summary.discountAmount, 0)}`}
                  rose
                />
              )}
              {summary.deliveryCost > 0 && (
                <Row label={<>Етказиб бериш<span className="lang-en"> · Delivery</span></>} value={formatNumber(summary.deliveryCost, 0)} />
              )}
              <div className="flex items-baseline justify-between border-t border-border pt-2 mt-2">
                <span className="font-bold">Жами<span className="lang-en"> · Total</span></span>
                <span className="font-black text-success text-xl tabular-nums font-mono">
                  {formatNumber(summary.totalPrice, 0)}{" "}
                  <span className="text-xs text-muted-foreground font-normal">UZS</span>
                </span>
              </div>
            </div>

            {/* Up-front payment — captured at placement, goes through
                maker-checker (PENDING_CONFIRMATION until ADMIN/OWNER confirms).
                Hidden in edit-mode: existing payments are preserved as-is
                by the edit endpoint; new payments go through the order's
                Add Payment flow afterward. */}
            {!editMode && (
            <div className="border-t border-border pt-3 space-y-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Тўлов<span className="lang-en"> · Payment now</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={summary.totalPrice}
                  step={1000}
                  value={paidAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPaidAmount(v === "" ? "" : Number(v));
                  }}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Усул<span className="lang-en"> · Method</span>
                </span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={paidNum === 0}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                >
                  {METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className={`flex items-baseline justify-between text-sm rounded px-2 py-1.5 ${
                  fullyPaid
                    ? "bg-success/10 text-success"
                    : paidNum > 0
                      ? "bg-warning/10 text-warning"
                      : "text-muted-foreground"
                }`}
              >
                <span className="font-semibold">
                  {fullyPaid
                    ? <>Тўланган<span className="lang-en"> · Paid in full</span></>
                    : <>Қолди<span className="lang-en"> · Remainder</span></>}
                </span>
                <span className="tabular-nums font-bold">
                  {formatNumber(remainder, 0)}
                </span>
              </div>
              {overPaid && (
                <div className="text-xs text-destructive">
                  {t(
                    `Тўлов жами суммадан ошмаслиги керак (${formatNumber(summary.totalPrice, 0)} UZS).`,
                    `Payment cannot exceed the total (${formatNumber(summary.totalPrice, 0)} UZS).`,
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground leading-snug">
                {t("Қайд этилади", "Recorded as")}{" "}
                <span className="font-semibold">PENDING</span>.{" "}
                {t(
                  "Эга Тўловлар саҳифасида тасдиқлайди; шундан кейингина буюртманинг тасдиқланган тўлови янгиланади.",
                  "Owner confirms it on the Payments page; only then does the order's confirmedPaid update.",
                )}
              </p>
              {canRecord && paidNum > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Чек<span className="lang-en"> · Receipt</span> ({t("ихтиёрий", "optional")})
                  </span>
                  <ReceiptPicker
                    urls={receiptUrls}
                    onChange={setReceiptUrls}
                    disabled={submitting}
                  />
                </div>
              )}
            </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {editMode
                ? t(
                    "Мавжуд тўловлар сақланиб қолади. Эга ортиқча ёки кам тўловларни қўлда созлайди.",
                    "Existing payments are preserved. Owner reconciles any over- or under-payment manually.",
                  )
                : (
                  <>
                    {t("Нархлар ҳозир музлайди. Лойиҳа ҳолати", "Prices freeze at this moment. The Project's status flips to")}{" "}
                    <span className="font-semibold">ORDERED</span>
                    {t(" га ўзгаради.", ".")}
                  </>
                )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              {t("Бекор қилиш", "Cancel")}
            </Button>
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-success-foreground"
              disabled={!canConfirm}
              onClick={confirm}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4 mr-2" />
              )}
              {editMode
                ? <>Таҳрирни сақлаш<span className="lang-en"> · Save edits</span></>
                : <>Буюртма Бериш<span className="lang-en"> · Place Order</span></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  rose,
}: {
  label: React.ReactNode;
  value: string | number;
  rose?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${rose ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}
