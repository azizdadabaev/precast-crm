"use client";

import {
  Ban,
  Calculator,
  Check,
  CircleCheck,
  Factory,
  Loader2,
  PackageCheck,
  RotateCcw,
  Scissors,
  Truck,
  TriangleAlert,
  Undo2,
  Wallet,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM } from "@/components/gazoblok/order-form/ui";
import type { nextAction, Pill as PillT, PrimaryKind } from "@/lib/gazoblok-detail";
import { BTN_PRIMARY, ICON, Pill } from "./ui";

const n0 = (v: number) => formatNumber(v, 0);
type Next = ReturnType<typeof nextAction>;

const PRIMARY_ICON: Record<PrimaryKind, LucideIcon> = {
  refund: Undo2,
  load: Truck,
  deliverTruck: PackageCheck,
  pay: Wallet,
  confirmPayment: Check,
  markDelivered: CircleCheck,
  reorder: RotateCcw,
};

/** «Жўнатма юклаш · 1 100 та қолди» → main words + the figure part, set smaller. */
export function splitLabel(label: string): [string, string | null] {
  const i = label.indexOf(" · ");
  return i === -1 ? [label, null] : [label.slice(0, i), label.slice(i + 3)];
}

export function PrimaryButton({ primary, pending, onClick, className }: { primary: Next["primary"]; pending: boolean; onClick: () => void; className?: string }) {
  if (!primary) return null;
  const Icon = PRIMARY_ICON[primary.kind];
  const [main, detail] = splitLabel(primary.label);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-action={`primary-${primary.kind}`}
      className={cn(BTN_PRIMARY, "h-12 w-full text-[15px] md:min-h-[48px]", className)}
    >
      {pending ? <Loader2 className="animate-spin" {...ICON} /> : <Icon {...ICON} />}
      <span>{main}</span>
      {detail && <span className={cn(NUM, "text-[13px] font-medium opacity-85")}>· {detail}</span>}
    </button>
  );
}

