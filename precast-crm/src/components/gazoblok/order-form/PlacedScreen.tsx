"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, FileText, Loader2, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { formatPhone } from "@/lib/phone";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatYmd } from "@/lib/gazoblok-order-form";
import { GazoblokShareCard, shareCaption, type ShareOrder } from "@/components/gazoblok/GazoblokShareCard";
import { SendQuoteToChatButton } from "@/components/inbox/SendQuoteToChatButton";
import { NUM } from "./ui";
import { StatePill } from "./OrderLedger";
import type { PlacedOrder } from "./types";

const ICON = { strokeWidth: 1.75 };
const AUTO_OPEN_S = 5;

const pad = (n: number) => String(n).padStart(2, "0");
const dmyHm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * «Буюртма қабул қилинди» (owner 2026-11-10): the number, what was placed, and the next step.
 * The order opens by itself after 5 s; touching anything on the card stops that.
 */
export function PlacedScreen({
  order,
  paidAtPlacement,
  pendingPayment,
  canChat,
  onOpen,
  onNew,
  onAgain,
}: {
  order: PlacedOrder;
  paidAtPlacement: number;
  pendingPayment: boolean;
  canChat: boolean;
  onOpen: () => void;
  onNew: () => void;
  onAgain: () => void;
}) {
  const t = useT();
  const [left, setLeft] = useState<number | null>(AUTO_OPEN_S);
  const cardRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      onOpenRef.current();
      return;
    }
    const h = setTimeout(() => setLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(h);
  }, [left]);
  const stop = () => setLeft(null);

  // The chat card needs the full order (lines with sizes); fetched only for inbox users.
  const detail = useQuery<ShareOrder & { client: { name: string; phone?: string | null } }>({
    queryKey: ["gazoblok-order", order.id],
    queryFn: () => api(`/api/gazoblok/orders/${order.id}`),
    enabled: canChat,
  });

  const total = Number(order.totalPrice);
  const confirmed = Number(order.confirmedPaid);
  const debt = Math.max(0, total - confirmed - (pendingPayment ? paidAtPlacement : 0));
  const sched = order.scheduledAt ? formatYmd(order.scheduledAt.slice(0, 10)) : null;

  return (
    <section
      onPointerDownCapture={stop}
      onKeyDownCapture={stop}
      aria-live="polite"
      className="mx-auto max-w-[640px] rounded-lg border border-border bg-card p-6 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)] md:mt-10 md:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <Check className="h-6 w-6" {...ICON} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold tracking-tight">{t("Буюртма қабул қилинди", "Order placed")}</h2>
          <div className="text-[13px] text-muted-foreground">
            <span className={cn(NUM, "font-semibold text-foreground")} data-testid="placed-number">
              {order.orderNumber}
            </span>{" "}
            · {dmyHm(order.placedAt)}
          </div>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 text-[13px] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("Мижоз", "Client")}</dt>
          <dd className="mt-0.5 break-words font-semibold">{order.client.name}</dd>
          <dd className={cn(NUM, "text-muted-foreground")}>{formatPhone(order.client.phone)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("Етказиш", "Delivery")}</dt>
          <dd className={cn("mt-0.5 font-semibold", sched && NUM)}>{sched ?? t("Сана белгиланмаган", "No date set")}</dd>
          {order.client.address && <dd className="break-words text-muted-foreground">{order.client.address}</dd>}
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Блоклар", "Blocks")}</dt>
          <dd className="mt-0.5 font-semibold">
            <span className={NUM}>{formatNumber(order.totalBlocks, 0)}</span> {t("та", "pcs")} ·{" "}
            <span className={NUM}>{formatNumber(Number(order.totalVolumeM3), 3)}</span> {t("м³", "m³")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Жами", "Total")}</dt>
          <dd className={cn(NUM, "mt-0.5 text-[17px] font-bold")}>
            {formatNumber(total, 0)} <span className="font-sans text-xs font-medium text-muted-foreground">UZS</span>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <StatePill state={order.paymentState} />
          {pendingPayment && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-bold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" {...ICON} />
              {t("Тўлов тасдиқланмаган", "Payment unconfirmed")} · <span className={NUM}>{formatNumber(paidAtPlacement, 0)}</span>
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {t("Қарздорлик", "Debt")}{" "}
            <span className={cn(NUM, "font-semibold", debt > 0 ? "text-destructive" : "text-success")}>{formatNumber(debt, 0)}</span> UZS
          </span>
        </div>
      </dl>

      <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button className="h-11 gap-2" onClick={onOpen} data-testid="placed-open">
          <FileText className="h-4 w-4" {...ICON} />
          {t("Буюртмани очиш", "Open the order")}
        </Button>
        <Button variant="outline" className="h-11 gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" {...ICON} />
          {t("Янги буюртма", "New order")}
        </Button>
        <Button variant="outline" className="h-11 gap-2" onClick={onAgain}>
          <RotateCcw className="h-4 w-4" {...ICON} />
          {t("Шу мижозга яна", "Again for this client")}
        </Button>
        {canChat && (
          <div className="[&_button]:h-11 [&_button]:w-full">
            {detail.data ? (
              <SendQuoteToChatButton
                targetRef={cardRef}
                conversationId={null}
                fileBase={`Gazoblok-${order.orderNumber}`}
                caption={shareCaption(detail.data)}
              />
            ) : (
              <Button variant="outline" className="h-11 w-full gap-2" disabled>
                <Loader2 className="h-4 w-4 animate-spin" {...ICON} />
                {t("Чатга юбориш", "Send to chat")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex min-h-[20px] items-center gap-1.5 text-xs text-muted-foreground">
        {left !== null ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" {...ICON} />
            <span>
              <span className={NUM}>{left}</span> {t("сониядан кейин буюртма саҳифаси очилади", "s until the order page opens")}
            </span>
          </>
        ) : (
          <span>{t("Автоматик очилиш тўхтатилди", "Auto-open stopped")}</span>
        )}
      </div>

      {detail.data && (
        // Off-screen, fixed-width card — the capture target of «Чатга юбориш».
        <div aria-hidden="true" className="pointer-events-none fixed left-[-99999px] top-0">
          <GazoblokShareCard ref={cardRef} order={detail.data} />
        </div>
      )}
    </section>
  );
}
