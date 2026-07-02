"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmPaymentDialog, type PaymentForConfirm } from "@/components/payments/ConfirmPaymentDialog";
import { formatDate, formatNumber } from "@/lib/utils";
import { PhoneLink } from "@/components/PhoneLink";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Me {
  permissions: string[];
}

// Status → Chip variant + leading glyph + row left-border color.
const STATUS_META: Record<
  PaymentForConfirm["status"],
  {
    label: string;
    variant: React.ComponentProps<typeof Chip>["variant"];
    leadingGlyph: string;
    rowBorder: string;
  }
> = {
  PENDING_CONFIRMATION: {
    label: "Pending",
    variant: "warning",
    leadingGlyph: "⏳",
    rowBorder: "border-l-warning",
  },
  CONFIRMED: {
    label: "Confirmed",
    variant: "success",
    leadingGlyph: "✓",
    rowBorder: "border-l-success",
  },
  REJECTED: {
    label: "Rejected",
    variant: "danger",
    leadingGlyph: "✕",
    rowBorder: "border-l-destructive",
  },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash · Нақд",
  BANK_TRANSFER: "Bank transfer",
  CLICK: "Click",
  PAYME: "Payme",
  OTHER: "Other",
};

function translatePaymentStatus(
  s: PaymentForConfirm["status"],
  t: (uz: string, en: string) => string,
): string {
  switch (s) {
    case "PENDING_CONFIRMATION": return t("Кутилмоқда", "Pending");
    case "CONFIRMED":            return t("Тасдиқланган", "Confirmed");
    case "REJECTED":             return t("Рад этилган", "Rejected");
  }
}

export default function PaymentsPage() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED">("PENDING_CONFIRMATION");
  const [confirmTarget, setConfirmTarget] = useState<PaymentForConfirm | null>(null);

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canConfirm = me?.permissions?.includes("payment.confirm") ?? false;

  const { data: payments = [], isLoading } = useQuery<PaymentForConfirm[]>({
    queryKey: ["payments", tab],
    queryFn: () => api(`/api/payments?status=${tab}`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Тўловлар
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Payments
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Тасдиқлаш навбати. Операторлар нақд пулни ёзади; АДМИН ёки ЭГА тасдиқлайди ёки рад этади.",
            "Maker-checker queue. Operators record cash; ADMIN or OWNER confirms or rejects.",
          )}
        </p>
      </div>

      {/* Underline-style tabs (etalon pattern — clearer hierarchy than pills) */}
      <div className="flex border-b border-border">
        {(
          [
            ["PENDING_CONFIRMATION", t("Кутилмоқда", "Pending")],
            ["CONFIRMED", t("Тасдиқланган", "Confirmed")],
            ["REJECTED", t("Рад этилган", "Rejected")],
          ] as const
        ).map(([v, label]) => {
          const active = tab === v;
          return (
            <button
              key={v}
              type="button"
              className={cn(
                "relative h-10 px-4 text-[12px] font-bold uppercase tracking-wider transition-colors",
                active
                  ? "text-primary"
                  : "text-text-tertiary hover:text-foreground",
              )}
              onClick={() => setTab(v)}
            >
              {label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {t("Тўлов йўқ.", "No payments.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">{t("Буюртма", "Order")}</th>
                  <th className="text-left px-3 py-2.5">{t("Мижоз", "Client")}</th>
                  <th className="text-left px-3 py-2.5">Манзил<span className="lang-en"> · Address</span></th>
                  <th className="text-right px-3 py-2.5">{t("Сумма", "Amount")}</th>
                  <th className="text-right px-3 py-2.5">{t("Кутилган", "Expected")}</th>
                  <th className="text-left px-3 py-2.5">{t("Усул", "Method")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳайдовчи", "Driver")}</th>
                  <th className="text-left px-3 py-2.5">{t("Қайд", "Recorded")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳолат", "Status")}</th>
                  <th className="px-3 py-2.5 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  // The dispatch's expectedCollection is the amount the
                  // DRIVER was asked to collect — only meaningful for
                  // driver-collected payments. Gate on collectedByDriver
                  // so in-office/bank rows don't show a misleading delta.
                  const fromDriver = !!p.collectedByDriver;
                  const expected =
                    fromDriver && p.order.dispatch?.expectedCollection
                      ? Number(p.order.dispatch.expectedCollection)
                      : null;
                  const recorded = Number(p.amount);
                  const shortfall = expected != null ? expected - recorded : 0;
                  const meta = STATUS_META[p.status];
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                        "border-l-[3px]",
                        meta.rowBorder,
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-primary text-xs">
                        <Link href={`/orders/${p.order.id}`} className="hover:underline">
                          {p.order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">
                          {(p as PaymentForConfirm & { order: { client?: { name?: string } } }).order.client?.name ?? "—"}
                        </div>
                        <div className="text-xs font-mono text-text-tertiary">
                          <PhoneLink phone={(p as PaymentForConfirm & { order: { client?: { phone?: string } } }).order.client?.phone} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-tertiary max-w-[14rem]">
                        {(() => {
                          const addr = (p as PaymentForConfirm & { order: { client?: { address?: string | null } } })
                            .order.client?.address;
                          return addr ? <span className="line-clamp-2">{addr}</span> : <span>—</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatNumber(p.amount, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                        {expected != null ? (
                          <>
                            {formatNumber(expected, 0)}
                            {shortfall > 0 && (
                              <div className="text-[10px] text-destructive font-bold">
                                {t("кам", "short")} {formatNumber(shortfall, 0)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {p.collectedByDriver?.name ?? <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                        {formatDate(p.recordedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip variant={meta.variant}>
                          <span>{meta.leadingGlyph}</span>
                          <span>{translatePaymentStatus(p.status, t)}</span>
                        </Chip>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p.status === "PENDING_CONFIRMATION" && canConfirm && (
                          <Button
                            size="sm"
                            className="bg-success hover:bg-success/90 text-success-foreground"
                            onClick={() => setConfirmTarget(p)}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1.5" />
                            {t("Кўриб чиқиш", "Review")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmPaymentDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        payment={confirmTarget}
        onConfirmed={() => qc.invalidateQueries({ queryKey: ["payments"] })}
      />
    </div>
  );
}
