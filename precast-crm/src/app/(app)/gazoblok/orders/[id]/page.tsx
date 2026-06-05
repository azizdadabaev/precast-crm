"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Factory,
  Loader2,
  Plus,
  Truck,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { useT } from "@/lib/i18n";

type Status = "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED";
type PaymentState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
type PaymentStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: Status;
  paymentState: PaymentState;
  confirmedPaid: string;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  linesSubtotal: string;
  discountAmount: string;
  deliveryCost: string;
  scheduledAt: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  client: { id: string; name: string; phone: string; address: string | null };
  lines: Array<{
    id: string;
    productLabel: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    product: { id: string; label: string } | null;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: PaymentMethod;
    status: PaymentStatus;
    recordedAt: string | null;
    confirmedAt: string | null;
    notes: string | null;
  }>;
  events: Array<{ id: string; type: string; message: string | null; createdAt: string }>;
}

const STATUS_META: Record<Status, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  PLACED:        { uz: "Қабул қилинган",   en: "Placed",        variant: "default" },
  IN_PRODUCTION: { uz: "Ишлаб чиқилмоқда", en: "In production", variant: "warning" },
  DELIVERED:     { uz: "Етказилган",       en: "Delivered",     variant: "success" },
  CANCELED:      { uz: "Бекор қилинган",   en: "Canceled",      variant: "danger" },
};

const PAYMENT_STATE_META: Record<PaymentState, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  AWAITING_PAYMENT: { uz: "Тўлов кутилмоқда", en: "Awaiting payment", variant: "warning" },
  PARTIALLY_PAID:   { uz: "Қисман тўланган",  en: "Partially paid",   variant: "default" },
  FULLY_PAID:       { uz: "Тўлиқ тўланган",   en: "Fully paid",       variant: "success" },
};

const PAYMENT_STATUS_META: Record<PaymentStatus, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  PENDING_CONFIRMATION: { uz: "Кутилмоқда",   en: "Pending",   variant: "warning" },
  CONFIRMED:            { uz: "Тасдиқланган", en: "Confirmed", variant: "success" },
  REJECTED:             { uz: "Рад этилган",  en: "Rejected",  variant: "danger" },
};

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CLICK", "PAYME", "OTHER"];