export function Ledger({
  status,
  shortClosed,
  lines,
  linesSubtotal,
  discountAmount,
  discountPercent,
  deliveryCost,
  overshipAmount,
  overBlocks,
  total,
  totalBefore,
  paid,
  refundDue,
  unpaidOverload,
  sellerName,
  payPill,
  next,
  primaryPending,
  onPrimary,
  onProduction,
  onMarkDelivered,
  onCloseShort,
  onCancel,
  className,
}: {
  status: string;
  shortClosed: boolean;
  lines: { id: string; label: string; quantity: number; unitPrice: number; lineTotal: number }[];
  linesSubtotal: number;
  discountAmount: number;
  discountPercent: number;
  deliveryCost: number;
  overshipAmount: number;
  overBlocks: number;
  total: number;
  /** Total before a close-short, for «аввал … — юкланганича ёпилди». */
  totalBefore: number | null;
  paid: number;
  refundDue: number;
  unpaidOverload: number;
  sellerName: string | null;
  payPill: PillT | null;
  next: Next;
  primaryPending: boolean;
  onPrimary: () => void;
  onProduction: () => void;
  onMarkDelivered: () => void;
  onCloseShort: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const t = useT();
  const canceled = status === "CANCELED";
  const debt = Math.max(0, total - paid);
  const { primary, blockers, secondary } = next;
  const finished = status === "DELIVERED" && refundDue < 0.01 && debt < 0.005;
  const row = (label: React.ReactNode, value: string, cls = "") => (
    <div className={cn("flex items-baseline justify-between gap-3", cls)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={NUM}>{value}</span>
    </div>
  );

  return (
    <aside
      id="order-ledger"
      aria-label={t("Ҳисоб", "Account")}
      className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]", className)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <Calculator className="h-4 w-4 text-muted-foreground" {...ICON} />
          {t("Ҳисоб", "Account")}
        </h2>
        {payPill && (
          <Pill tone={payPill.tone} icon={payPill.tone === "warning" ? <Undo2 {...ICON} /> : <CircleCheck {...ICON} />}>
            {payPill.text}
          </Pill>
        )}
      </div>

      <div className="space-y-2 px-5 py-4 text-[13px]">
        {lines.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className={cn(NUM, "font-semibold")}>{l.label}</span>
              <span className={cn(NUM, "text-muted-foreground")}>
                {" "}
                {n0(l.quantity)} × {n0(l.unitPrice)}
              </span>
            </span>
            <span className={NUM}>{n0(l.lineTotal)}</span>
          </div>
        ))}
        <div className="mt-1 space-y-2 border-t border-dashed border-border pt-2">
          {row(t("Блоклар суммаси", "Blocks subtotal"), n0(linesSubtotal))}
          {discountAmount > 0 &&
            row(
              <>
                {t("Чегирма", "Discount")} <span className={NUM}>{formatNumber(discountPercent, 2)}</span> %
              </>,
              `−${n0(discountAmount)}`,
            )}
          {row(t("Етказиш", "Delivery"), n0(deliveryCost))}
          {overshipAmount > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-destructive">
              <span>
                {t("Ортиқча юклама", "Over-load")} +<span className={NUM}>{n0(overBlocks)}</span> {t("та", "pcs")}
              </span>
              <span className={NUM}>+{n0(overshipAmount)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-y border-border bg-muted/50 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-semibold">{t("Жами", "Total")}</span>
          <span
            className={cn(NUM, "text-[30px] font-bold leading-none tracking-tight", canceled && "text-muted-foreground line-through")}
            data-testid="ledger-total"
          >
            {n0(total)}
            <span className="ml-1.5 font-sans text-[13px] font-medium text-muted-foreground">UZS</span>
          </span>
        </div>
        {shortClosed && totalBefore !== null && totalBefore !== total && (
          <div className="mt-1.5 text-right text-xs text-muted-foreground">
            {t("аввал", "was")} <span className={cn(NUM, "line-through")}>{n0(totalBefore)}</span> — {t("юкланганича ёпилди", "closed as loaded")}
          </div>
        )}
      </div>

      <div className="space-y-2 border-b border-border px-5 py-3 text-[13px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{t("Тўланган", "Paid")}</span>
          <span className={cn(NUM, "font-semibold", paid > 0 ? "text-success" : "text-muted-foreground")}>{n0(paid)}</span>
        </div>
        {refundDue >= 0.01 ? (
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("Ортиқча тўланган", "Overpaid")}</span>
            <span className={cn(NUM, "font-bold text-warning")}>{n0(refundDue)}</span>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("Қарздорлик", "Debt")}</span>
            <span className={cn(NUM, "font-bold", debt > 0.005 && !canceled ? "text-destructive" : "text-muted-foreground")} data-testid="ledger-debt">
              {n0(canceled ? 0 : debt)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        {overshipAmount > 0 && (
          <div className="rounded-md border border-destructive/35 bg-destructive/[.06] px-3 py-2.5 text-[13px]">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-destructive">
              <TriangleAlert className="h-4 w-4" {...ICON} />
              {t("Ортиқча юклама", "Over-load")}
            </div>
            {row(t("Блок", "Blocks"), `+${n0(overBlocks)} та`, "[&>span:last-child]:font-semibold [&>span:last-child]:text-foreground")}
            {row(t("Сумма", "Amount"), `+${n0(overshipAmount)}`, "[&>span:last-child]:font-semibold [&>span:last-child]:text-foreground")}
            {row(t("Тўланмаган", "Unpaid"), n0(unpaidOverload), unpaidOverload > 0 ? "[&>span:last-child]:font-bold [&>span:last-child]:text-destructive" : "[&>span:last-child]:text-success")}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{t("Сотувчи", "Seller")}</span>
              <span className="font-semibold">{sellerName ?? "—"}</span>
            </div>
          </div>
        )}
        {refundDue >= 0.01 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
              <Undo2 className="h-4 w-4" {...ICON} />
              {t("Мижозга қайтариш керак", "Refund owed to the client")}
            </div>
            <p className="text-muted-foreground">
              {t("Тўланган", "Paid")} <span className={cn(NUM, "text-foreground")}>{n0(paid)}</span> − {t("янги жами", "new total")}{" "}
              <span className={cn(NUM, "text-foreground")}>{n0(total)}</span> = <b className={cn(NUM, "text-foreground")}>{n0(refundDue)}</b> UZS.{" "}
              {t("Фақат тўловни тасдиқловчи қайтаради.", "Only a payment approver can refund.")}
            </p>
          </div>
        )}
        {canceled && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" {...ICON} />
            {t(
              "Буюртма бекор қилинган. Юклаш ва тўлов ёпиқ. Шу мижозга янги буюртма — юқоридаги «Қайта буюртма».",
              "The order is cancelled. Loading and payments are closed. For a new order use «Reorder» above.",
            )}
          </p>
        )}
        {finished && (
          <p className="flex items-center gap-2 text-[13px] font-medium text-success">
            <CircleCheck className="h-4 w-4" {...ICON} />
            {t("Етказилди ва тўлиқ тўланди", "Delivered and fully paid")}
          </p>
        )}
        {blockers.length > 0 && (
          <div className="text-[13px]" data-testid="blockers">
            <div className="mb-1.5 text-muted-foreground">{t("Буюртмани ёпиш учун қолди:", "Still needed to close the order:")}</div>
            <ul className="space-y-1">
              {blockers.map((b) => {
                const Icon = /юкланмаган/.test(b) ? Boxes : /жўнатма/.test(b) ? Truck : Wallet;
                return (
                  <li key={b} className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" {...ICON} />
                    <span>{b}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <PrimaryButton primary={primary} pending={primaryPending} onClick={onPrimary} />

        {(secondary.production || secondary.markDelivered !== "hidden" || secondary.closeShort || secondary.cancel !== "hidden") && (
          <div className="space-y-0.5 border-t border-border pt-2">
            {secondary.production && (
              <SecondaryRow icon={Factory} onClick={onProduction}>
                {t("Ишлаб чиқаришга", "Start production")}
              </SecondaryRow>
            )}
            {secondary.markDelivered !== "hidden" && (
              <SecondaryRow
                icon={CircleCheck}
                onClick={secondary.markDelivered === "ready" ? onMarkDelivered : undefined}
                hint={secondary.markDelivered === "later" ? t("кейин", "later") : undefined}
              >
                {t("Етказилди деб ёпиш", "Close as delivered")}
              </SecondaryRow>
            )}
            {secondary.closeShort && (
              <SecondaryRow icon={Scissors} onClick={onCloseShort}>
                {t("Юкланганича ёпиш", "Close as loaded")}
              </SecondaryRow>
            )}
            {secondary.cancel === "allowed" && (
              <SecondaryRow icon={Ban} onClick={onCancel} danger>
                {t("Буюртмани бекор қилиш", "Cancel the order")}
              </SecondaryRow>
            )}
            {secondary.cancel === "blocked" && (
              <p className="flex items-start gap-2 py-2 text-xs text-muted-foreground">
                <Ban className="mt-px h-3.5 w-3.5 shrink-0" {...ICON} />
                {t("Юкланган буюртмани бекор қилиб бўлмайди — юкланганича ёпинг.", "A loaded order can't be cancelled — close it as loaded.")}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function SecondaryRow({
  icon: Icon,
  children,
  onClick,
  hint,
  danger,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  hint?: string;
  danger?: boolean;
}) {
  const quiet = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={quiet}
      className={cn(
        "flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-1 text-left text-[13px] font-semibold",
        danger ? "text-destructive hover:bg-destructive/[.06]" : quiet ? "cursor-default text-muted-foreground" : "hover:bg-surface-hover",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" {...ICON} />
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs font-medium text-muted-foreground">{hint}</span>}
    </button>
  );
}

/** Phone: debt + the one primary action, always in reach. */
export function MobileActionBar({ debt, refund, primary, pending, onPrimary }: { debt: number; refund: number; primary: Next["primary"]; pending: boolean; onPrimary: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_hsl(var(--foreground)/0.18)] xl:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => document.getElementById("order-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="min-h-[44px] shrink-0 text-left"
        >
          <div className="text-[11px] text-muted-foreground">{refund >= 0.01 ? t("Қайтариш керак", "Refund owed") : t("Қарздорлик", "Debt")}</div>
          <div className={cn(NUM, "text-[18px] font-bold leading-tight", refund >= 0.01 ? "text-warning" : debt > 0.005 ? "text-destructive" : "text-success")}>
            {n0(refund >= 0.01 ? refund : debt)}
          </div>
        </button>
        {primary && (
          <PrimaryButton primary={{ ...primary, label: splitLabel(primary.label)[0] }} pending={pending} onClick={onPrimary} className="ml-auto h-12 min-w-0 flex-1" />
        )}
      </div>
    </div>
  );
}
