"use client";

import { Banknote, Check, CircleEllipsis, Info, Landmark, Percent, Smartphone, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReceiptPicker } from "@/components/payments/ReceiptPicker";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import type { DiscountMode } from "@/lib/gazoblok-order-form";
import { BadNumber, ErrorText, FIELD, FIELD_ERR, FieldLabel, Help, NUM, SectionCard } from "./ui";
import type { PaymentMethod } from "./types";

const ICON = { strokeWidth: 1.75 };

/** Exactly the five methods the API accepts, no default. */
export const METHODS: { key: PaymentMethod; icon: typeof Banknote }[] = [
  { key: "CASH", icon: Banknote },
  { key: "BANK_TRANSFER", icon: Landmark },
  { key: "CLICK", icon: Smartphone },
  { key: "PAYME", icon: Wallet },
  { key: "OTHER", icon: CircleEllipsis },
];

export function PaymentSection({
  discountMode,
  onDiscountMode,
  discountRaw,
  onDiscountRaw,
  discountBad,
  discountApplied,
  previousDiscountPercent,
  paidRaw,
  onPaidRaw,
  paidBad,
  paid,
  total,
  onPayFull,
  method,
  onMethod,
  receiptUrls,
  onReceiptUrls,
  canRecord,
  canConfirm,
  busy,
  showErrors,
}: {
  discountMode: DiscountMode;
  onDiscountMode: (m: DiscountMode) => void;
  discountRaw: string;
  onDiscountRaw: (v: string) => void;
  discountBad: boolean;
  /** What the discount comes to, for the «= −1 455 600 UZS» / «= 5 %» line. */
  discountApplied: { amount: number; percent: number };
  previousDiscountPercent: number | null;
  paidRaw: string;
  onPaidRaw: (v: string) => void;
  paidBad: boolean;
  paid: number;
  total: number;
  onPayFull: () => void;
  method: PaymentMethod | "";
  onMethod: (m: PaymentMethod) => void;
  receiptUrls: string[];
  onReceiptUrls: (urls: string[]) => void;
  canRecord: boolean;
  canConfirm: boolean;
  busy: boolean;
  showErrors: boolean;
}) {
  const t = useT();
  const paidPositive = paid > 0;
  const overTotal = paidPositive && paid > total;
  const methodMissing = paidPositive && method === "";

  return (
    <SectionCard id="sec-payment" icon={<Wallet className="h-4 w-4" {...ICON} />} title={t("Чегирма ва тўлов", "Discount and payment")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="f-discount" icon={<Percent {...ICON} />} note={t("ихтиёрий", "optional")}>
            {t("Чегирма", "Discount")}
          </FieldLabel>
          <div className="flex gap-2">
            <div role="radiogroup" aria-label={t("Чегирма тури", "Discount type")} className="inline-flex shrink-0 gap-0.5 rounded-md bg-muted p-[3px]">
              {(["percent", "amount"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={discountMode === m}
                  onClick={() => onDiscountMode(m)}
                  className={cn(
                    "min-w-[44px] whitespace-nowrap rounded px-2.5 text-[13px] font-bold",
                    discountMode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "percent" ? "%" : "UZS"}
                </button>
              ))}
            </div>
            <Input
              id="f-discount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={discountRaw}
              onChange={(e) => onDiscountRaw(e.target.value)}
              className={cn(FIELD, NUM, discountBad && FIELD_ERR)}
            />
          </div>
          {discountBad ? (
            discountMode === "percent" && /^\s*\d+([.,]\d+)?\s*$/.test(discountRaw) ? (
              <ErrorText>{t("Фоиз 0 дан 100 гача бўлади", "A percent is 0 to 100")}</ErrorText>
            ) : (
              <BadNumber show />
            )
          ) : discountApplied.amount > 0 ? (
            <Help>
              ={" "}
              {discountMode === "percent" ? (
                <>
                  <span className={cn(NUM, "text-foreground")}>−{formatNumber(discountApplied.amount, 0)}</span> UZS
                </>
              ) : (
                <>
                  <span className={cn(NUM, "text-foreground")}>{formatNumber(discountApplied.percent, 2)}</span> %
                </>
              )}
            </Help>
          ) : previousDiscountPercent !== null && previousDiscountPercent > 0 ? (
            <Help>
              {t("олдин", "last time")}: <span className={NUM}>{formatNumber(previousDiscountPercent, 2)}</span> %
            </Help>
          ) : (
            <Help>{t("Фоиз ёки сумма — биттаси", "Percent or amount — one of them")}</Help>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="f-paid" icon={<Banknote {...ICON} />} note={t("ихтиёрий", "optional")}>
            {t("Олдиндан тўлов, UZS", "Advance, UZS")}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="f-paid"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={paidRaw}
              onChange={(e) => onPaidRaw(e.target.value)}
              className={cn(FIELD, NUM, (paidBad || overTotal) && FIELD_ERR)}
            />
            <Button type="button" variant="outline" className="h-11 shrink-0 md:h-10" onClick={onPayFull} disabled={total <= 0}>
              {t("Тўлиқ", "Full")}
            </Button>
          </div>
          {paidBad ? (
            <BadNumber show />
          ) : overTotal ? (
            <ErrorText>
              {t("Тўлов жамидан кўп бўлолмайди: жами", "Payment can't exceed the total:")} <span className={NUM}>{formatNumber(total, 0)}</span> UZS
            </ErrorText>
          ) : (
            <Help>{t("«Тўлиқ» — жами суммани ёзади", "«Full» types the whole total")}</Help>
          )}
        </div>
      </div>

      <div id="f-method" className={cn("mt-4 scroll-mt-24", !paidPositive && "opacity-60")}>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          {t("Тўлов усули", "Payment method")}
          {paidPositive ? <span className="text-destructive">*</span> : <span className="font-medium text-muted-foreground">{t("тўлов киритилганда", "when an advance is typed")}</span>}
        </div>
        <div
          role="radiogroup"
          aria-label={t("Тўлов усули", "Payment method")}
          className={cn("flex flex-wrap gap-2", showErrors && methodMissing && "-m-1.5 rounded-md p-1.5 ring-2 ring-destructive/40")}
        >
          {METHODS.map(({ key, icon: Icon }) => {
            const on = method === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onMethod(key)}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold transition-colors md:h-10",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-hover",
                )}
              >
                <Icon className="h-4 w-4" {...ICON} />
                {t(...PAYMENT_METHOD_LABELS[key])}
                {on && <Check className="h-3.5 w-3.5" {...ICON} />}
              </button>
            );
          })}
        </div>
        {showErrors && methodMissing && <ErrorText>{t("Тўлов усулини танланг", "Choose the payment method")}</ErrorText>}
      </div>

      {paidPositive && (
        <div className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-[auto_1fr]">
          {canRecord ? (
            <div className="min-w-[180px] [&_button]:min-h-[44px]">
              <div className="mb-1.5 text-xs font-semibold">
                {t("Чек сурати", "Receipt photo")} <span className="font-medium text-muted-foreground">{t("ихтиёрий", "optional")}</span>
              </div>
              <ReceiptPicker urls={receiptUrls} onChange={onReceiptUrls} disabled={busy} uploadUrl="/api/gazoblok/upload-receipt" />
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground md:pt-6">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" {...ICON} />
            <span>
              {canConfirm ? (
                <>
                  {t("Тўлов дарҳол", "The payment lands")} <b className="text-foreground">{t("«Тасдиқланди»", "«Confirmed»")}</b>{" "}
                  {t("бўлиб тушади — сизда тасдиқлаш ҳуқуқи бор.", "at once — you can confirm payments.")}
                </>
              ) : (
                <>
                  {t("Тўлов", "The payment lands")} <b className="text-foreground">{t("«Тасдиқланмаган»", "«Unconfirmed»")}</b>{" "}
                  {t("бўлиб тушади; тасдиқловчиларга хабар кетади.", "; the confirmers are notified.")}
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
