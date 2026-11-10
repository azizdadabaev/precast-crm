"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Warehouse } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { stockTier } from "@/lib/inventory";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { GazoblokStockHistory } from "@/components/gazoblok/GazoblokStockHistory";

// ─────────────────────────────────────────────────────────────────
// API shapes. Prisma Decimal fields (dims/price) arrive as STRINGS —
// wrap with Number() before any math. stock.quantity is a plain number.
// Dimensions are stored in METRES.
// ─────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  label: string;
  lengthM: string;
  heightM: string;
  thicknessM: string;
  pricePerBlock: string;
  lowStockThreshold: number;
  active: boolean;
  seq: number;
  stock: { quantity: number } | null;
  /** Blocks open orders still need (ordered − loaded). */
  reserved: number;
}

// Size · in stock · needed · free · low-at · adjust (desktop); phones stack.
const ROW_GRID = "grid lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))_minmax(260px,2fr)]";

/** Format meters as millimetres (0.6 m → 600). */
function mToMm(m: string): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n * 1000, 0);
}

export default function GazoblokStockPage() {
  const t = useT();

  const stockQuery = useQuery<Product[]>({
    queryKey: ["gazoblok", "stock"],
    queryFn: () => api("/api/gazoblok/stock"),
  });

  const products = (stockQuery.data ?? []).filter((p) => p.active === true);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Warehouse className="h-6 w-6 text-muted-foreground" />
          Газоблок омбор
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Gazoblok stock
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Ҳар бир Газоблок ўлчами бўйича мавжуд захира. Қўлда тузатиш учун +N қўшади, -N айиради.",
            "On-hand stock per Газоблок size. Manual adjust: +N adds, -N removes.",
          )}
        </p>
      </div>

      {/* Stock table */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b border-border bg-muted">
          <div className="text-sm font-bold">{t("Захира", "Stock")}</div>
          <div className="text-xs text-text-tertiary">
            {t("Ҳар бир фаол ўлчам учун битта қатор", "One row per active size")}
          </div>
        </header>

        {stockQuery.isLoading ? (
          <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : stockQuery.isError ? (
          <div className="p-4 text-sm text-destructive">
            {(stockQuery.error as Error).message}
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {t("Фаол Газоблок ўлчами йўқ.", "No active Газоблок sizes yet.")}
          </div>
        ) : (
          <div>
            <div className={cn(ROW_GRID, "hidden lg:grid bg-muted text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border")}>
              <div className="px-3 py-2">{t("Ўлчам, мм", "Size, mm")}</div>
              <div className="px-3 py-2 text-right">{t("Омборда", "In stock")}</div>
              <div className="px-3 py-2 text-right">{t("Буюртмаларга керак", "Needed by orders")}</div>
              <div className="px-3 py-2 text-right">{t("Бўш", "Free")}</div>
              <div className="px-3 py-2 text-right">{t("Чегара", "Low at")}</div>
              <div className="px-3 py-2">{t("Тузатиш", "Adjust")}</div>
            </div>
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <Row key={p.id} product={p} t={t} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <GazoblokStockHistory />
    </div>
  );
}

function Row({
  product,
  t,
}: {
  product: Product;
  t: (uz: string, en: string) => string;
}) {
  const qc = useQueryClient();
  const qty = product.stock?.quantity ?? 0;
  const tier = stockTier(qty, product.lowStockThreshold);

  const free = qty - product.reserved;

  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<"error" | "warning" | null>(null);

  // Inputs are cleared in onSuccess ONLY — a failed request must keep the
  // operator's typed values so they can retry.
  const adjust = useMutation<
    { resultingQuantity: number },
    Error,
    { change: number; note: string }
  >({
    mutationFn: ({ change, note }) =>
      api("/api/gazoblok/stock", {
        method: "POST",
        json: { productId: product.id, change, note: note || undefined },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
      setChange("");
      setNote("");
      setFeedback(data.resultingQuantity < 0 ? "warning" : null);
    },
    onError: () => setFeedback("error"),
  });
  const isPending = adjust.isPending;

  const changeNum = Number(change);
  const canAdjust =
    change.trim() !== "" &&
    Number.isFinite(changeNum) &&
    Number.isInteger(changeNum) &&
    changeNum !== 0 &&
    !isPending;

  function submit() {
    if (!canAdjust) return;
    setFeedback(null);
    adjust.mutate({ change: changeNum, note: note.trim() });
  }

  return (
    <li className={cn(ROW_GRID, "grid-cols-3 gap-x-2 gap-y-1.5 px-4 py-3 lg:gap-0 lg:px-0 lg:py-0 lg:items-center hover:bg-surface-hover transition-colors")}>
      <div className="col-span-3 lg:col-span-1 flex items-center justify-between lg:justify-start gap-2 lg:px-3 lg:py-2.5">
        <span className="font-mono tabular-nums font-semibold" title={product.label}>
          {mToMm(product.lengthM)}×{mToMm(product.heightM)}×{mToMm(product.thicknessM)}
        </span>
        {qty <= 0 ? (
          <Chip variant="danger" size="md">{t("Тугаган", "Out")}</Chip>
        ) : tier === "critical" ? (
          <Chip variant="danger" size="md">{t("Жуда кам", "Very low")}</Chip>
        ) : tier === "low" ? (
          <Chip variant="warning" size="md">{t("Кам", "Low")}</Chip>
        ) : null}
      </div>
      <Cell label={t("Омборда", "In stock")} className={cn(qty <= 0 && "text-destructive font-semibold")}>
        {formatNumber(qty, 0)}
      </Cell>
      <Cell label={t("Керак", "Needed")}>{formatNumber(product.reserved, 0)}</Cell>
      <Cell label={t("Бўш", "Free")} className={cn(free < 0 && "text-destructive font-semibold")}>
        {free < 0 ? "−" + formatNumber(-free, 0) : formatNumber(free, 0)}
      </Cell>
      <div className="hidden lg:block px-3 py-2.5 text-right font-mono tabular-nums text-text-tertiary">
        {formatNumber(product.lowStockThreshold, 0)}
      </div>
      <div className="col-span-3 lg:col-span-1 pt-1 lg:pt-2.5 lg:pb-2.5 lg:px-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="1"
            inputMode="numeric"
            className="h-11 md:h-8 w-20 text-right tabular-nums"
            placeholder="±N"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Input
            className="h-11 md:h-8 flex-1 min-w-[100px]"
            placeholder={t("изоҳ", "note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button size="sm" className="h-11 md:h-8" disabled={!canAdjust} onClick={submit}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Тузатиш", "Adjust")}
          </Button>
        </div>
        {feedback === "error" && (
          <div className="mt-1 text-xs text-destructive">
            {t("Сақлаб бўлмади. Қайта уриниб кўринг.", "Failed to save. Try again.")}
          </div>
        )}
        {feedback === "warning" && (
          <div className="mt-1 text-xs text-warning">
            {t("Диққат: захира манфий бўлди", "Warning: stock is now negative")}
          </div>
        )}
      </div>
    </li>
  );
}

/** Number cell; on phones the column name sits above the figure (comp 08). */
function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("font-mono tabular-nums lg:text-right lg:px-3 lg:py-2.5", className)}>
      <span className="lg:hidden block font-sans text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
