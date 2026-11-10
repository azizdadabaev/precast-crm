"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PhoneLink } from "@/components/PhoneLink";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import { QUEUE_DEFAULT, queueStamp, type QueueStatus } from "@/lib/gazoblok-payments-queue";

interface QueueItem {
  id: string;
  amount: string | number;
  method: string;
  status: QueueStatus;
  recordedAt: string;
  confirmedAt: string | null;
  notes: string | null;
  recordedBy: { id: string; name: string } | null;
  confirmedBy: { id: string; name: string } | null;
  receipts: { id: string; imageUrl: string }[];
  order: {
    id: string;
    orderNumber: string;
    totalPrice: string | number;
    confirmedPaid: string | number;
    status: string;
    client: { id: string; name: string; phone: string };
  };
}

interface QueueResponse {
  items: QueueItem[];
  counts: { pending: number; confirmed: number; rejected: number };
}

const STATUS_CHIP: Record<QueueStatus, { variant: "warning" | "success" | "danger"; uz: string; en: string }> = {
  PENDING_CONFIRMATION: { variant: "warning", uz: "Тасдиқланмаган", en: "Unconfirmed" },
  CONFIRMED: { variant: "success", uz: "Тасдиқланган", en: "Confirmed" },
  REJECTED: { variant: "danger", uz: "Рад этилган", en: "Rejected" },
};

export function GazoblokPaymentsQueue({ canConfirm }: { canConfirm: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<QueueStatus>(QUEUE_DEFAULT);
  const [rejectTarget, setRejectTarget] = useState<QueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery<QueueResponse>({
    queryKey: ["gazoblok-payments", tab],
    queryFn: () => api(`/api/gazoblok/payments?status=${tab}`),
  });

  // Money moves only through the order's own confirm_payment action, which
  // locks the order row and recomputes confirmedPaid / paymentState.
  const decide = useMutation({
    mutationFn: (vars: { item: QueueItem; approve: boolean; rejectionReason?: string }) =>
      api(`/api/gazoblok/orders/${vars.item.order.id}`, {
        method: "PATCH",
        json: {
          action: "confirm_payment",
          paymentId: vars.item.id,
          approve: vars.approve,
          rejectionReason: vars.rejectionReason,
        },
      }),
    onSuccess: () => {
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["gazoblok-payments"] });
      qc.invalidateQueries({ queryKey: ["gazoblok-dashboard"] });
    },
    onError: (e: Error) => {
      setRejectTarget(null);
      setError(e.message);
    },
  });

  const counts = data?.counts;
  const items = data?.items ?? [];
  const tabs: [QueueStatus, string][] = [
    [
      "PENDING_CONFIRMATION",
      `${t("Тасдиқланмаган", "Unconfirmed")}${counts ? ` (${formatNumber(counts.pending, 0)})` : ""}`,
    ],
    ["CONFIRMED", t("Тасдиқланган", "Confirmed")],
    ["REJECTED", t("Рад этилган", "Rejected")],
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight">
        Газоблок тўловлари
        <span className="lang-en text-muted-foreground font-normal text-sm"> · Gazoblok payments</span>
      </h2>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setError(null);
              setTab(v);
            }}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
              tab === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : loadError ? (
          <div className="p-6 text-destructive">{(loadError as Error).message}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {tab === "PENDING_CONFIRMATION"
              ? t("Тасдиқланмаган газоблок тўлови йўқ", "No unconfirmed gazoblok payments")
              : t("Тўлов йўқ.", "No payments.")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p) => {
              const chip = STATUS_CHIP[p.status];
              const method = PAYMENT_METHOD_LABELS[p.method] ? t(...PAYMENT_METHOD_LABELS[p.method]) : p.method;
              return (
                <li key={p.id} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/gazoblok/orders/${p.order.id}`}
                          className="font-[var(--font-num)] tabular-nums text-sm font-bold text-primary hover:underline"
                        >
                          {p.order.orderNumber}
                        </Link>
                        <Chip variant={chip.variant}>{t(chip.uz, chip.en)}</Chip>
                        {p.order.status === "CANCELED" && <Chip variant="danger">{t("Буюртма бекор қилинган", "Order canceled")}</Chip>}
                      </div>
                      <div className="font-medium break-words">{p.order.client.name}</div>
                      <div className="text-xs font-[var(--font-num)] tabular-nums text-muted-foreground">
                        <PhoneLink phone={p.order.client.phone} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-[var(--font-num)] tabular-nums text-base font-bold whitespace-nowrap">
                        {formatNumber(Number(p.amount), 0)} <span className="text-xs text-muted-foreground">UZS</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{method}</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {p.recordedBy?.name ?? "—"} ·{" "}
                    <span className="font-[var(--font-num)] tabular-nums">{queueStamp(p.recordedAt)}</span>
                  </div>
                  {p.notes && <div className="text-xs text-muted-foreground break-words">{p.notes}</div>}

                  {(p.receipts.length > 0 || (p.status === "PENDING_CONFIRMATION" && canConfirm)) && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {p.receipts.map((r) => (
                          <a
                            key={r.id}
                            href={r.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t("Чекни очиш", "Open receipt")}
                            className="block h-11 w-11 overflow-hidden rounded ring-1 ring-border hover:ring-primary"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.imageUrl} alt={t("Чек", "Receipt")} className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                      {p.status === "PENDING_CONFIRMATION" && canConfirm && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {p.order.status !== "CANCELED" && (
                          <Button
                            variant="outline"
                            className="min-h-11 border-success/40 text-success hover:bg-success hover:text-success-foreground"
                            disabled={decide.isPending}
                            onClick={() => {
                              setError(null);
                              decide.mutate({ item: p, approve: true });
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                            {t("Тасдиқлаш", "Confirm")}
                          </Button>
                          )}
                          <Button
                            variant="outline"
                            className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            disabled={decide.isPending}
                            onClick={() => {
                              setError(null);
                              setRejectReason("");
                              setRejectTarget(p);
                            }}
                          >
                            <Ban className="h-4 w-4 mr-1.5" />
                            {t("Рад этиш", "Reject")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">
              Тўловни рад этиш<span className="lang-en font-normal"> · Reject payment</span>
            </h3>
            <div className="text-sm text-muted-foreground">
              <span className="font-[var(--font-num)] tabular-nums">{rejectTarget.order.orderNumber}</span> ·{" "}
              <span className="font-[var(--font-num)] tabular-nums">
                {formatNumber(Number(rejectTarget.amount), 0)} UZS
              </span>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Рад этиш сабаби (ихтиёрий)", "Rejection reason (optional)")}
              </label>
              <textarea
                rows={3}
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setRejectTarget(null)}
                disabled={decide.isPending}
              >
                {t("Орқага", "Back")}
              </Button>
              <Button
                className="min-h-11 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={decide.isPending}
                onClick={() => {
                  setError(null);
                  decide.mutate({
                    item: rejectTarget,
                    approve: false,
                    rejectionReason: rejectReason.trim() || undefined,
                  });
                }}
              >
                {decide.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                {t("Рад этиш", "Reject")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
