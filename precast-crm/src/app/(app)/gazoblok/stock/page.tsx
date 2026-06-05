"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Warehouse } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { stockTier } from "@/lib/inventory";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
}

/** Format meters as millimetres (0.6 m → 600). */
function mToMm(m: string): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n * 1000, 0);
}

export default function GazoblokStockPage() {
  const t = useT();
  const qc = useQueryClient();

  const stockQuery = useQuery<Product[]>({
    queryKey: ["gazoblok", "stock"],
    queryFn: () => api("/api/gazoblok/stock"),
  });

  const adjust = useMutation({
    mutationFn: ({
      productId,
      change,
      note,
    }: {
      productId: string;
      change: number;
      note?: string;
    }) =>
      api("/api/gazoblok/stock", {
        method: "POST",
        json: { productId, change, note: note || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
    },
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Ўлчам", "Size")}</th>
                  <th className="text-left px-3 py-2">{t("Ўлчам (мм)", "Dims (mm)")}</th>
                  <th className="text-right px-3 py-2">{t("Сони", "Qty")}</th>
                  <th className="text-right px-3 py-2">{t("Кам захира остонаси", "Low-stock at")}</th>
                  <th className="text-left px-3 py-2 w-[280px]">{t("Тузатиш", "Adjust")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => (
                  <Row
                    key={p.id}
                    product={p}
                    isPending={adjust.isPending && adjust.variables?.productId === p.id}
                    onAdjust={(change, note) =>
                      adjust.mutate({ productId: p.id, change, note })
                    }
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({
  product,
  isPending,
  onAdjust,
  t,
}: {
  product: Product;
  isPending: boolean;
  onAdjust: (change: number, note: string) => void;
  t: (uz: string, en: string) => string;
}) {
  const qty = product.stock?.quantity ?? 0;
  const tier = stockTier(qty, product.lowStockThreshold);

  const rowBorder =
    tier === "critical"
      ? "border-l-destructive"
      : tier === "low"
        ? "border-l-warning"
        : "border-l-success";
  const badgeVariant =
    tier === "critical" ? "danger" : tier === "low" ? "warning" : "success";

  const [change, setChange] = useState("");
  const [note, setNote] = useState("");

  const changeNum = Number(change);
  const canAdjust =
    change.trim() !== "" &&
    Number.isFinite(changeNum) &&
    Number.isInteger(changeNum) &&
    changeNum !== 0 &&
    !isPending;

  function submit() {
    if (!canAdjust) return;
    onAdjust(changeNum, note.trim());
    setChange("");
    setNote("");
  }

  return (
    <tr className={cn("border-l-[3px]", rowBorder, "hover:bg-surface-hover transition-colors")}>
      <td className="px-3 py-2.5 font-semibold">{product.label}</td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {mToMm(product.lengthM)} × {mToMm(product.heightM)} × {mToMm(product.thicknessM)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Chip variant={badgeVariant} size="md">
          {formatNumber(qty, 0)}
        </Chip>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-text-tertiary tabular-nums">
        {product.lowStockThreshold}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="1"
            inputMode="numeric"
            className="h-8 w-20 text-right tabular-nums"
            placeholder="±N"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Input
            className="h-8 flex-1 min-w-[100px]"
            placeholder={t("изоҳ", "note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button size="sm" className="h-8" disabled={!canAdjust} onClick={submit}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Тузатиш", "Adjust")}
          </Button>
        </div>
      </td>
    </tr>
  );
}
