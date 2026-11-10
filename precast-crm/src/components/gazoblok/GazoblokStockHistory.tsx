"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { GazoblokStockReason } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Bi, useLang, useT } from "@/lib/i18n";
import { MOVEMENT_REASON_LABELS, movementText } from "@/lib/gazoblok-stock-history";
import { queueStamp } from "@/lib/gazoblok-payments-queue";
import { uzPart } from "@/lib/gazoblok-text";
import { cn, formatNumber } from "@/lib/utils";

interface Movement {
  id: string;
  createdAt: string;
  productId: string;
  productLabel: string;
  change: number;
  resultingQuantity: number;
  reason: GazoblokStockReason;
  note: string | null;
  actor: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
  shipmentNumber: number | null;
  productionEntryId: string | null;
}

interface MovementsPage {
  items: Movement[];
  nextCursor: string | null;
}

interface StockProduct {
  id: string;
  label: string;
  active: boolean;
}

const REASONS = Object.keys(MOVEMENT_REASON_LABELS) as GazoblokStockReason[];
const NUM = "font-mono tabular-nums";

/** «Ҳаракатлар тарихи» — every stock movement, newest first (spec §6, comp 08). */
export function GazoblokStockHistory({ productId: initialProductId }: { productId?: string }) {
  const t = useT();
  const lang = useLang();
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null);
  const [reason, setReason] = useState<GazoblokStockReason | "">("");

  // Same key as the stock table above, so the size pills reuse its fetch.
  const products = useQuery<StockProduct[]>({
    queryKey: ["gazoblok", "stock"],
    queryFn: () => api("/api/gazoblok/stock"),
  });
  const sizes = (products.data ?? []).filter((p) => p.active);

  const history = useInfiniteQuery<MovementsPage>({
    // Under ["gazoblok","stock"] so a stock adjustment refreshes the history too.
    queryKey: ["gazoblok", "stock", "movements", productId, reason],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (productId) params.set("productId", productId);
      if (reason) params.set("reason", reason);
      if (pageParam) params.set("cursor", String(pageParam));
      return api(`/api/gazoblok/stock/movements?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="px-4 py-3 border-b border-border bg-muted space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            <Bi uz="Ҳаракатлар тарихи" en="Movement history" />
          </h2>
          <Select
            aria-label={t("Сабаб", "Reason")}
            className="h-11 w-full sm:w-auto"
            value={reason}
            onChange={(e) => setReason(e.target.value as GazoblokStockReason | "")}
          >
            <option value="">{t("Барча ҳаракатлар", "All movements")}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(MOVEMENT_REASON_LABELS[r][0], MOVEMENT_REASON_LABELS[r][1])}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Ўлчам", "Size")}>
          <Pill on={productId === null} onClick={() => setProductId(null)}>
            {t("Барча ўлчамлар", "All sizes")}
          </Pill>
          {sizes.map((p) => (
            <Pill key={p.id} on={productId === p.id} onClick={() => setProductId(p.id)}>
              <span className={NUM}>{p.label}</span>
            </Pill>
          ))}
        </div>
      </header>

      {history.isLoading ? (
        <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
      ) : history.isError ? (
        <div className="p-4 text-sm text-destructive">{uzPart((history.error as Error).message, lang)}</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          {t("Бу танлов бўйича ҳаракат йўқ.", "No movements for this filter.")}
        </div>
      ) : (
        <>
          <div className="hidden lg:grid grid-cols-[160px_150px_minmax(0,1fr)_120px_90px_90px] bg-muted text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <div className="px-3 py-2">{t("Сана вақт", "When")}</div>
            <div className="px-3 py-2">{t("Ким", "Who")}</div>
            <div className="px-3 py-2">{t("Нима", "What")}</div>
            <div className="px-3 py-2">{t("Ўлчам", "Size")}</div>
            <div className="px-3 py-2 text-right">{t("Ҳаракат", "Change")}</div>
            <div className="px-3 py-2 text-right">{t("Қолдиқ", "Balance")}</div>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <MovementRow key={m.id} m={m} />
            ))}
          </ul>
          {history.hasNextPage && (
            <div className="p-3 border-t border-border">
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={history.isFetchingNextPage}
                onClick={() => history.fetchNextPage()}
              >
                {history.isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("Кўпроқ кўрсатиш", "Show more")
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 px-4 rounded-full border text-[13px] font-semibold transition-colors",
        on
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border-strong hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

/** Signed with a real minus sign: +1 000 / −72. */
function signed(n: number): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + formatNumber(Math.abs(n), 0);
}

function MovementRow({ m }: { m: Movement }) {
  const t = useT();
  const orderNumber = m.order?.orderNumber ?? null;
  const text = movementText({ reason: m.reason, note: m.note, shipmentNumber: m.shipmentNumber, orderNumber });
  // The order number inside the text links to the order.
  const [before, after] = m.order && orderNumber ? text.split(orderNumber, 2) : [text, undefined];

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3 text-sm",
        "[grid-template-areas:'when_delta'_'who_delta'_'what_what'_'size_bal']",
        "lg:grid-cols-[160px_150px_minmax(0,1fr)_120px_90px_90px] lg:[grid-template-areas:'when_who_what_size_delta_bal'] lg:gap-0 lg:px-0 lg:py-0 lg:items-center",
      )}
    >
      <div className={cn("[grid-area:when] whitespace-nowrap text-xs text-muted-foreground lg:px-3 lg:py-2.5 lg:text-sm", NUM)}>
        {queueStamp(m.createdAt)}
      </div>
      <div className="[grid-area:who] font-semibold lg:px-3 lg:py-2.5 lg:font-normal break-words">
        {m.actor?.name ?? "—"}
      </div>
      <div className="[grid-area:what] break-words lg:px-3 lg:py-2.5">
        {before}
        {m.order && after !== undefined && (
          <>
            <Link href={`/gazoblok/orders/${m.order.id}`} className={cn("text-primary hover:underline", NUM)}>
              {orderNumber}
            </Link>
            {after}
          </>
        )}
      </div>
      <div className={cn("[grid-area:size] text-xs lg:text-sm lg:px-3 lg:py-2.5", NUM)}>{m.productLabel}</div>
      <div
        className={cn(
          "[grid-area:delta] self-center text-right text-lg font-semibold lg:text-sm lg:px-3 lg:py-2.5",
          NUM,
          m.change > 0 ? "text-success" : m.change < 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {signed(m.change)}
      </div>
      <div className={cn("[grid-area:bal] text-right text-xs text-muted-foreground lg:text-sm lg:text-foreground lg:px-3 lg:py-2.5", NUM)}>
        <span className="lg:hidden font-sans">{t("қолдиқ", "balance")}: </span>
        {formatNumber(m.resultingQuantity, 0)}
      </div>
    </li>
  );
}
