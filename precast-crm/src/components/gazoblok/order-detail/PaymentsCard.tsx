"use client";

import { useState } from "react";
import { Ban, Check, CircleCheck, Clock, Loader2, Plus, Receipt, Undo2, Wallet, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReceiptPicker } from "@/components/payments/ReceiptPicker";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import { parseMoney } from "@/lib/gazoblok-text";
import { paymentRow, regroupMoney } from "@/lib/gazoblok-order-screen";
import { dotDateTime, isAutoConfirmed } from "@/lib/gazoblok-detail";
import { ErrorText, Help, NUM, SectionCard } from "@/components/gazoblok/order-form/ui";
import { METHODS } from "@/components/gazoblok/order-form/PaymentSection";
import type { PaymentMethod } from "@/components/gazoblok/order-form/types";
import type { Payment } from "./types";
import { BTN_OUTLINE, BTN_PRIMARY, ICON, Pill } from "./ui";

const n0 = (v: number) => formatNumber(v, 0);
const METHOD_ICON = Object.fromEntries(METHODS.map((m) => [m.key, m.icon])) as Record<string, (typeof METHODS)[number]["icon"]>;

export function PaymentsCard({
  payments,
  orderStatus,
  total,
  paid,
  payable,
  unpaidOverload,
  canRecord,
  canConfirm,
  formOpen,
  onFormOpen,
  amountRaw,
  onAmountRaw,
  recordPending,
  reviewPending,
  onRecord,
  onConfirm,
  onReject,
}: {
  payments: Payment[];
  orderStatus: string;
  total: number;
  paid: number;
  /** What may still be recorded now (total − confirmed − pending). */
  payable: number;
  unpaidOverload: number;
  canRecord: boolean;
  canConfirm: boolean;
  formOpen: boolean;
  onFormOpen: (open: boolean) => void;
  amountRaw: string;
  onAmountRaw: (v: string) => void;
  recordPending: boolean;
  reviewPending: boolean;
  onRecord: (v: { amount: number; method: PaymentMethod; receiptUrls: string[] }, done: () => void) => void;
  onConfirm: (p: Payment) => void;
  onReject: (p: Payment) => void;
}) {
  const t = useT();
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [receipts, setReceipts] = useState<string[]>([]);
  const [pressed, setPressed] = useState(false);
  const canAdd = canRecord && orderStatus !== "CANCELED" && payable > 0.005;
  const amount = parseMoney(amountRaw);
  const unreadable = amountRaw.trim() !== "" && amount === null;
  const tooHigh = amount !== null && amount > payable + 0.005;
  const settled = Math.abs(paid - total) < 0.005 && total > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setPressed(true);
    if (amount === null || amount <= 0 || tooHigh) return;
    onRecord({ amount, method, receiptUrls: receipts }, () => {
      setReceipts([]);
      setPressed(false);
    });
  }

  return (
    <SectionCard
      id="sec-payments"
      icon={<Wallet className="h-4 w-4" {...ICON} />}
      title={t("Тўловлар", "Payments")}
      done={settled && orderStatus !== "CANCELED"}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-muted-foreground">
            {t("Тасдиқланган", "Confirmed")} <b className={cn(NUM, "text-foreground")}>{n0(paid)}</b> <span className={NUM}>/ {n0(total)}</span>
          </span>
          {canAdd && !formOpen && (
            <button type="button" className={BTN_OUTLINE} onClick={() => onFormOpen(true)} data-action="open-payment">
              <Plus {...ICON} />
              {t("Тўлов қўшиш", "Add payment")}
            </button>
          )}
        </div>
      }
    >
      {payments.length === 0 ? (
        <div className="text-[13px] text-muted-foreground">{t("Ҳали тўлов йўқ.", "No payments yet.")}</div>
      ) : (
        <ul className="divide-y divide-border">
          {payments.map((p) => {
            const row = paymentRow(p, orderStatus);
            const Icon = row.refund ? Undo2 : METHOD_ICON[p.method] ?? Wallet;
            const rejected = p.status === "REJECTED";
            const auto = isAutoConfirmed(p);
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-3 py-3" data-payment={p.status}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" {...ICON} />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(NUM, "text-[15px] font-bold", rejected && "text-muted-foreground line-through", row.refund && "text-warning")}>
                      {row.amountText}
                    </span>
                    <span className="text-xs text-muted-foreground">UZS</span>
                    {row.refund ? (
                      <Pill tone="warning" icon={<Undo2 {...ICON} />}>{t("Қайтарилди", "Refunded")}</Pill>
                    ) : p.status === "CONFIRMED" ? (
                      <Pill tone="success" icon={<Check {...ICON} />}>{t("Тасдиқланган", "Confirmed")}</Pill>
                    ) : rejected ? (
                      <Pill tone="destructive" icon={<X {...ICON} />}>{t("Рад этилган", "Rejected")}</Pill>
                    ) : (
                      <Pill tone="muted" icon={<Clock {...ICON} />}>{t("Тасдиқланмаган", "Unconfirmed")}</Pill>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[p.method] ? t(...PAYMENT_METHOD_LABELS[p.method]) : p.method} · {p.recordedBy?.name ?? "—"}
                    {p.recordedAt && (
                      <>
                        {" · "}
                        <span className={NUM}>{dotDateTime(p.recordedAt)}</span>
                      </>
                    )}
                    {auto && <> · {t("автоматик тасдиқланди", "auto-confirmed")}</>}
                  </div>
                  {rejected && p.notes && (
                    <div className="mt-1 text-xs text-destructive">
                      {t("Рад этиш сабаби", "Rejection reason")}: {p.notes}
                    </div>
                  )}
                  {row.refund && p.notes && <div className="mt-1 text-xs text-muted-foreground">{p.notes}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.receipts.map((r) => (
                    <a
                      key={r.id}
                      href={r.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("Чекни очиш", "Open receipt")}
                      className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground hover:ring-1 hover:ring-primary"
                    >
                      <Receipt className="absolute h-4 w-4" {...ICON} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.imageUrl}
                        alt={t("Чек", "Receipt")}
                        className="relative h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </a>
                  ))}
                  {canConfirm && row.canApprove && (
                    <button
                      type="button"
                      className={cn(BTN_OUTLINE, "border-success/50 text-success hover:bg-success/10")}
                      disabled={reviewPending}
                      onClick={() => onConfirm(p)}
                      data-action="confirm-payment"
                    >
                      <CircleCheck {...ICON} />
                      {t("Тасдиқлаш", "Confirm")}
                    </button>
                  )}
                  {canConfirm && row.canReject && (
                    <button
                      type="button"
                      className={cn(BTN_OUTLINE, "border-destructive/45 text-destructive hover:bg-destructive/10")}
                      disabled={reviewPending}
                      onClick={() => onReject(p)}
                      data-action="reject-payment"
                    >
                      <Ban {...ICON} />
                      {t("Рад этиш", "Reject")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canAdd && formOpen && (
        <form id="payment-form" onSubmit={submit} className="mt-3 rounded-md border border-border bg-muted/40 p-4">
          <label htmlFor="pay-amount" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" {...ICON} />
            {t("Сумма, UZS", "Amount, UZS")}
          </label>
          <div className="flex gap-2">
            <Input
              id="pay-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t("масалан 1 000 000", "e.g. 1 000 000")}
              value={amountRaw}
              onChange={(e) => onAmountRaw(e.target.value)}
              onBlur={() => onAmountRaw(regroupMoney(amountRaw))}
              className={cn(NUM, "h-11 bg-background md:h-10", (unreadable || tooHigh || (pressed && amount === null)) && "border-destructive")}
            />
            <button type="button" className={cn(BTN_OUTLINE, "shrink-0")} onClick={() => onAmountRaw(n0(payable))}>
              {t("Тўлиқ", "Full")}
            </button>
          </div>
          {unreadable || (pressed && amount === null) ? (
            <ErrorText>{t("Сонни текширинг: масалан 1 000 000", "Check the number: e.g. 1 000 000")}</ErrorText>
          ) : tooHigh ? (
            <ErrorText>
              {t("Сумма қолдиқдан ошиб кетди: қолдиқ", "Amount exceeds the balance:")} <span className={NUM}>{n0(payable)}</span> UZS
            </ErrorText>
          ) : (
            <Help>
              {t("Қарздорлик", "Debt")}: <span className={NUM}>{n0(payable)}</span> UZS
              {unpaidOverload > 0 && (
                <>
                  {" "}— {t("шундан ортиқча юклама", "of which over-load")} <span className={NUM}>{n0(unpaidOverload)}</span>
                </>
              )}
            </Help>
          )}

          <div className="mb-1.5 mt-4 flex items-center gap-1 text-xs font-semibold">
            {t("Тўлов усули", "Payment method")} <span className="text-destructive">*</span>
          </div>
          <div role="radiogroup" aria-label={t("Тўлов усули", "Payment method")} className="flex flex-wrap gap-2">
            {METHODS.map(({ key, icon: MIcon }) => {
              const on = method === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(key)}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold transition-colors md:h-10",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-hover",
                  )}
                >
                  <MIcon className="h-4 w-4" {...ICON} />
                  {t(...PAYMENT_METHOD_LABELS[key])}
                  {on && <Check className="h-3.5 w-3.5" {...ICON} />}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[180px] [&_button]:min-h-[44px]">
              <div className="mb-1.5 text-xs font-semibold">
                {t("Чек расми", "Receipt photo")} <span className="font-medium text-muted-foreground">{t("ихтиёрий", "optional")}</span>
              </div>
              <ReceiptPicker urls={receipts} onChange={setReceipts} disabled={recordPending} uploadUrl="/api/gazoblok/upload-receipt" />
            </div>
            <div className="flex gap-2">
              <button type="button" className={BTN_OUTLINE} onClick={() => onFormOpen(false)} disabled={recordPending}>
                {t("Ёпиш", "Close")}
              </button>
              <button type="submit" className={BTN_PRIMARY} disabled={recordPending || unreadable} data-action="save-payment">
                {recordPending ? <Loader2 className="animate-spin" {...ICON} /> : <Plus {...ICON} />}
                {t("Тўлов қўшиш", "Add payment")}
              </button>
            </div>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