export default function GazoblokOrderDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["gazoblok-order", id],
    queryFn: () => api(`/api/gazoblok/orders/${id}`),
  });

  // Only users with the maker-checker payment.confirm permission may
  // confirm/reject payments — everything else here stays open to anyone.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canConfirm = me?.permissions?.includes("payment.confirm") ?? false;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["gazoblok-order", id] });
  }

  const setStatus = useMutation({
    mutationFn: (vars: { status: Status; reason?: string }) =>
      api(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: { action: "set_status", status: vars.status, reason: vars.reason },
      }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: (vars: { amount: number; method: PaymentMethod }) =>
      api(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: { action: "record_payment", amount: vars.amount, method: vars.method },
      }),
    onSuccess: () => {
      setPayAmount("");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const confirmPayment = useMutation({
    mutationFn: (vars: { paymentId: string; approve: boolean; rejectionReason?: string }) =>
      api(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: {
          action: "confirm_payment",
          paymentId: vars.paymentId,
          approve: vars.approve,
          rejectionReason: vars.rejectionReason,
        },
      }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  function advance(status: Status, opts?: { confirm?: string; reason?: boolean }) {
    setError(null);
    if (opts?.confirm && !window.confirm(opts.confirm)) return;
    if (opts?.reason) {
      const reason = window.prompt(t("Бекор қилиш сабаби (ихтиёрий)", "Cancellation reason (optional)")) ?? undefined;
      setStatus.mutate({ status, reason: reason || undefined });
      return;
    }
    setStatus.mutate({ status });
  }

  function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("Тўғри сумма киритинг", "Enter a valid amount"));
      return;
    }
    recordPayment.mutate({ amount, method: payMethod });
  }

  if (isLoading || !order) {
    return <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;
  }

  const status = STATUS_META[order.status];
  const payState = PAYMENT_STATE_META[order.paymentState];
  const totalNum = Number(order.totalPrice);
  const paidNum = Number(order.confirmedPaid);
  const remainingNum = Math.max(0, totalNum - paidNum);

  const isCanceled = order.status === "CANCELED";
  const isDelivered = order.status === "DELIVERED";
  const canStartProduction = order.status === "PLACED";
  const canDeliver = order.status === "PLACED" || order.status === "IN_PRODUCTION";
  const canRecordPayment = !isCanceled && remainingNum > 0;

  return (
    <div className="space-y-5">
      <Link
        href="/gazoblok/orders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("Буюртмаларга қайтиш", "Back to orders")}
      </Link>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Header card */}
      <div className="rounded-lg border bg-background p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Газоблок буюртмаси<span className="lang-en"> · Gazoblok order</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <h1 className="text-3xl font-black tabular-nums tracking-tight">{order.orderNumber}</h1>
              <Chip variant={status.variant}>{t(status.uz, status.en)}</Chip>
              <Chip variant={payState.variant}>{t(payState.uz, payState.en)}</Chip>
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {t("Мижоз:", "Client:")}{" "}
              <Link href={`/clients/${order.client.id}`} className="text-foreground font-medium hover:underline">
                {order.client.name}
              </Link>
              {" · "}
              <span className="tabular-nums">{formatPhone(order.client.phone)}</span>
              {order.client.address && <> · {order.client.address}</>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {order.scheduledAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("Жадвал:", "Scheduled:")} <span className="tabular-nums font-medium text-foreground">{formatDate(order.scheduledAt)}</span>
                </span>
              )}
              {order.placedAt && (
                <span className="tabular-nums">{t("Қабул қилинган", "Placed")} {formatDate(order.placedAt)}</span>
              )}
              {order.deliveredAt && (
                <span className="tabular-nums">{t("Етказилган", "Delivered")} {formatDate(order.deliveredAt)}</span>
              )}
            </div>
          </div>
          <div className="text-right min-w-[14rem]">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Жами<span className="lang-en"> · Total</span>
            </div>
            <div className="text-3xl font-black tabular-nums text-success font-mono">
              {formatNumber(totalNum, 0)}
              <span className="text-xs text-muted-foreground font-normal ml-1">UZS</span>
            </div>
          </div>
        </div>

        {isCanceled && order.cancelReason && (
          <div className="mt-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {t("Бекор қилиш сабаби:", "Cancellation reason:")} {order.cancelReason}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Маҳсулотлар<span className="lang-en"> · Lines</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2.5">{t("Маҳсулот", "Product")}</th>
                <th className="text-right px-3 py-2.5">{t("Нарх", "Unit price")}</th>
                <th className="text-right px-3 py-2.5">{t("Сони", "Qty")}</th>
                <th className="text-right px-3 py-2.5">{t("Сумма", "Line total")}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l, i) => (
                <tr
                  key={l.id}
                  className={
                    "border-b last:border-b-0 border-border/60 " + (i % 2 === 1 ? "bg-muted/30" : "")
                  }
                >
                  <td className="px-3 py-2.5 font-medium">{l.productLabel}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatNumber(Number(l.unitPrice), 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatNumber(l.quantity, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatNumber(Number(l.lineTotal), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t-2 border-border-strong bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
          <Row label={t("Оралиқ сумма", "Subtotal")} value={formatNumber(Number(order.linesSubtotal), 0)} />
          {Number(order.discountAmount) > 0 && (
            <Row label={t("Чегирма", "Discount")} value={`− ${formatNumber(Number(order.discountAmount), 0)}`} />
          )}
          {Number(order.deliveryCost) > 0 && (
            <Row label={t("Етказиб бериш", "Delivery")} value={formatNumber(Number(order.deliveryCost), 0)} />
          )}
          <Row
            label={t("ЖАМИ", "TOTAL")}
            value={`${formatNumber(totalNum, 0)} UZS`}
            strong
          />
          <Row
            label={t("Тўланган", "Paid")}
            value={formatNumber(paidNum, 0)}
            valueClassName={paidNum > 0 ? "text-success" : "text-muted-foreground"}
          />
          <Row
            label={t("Қолди", "Remaining")}
            value={remainingNum === 0 && paidNum > 0 ? t("Тўланган", "Paid") : formatNumber(remainingNum, 0)}
            valueClassName={remainingNum > 0 ? "text-warning" : "text-success"}
          />
          <div className="flex items-center justify-between pt-1.5 text-xs text-muted-foreground border-t border-border/60 mt-1.5">
            <span>{t("Блоклар", "Blocks")}: <span className="font-mono font-semibold text-foreground">{formatNumber(order.totalBlocks, 0)}</span></span>
            <span>{t("Ҳажм", "Volume")}: <span className="font-mono font-semibold text-foreground">{formatNumber(Number(order.totalVolumeM3), 2)} m³</span></span>
          </div>
        </div>
      </div>

      {/* Status actions */}
      {!isCanceled && (canStartProduction || canDeliver) && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Ҳолат<span className="lang-en"> · Status actions</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStartProduction && (
              <Button
                variant="outline"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => advance("IN_PRODUCTION")}
              >
                <Factory className="h-3.5 w-3.5 mr-1.5" />
                Ишлаб чиқаришга<span className="lang-en font-normal"> · Start production</span>
              </Button>
            )}
            {canDeliver && (
              <Button
                size="sm"
                className="bg-success hover:bg-success/90 text-success-foreground"
                disabled={setStatus.isPending}
                onClick={() =>
                  advance("DELIVERED", {
                    confirm: t("Етказилди деб белгилансинми? Захира камаяди.", "Mark as delivered? Stock will be decremented."),
                  })
                }
              >
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Етказилди<span className="lang-en font-normal"> · Mark delivered</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
              disabled={setStatus.isPending}
              onClick={() => advance("CANCELED", { reason: true })}
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Бекор қилиш<span className="lang-en font-normal"> · Cancel</span>
            </Button>
          </div>
        </div>
      )}
      {/* Delivered orders can still be canceled (restocks server-side) */}
      {isDelivered && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
            disabled={setStatus.isPending}
            onClick={() => advance("CANCELED", { reason: true })}
          >
            <Ban className="h-3.5 w-3.5 mr-1.5" />
            Бекор қилиш<span className="lang-en font-normal"> · Cancel</span>
          </Button>
        </div>
      )}

      {/* Payments */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Тўловлар<span className="lang-en"> · Payments</span>
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {t("Тасдиқланган:", "Confirmed:")} {formatNumber(paidNum, 0)} / {formatNumber(totalNum, 0)}
          </div>
        </div>

        {order.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Усул", "Method")}</th>
                  <th className="text-right px-3 py-2">{t("Сумма", "Amount")}</th>
                  <th className="text-left px-3 py-2">{t("Ҳолат", "Status")}</th>
                  <th className="text-left px-3 py-2">{t("Қайд этилди", "Recorded")}</th>
                  <th className="px-3 py-2 w-44"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.payments.map((p) => {
                  const ps = PAYMENT_STATUS_META[p.status];
                  return (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs uppercase tracking-wider">{p.method}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatNumber(Number(p.amount), 0)}</td>
                      <td className="px-3 py-2">
                        <Chip variant={ps.variant}>{t(ps.uz, ps.en)}</Chip>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {p.recordedAt ? formatDate(p.recordedAt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.status === "PENDING_CONFIRMATION" && canConfirm && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-success/40 text-success hover:bg-success hover:text-white"
                              disabled={confirmPayment.isPending}
                              onClick={() => confirmPayment.mutate({ paymentId: p.id, approve: true })}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              {t("Тасдиқлаш", "Confirm")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                              disabled={confirmPayment.isPending}
                              onClick={() => {
                                const reason = window.prompt(t("Рад этиш сабаби (ихтиёрий)", "Rejection reason (optional)")) ?? undefined;
                                confirmPayment.mutate({ paymentId: p.id, approve: false, rejectionReason: reason || undefined });
                              }}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              {t("Рад этиш", "Reject")}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t("Тўлов йўқ.", "No payments yet.")}</div>
        )}

        {/* Record payment form */}
        {canRecordPayment && (
          <form onSubmit={submitPayment} className="border-t bg-muted/20 px-4 py-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Сумма", "Amount")}
              </label>
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="numeric"
                placeholder={t("масалан 1000000", "e.g. 1000000")}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Усул", "Method")}
              </label>
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={recordPayment.isPending}>
              {recordPayment.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Тўлов қўшиш<span className="lang-en font-normal"> · Record payment</span>
            </Button>
          </form>
        )}
      </div>

      {/* Activity */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t("Фаолият журнали", "Activity log")}
          <span className="ml-2 font-normal tabular-nums">({order.events.length})</span>
        </div>
        {order.events.length > 0 ? (
          <ul className="divide-y">
            {order.events.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-sm flex items-baseline justify-between gap-4">
                <div>
                  <span className="font-medium">{e.type.replace(/_/g, " ").toLowerCase()}</span>
                  {e.message && <span className="text-muted-foreground"> — {e.message}</span>}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatDate(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t("Ёзув йўқ.", "No activity yet.")}</div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "text-[11px] font-bold uppercase tracking-wider text-muted-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={`font-mono tabular-nums ${strong ? "font-extrabold text-base text-success" : "font-semibold"} ${valueClassName ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
