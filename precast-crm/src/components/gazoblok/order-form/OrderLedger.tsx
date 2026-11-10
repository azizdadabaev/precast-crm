"use client";

import { ArrowRight, Check, Circle, CircleAlert, CircleCheck, CircleDot, Clock, Loader2 } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { FormLine, Problem, PreviewState } from "@/lib/gazoblok-order-form";
import { NUM, STATE_PILL } from "./ui";

const ICON = { strokeWidth: 1.75 };
const STATE_ICON: Record<PreviewState, typeof Circle> = {
  AWAITING_PAYMENT: Circle,
  PARTIALLY_PAID: CircleDot,
  FULLY_PAID: CircleCheck,
  OVERPAID: CircleAlert,
};

export type LedgerTotals = {
  linesSubtotal: number;
  discountAmount: number;
  discountPercent: number;
  deliveryCost: number;
  total: number;
  totalBlocks: number;
  volumeM3: number;
};

export function StatePill({ state }: { state: PreviewState }) {
  const t = useT();
  const s = STATE_PILL[state];
  const Icon = STATE_ICON[state];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold", s.cls)}>
      <Icon className="h-3.5 w-3.5" {...ICON} />
      {t(s.uz, s.en)}
    </span>
  );
}

export function OrderLedger({
  clientLine,
  lines,
  totals,
  discountBad,
  paid,
  methodLabel,
  state,
  pendingPayment,
  debt,
  problems,
  pressed,
  pending,
  onPlace,
  onJump,
  className,
}: {
  clientLine: string | null;
  lines: FormLine[];
  totals: LedgerTotals;
  discountBad: boolean;
  paid: number;
  methodLabel: string | null;
  state: PreviewState;
  /** The advance will wait for a confirmer (placer lacks payment.confirm). */
  pendingPayment: boolean;
  debt: number;
  problems: Problem[];
  pressed: boolean;
  pending: boolean;
  onPlace: () => void;
  onJump: (p: Problem) => void;
  className?: string;
}) {
  const t = useT();
  const missing = problems.filter((p) => p.kind === "missing");
  const errors = problems.filter((p) => p.kind === "error");
  const ready = problems.length === 0;
  const row = (label: React.ReactNode, value: string, cls = "") => (
    <div className={cn("flex items-baseline justify-between gap-3", cls)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={NUM}>{value}</span>
    </div>
  );

  return (
    <aside
      id="order-ledger"
      aria-label={t("Буюртма", "Order")}
      className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]", className)}
    >
      <div className="border-b border-border px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">{t("Буюртма", "Order")}</h2>
          <StatePill state={state} />
        </div>
        <div className={cn("mt-1 break-words text-[13px]", !clientLine && "text-muted-foreground")}>
          {clientLine ?? t("Мижоз киритилмаган", "No client yet")}
        </div>
      </div>

      <div className="space-y-2 px-5 py-4 text-[13px]">
        {lines.length ? (
          lines.map((l) => (
            <div key={l.productId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className={cn(NUM, "font-semibold")}>{l.productLabel}</span>
                <span className={cn(NUM, "text-muted-foreground")}>
                  {" "}
                  {formatNumber(l.quantity, 0)} × {formatNumber(l.unitPrice, 0)}
                </span>
              </span>
              <span className={NUM}>{formatNumber(l.quantity * l.unitPrice, 0)}</span>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">
            {t("Ҳали блок йўқ. Ўлчам ёнидаги", "No blocks yet. Press")} <b className="text-foreground">+</b>{" "}
            {t("ни босинг ёки сонини ёзинг.", "next to a size or type its quantity.")}
          </div>
        )}
        <div className="mt-1 space-y-2 border-t border-dashed border-border pt-2">
          {row(t("Блоклар суммаси", "Blocks subtotal"), formatNumber(totals.linesSubtotal, 0))}
          {discountBad ? (
            <div className="flex justify-between text-destructive">
              <span>{t("Чегирма", "Discount")}</span>
              <span>{t("ўқилмади", "unreadable")}</span>
            </div>
          ) : (
            totals.discountAmount > 0 &&
            row(
              <>
                {t("Чегирма", "Discount")} <span className={NUM}>{formatNumber(totals.discountPercent, 2)}</span> %
              </>,
              "−" + formatNumber(totals.discountAmount, 0),
            )
          )}
          {row(t("Етказиш", "Delivery"), formatNumber(totals.deliveryCost, 0))}
        </div>
      </div>

      <div className="border-y border-border bg-muted/50 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-semibold">{t("Жами", "Total")}</span>
          <span className={cn(NUM, "text-[30px] font-bold leading-none tracking-tight")} data-testid="ledger-total">
            {formatNumber(totals.total, 0)}
            <span className="ml-1.5 font-sans text-[13px] font-medium text-muted-foreground">UZS</span>
          </span>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className={cn(NUM, "font-semibold text-foreground")}>{formatNumber(totals.totalBlocks, 0)}</span> {t("та блок", "blocks")}
          </span>
          <span>
            <span className={cn(NUM, "font-semibold text-foreground")}>{formatNumber(totals.volumeM3, 3)}</span> {t("м³", "m³")}
          </span>
        </div>
      </div>

      {paid > 0 && (
        <div className="space-y-2 border-b border-border px-5 py-3 text-[13px]">
          {row(
            <>
              {t("Олдиндан тўлов", "Advance")}
              {methodLabel ? ` · ${methodLabel}` : ""}
            </>,
            formatNumber(paid, 0),
            paid > totals.total ? "text-destructive" : "",
          )}
          {pendingPayment && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" {...ICON} />
              {t("Тасдиқловчи тасдиқлагач ҳисобланади", "Counts once a confirmer confirms it")}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("Қарздорлик", "Debt")}</span>
            <span className={cn(NUM, "font-bold", debt > 0 ? "text-destructive" : "text-success")}>{formatNumber(debt, 0)}</span>
          </div>
        </div>
      )}

      <div className="space-y-3 p-5">
        {pressed && errors.length > 0 && (
          <div role="alert" className="rounded-md border border-destructive/35 bg-destructive/[.07] px-3 py-2.5 text-[13px]">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <CircleAlert className="h-4 w-4" {...ICON} />
              {t(`${errors.length} та хатони тузатинг`, `Fix ${errors.length} error(s)`)}
            </div>
            <ul className="mt-1.5 space-y-1 text-destructive">
              {errors.map((e) => (
                <li key={e.key}>
                  <button type="button" onClick={() => onJump(e)} className="flex min-h-[32px] items-center gap-2 text-left">
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" {...ICON} />
                    <span className="underline underline-offset-2">{t(e.uz, e.en)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && (
          <div className="text-[13px]">
            <div className="mb-1.5 text-muted-foreground">{t("Буюртма бериш учун қолди:", "Still needed to place:")}</div>
            <ul className="space-y-1">
              {missing.map((m) => (
                <li key={m.key}>
                  <button type="button" onClick={() => onJump(m)} className="flex min-h-[28px] items-center gap-2 text-left hover:text-primary">
                    <Circle className="h-3.5 w-3.5 shrink-0 text-text-tertiary" {...ICON} />
                    {t(m.uz, m.en)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={onPlace}
          disabled={pending}
          aria-keyshortcuts="Control+Enter"
          className={cn(
            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !ready && "opacity-60",
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" {...ICON} /> : <Check className="h-4 w-4" {...ICON} />}
          {t("Буюртма бериш", "Place order")}
          <span className={cn(NUM, "ml-1 hidden rounded border border-primary-foreground/35 px-1.5 py-px text-[11px] lg:inline")}>{"Ctrl+Enter"}</span>
        </button>
      </div>
    </aside>
  );
}

/** Phone and narrow screens: total + blocks + place, always in reach. Tap the total to see the ledger. */
export function MobilePlaceBar({
  total,
  blocks,
  ready,
  pending,
  onPlace,
}: {
  total: number;
  blocks: number;
  ready: boolean;
  pending: boolean;
  onPlace: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_hsl(var(--foreground)/0.18)] xl:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => document.getElementById("order-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="min-h-[44px] min-w-0 text-left"
        >
          <div className="text-[11px] text-muted-foreground">
            {t("Жами", "Total")} · <span className={NUM}>{formatNumber(blocks, 0)}</span> {t("та", "pcs")}
          </div>
          <div className={cn(NUM, "text-[20px] font-bold leading-tight")}>
            {formatNumber(total, 0)} <span className="font-sans text-xs font-medium text-muted-foreground">UZS</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onPlace}
          disabled={pending}
          className={cn(
            "ml-auto inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-[15px] font-semibold text-primary-foreground",
            !ready && "opacity-60",
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" {...ICON} /> : <Check className="h-4 w-4" {...ICON} />}
          {t("Буюртма бериш", "Place order")}
        </button>
      </div>
    </div>
  );
}
