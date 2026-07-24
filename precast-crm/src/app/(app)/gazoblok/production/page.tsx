"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────
// API shapes. Prisma Decimal fields arrive as STRINGS — but here we
// only read product.label and stock quantities (plain numbers), so no
// Number() coercion is needed for the math on this page.
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

interface ProductionLine {
  id: string;
  quantity: number;
  product: { id: string; label: string };
}

interface ProductionEntry {
  id: string;
  producedAt: string;
  notes: string | null;
  voidedAt: string | null;
  recordedBy: { id: string; name: string } | null;
  lines: ProductionLine[];
}

// A per-line draft in the log form. Kept as strings so a field can be
// cleared mid-edit.
interface DraftLine {
  id: string;
  productId: string;
  quantity: string;
}

function newLine(): DraftLine {
  return { id: Math.random().toString(36).slice(2, 9), productId: "", quantity: "" };
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function GazoblokProductionPage() {
  const t = useT();
  const qc = useQueryClient();

  const productsQuery = useQuery<Product[]>({
    queryKey: ["gazoblok", "products"],
    queryFn: () => api("/api/gazoblok/products"),
  });

  const entriesQuery = useQuery<ProductionEntry[]>({
    queryKey: ["gazoblok", "production"],
    queryFn: () => api("/api/gazoblok/production"),
  });

  const activeProducts = (productsQuery.data ?? []).filter((p) => p.active === true);

  // ── Log form state ────────────────────────────────────────────
  const [producedAt, setProducedAt] = useState<string>(isoDateLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  function update(id: string, patch: Partial<DraftLine>) {
    setLines((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    setLines((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }

  // A line must be either fully empty (stripped at submit) or fully filled
  // (product + integer qty ≥ 1). Half-filled lines block saving — they must
  // never be silently dropped.
  const lineStates = lines.map((l) => {
    const hasProduct = l.productId !== "";
    const qtyStr = l.quantity.trim();
    const qtyNum = Number(qtyStr);
    const hasValidQty = qtyStr !== "" && Number.isInteger(qtyNum) && qtyNum >= 1;
    return {
      line: l,
      isEmpty: !hasProduct && qtyStr === "",
      isFilled: hasProduct && hasValidQty,
      needsProduct: !hasProduct && qtyStr !== "",
      needsQty: hasProduct && !hasValidQty,
    };
  });
  const filledLines = lineStates.filter((s) => s.isFilled).map((s) => s.line);
  const hasPartialLine = lineStates.some((s) => !s.isEmpty && !s.isFilled);

  const selectedProductIds = new Set(lines.map((l) => l.productId).filter(Boolean));

  const create = useMutation({
    mutationFn: () =>
      api("/api/gazoblok/production", {
        method: "POST",
        json: {
          producedAt: new Date(producedAt + "T12:00:00").toISOString(),
          notes: notes.trim() || undefined,
          lines: filledLines.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gazoblok", "production"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
      setLines([newLine()]);
      setNotes("");
      setProducedAt(isoDateLocal(new Date()));
    },
  });

  const canSave = filledLines.length > 0 && !hasPartialLine && !create.isPending;

  // ── Void a production entry (two-tap confirm) ─────────────────
  const voidEntry = useMutation({
    mutationFn: (entryId: string) =>
      api("/api/gazoblok/production", {
        method: "PATCH",
        json: { action: "void", entryId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gazoblok", "production"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
    },
  });

  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [],
  );
  const handleVoidClick = (id: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (confirmVoidId === id) {
      setConfirmVoidId(null);
      voidEntry.mutate(id);
      return;
    }
    setConfirmVoidId(id);
    confirmTimerRef.current = setTimeout(() => setConfirmVoidId(null), 3000);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Hammer className="h-6 w-6 text-muted-foreground" />
          Газоблок ишлаб чиқариш
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Gazoblok production
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Бугунги Газоблок маҳсулотини қайд этинг. Ҳар бир қатор омбордаги захирани кўпайтиради.",
            "Log today's Газоблок output. Each line increments warehouse stock.",
          )}
        </p>
      </div>

      {/* Log form */}
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Янги маҳсулот<span className="lang-en"> · Log production</span>
          </h2>
          <div className="text-xs text-muted-foreground">
            {t("Ҳар бир қатор захирани кўпайтиради.", "Each line increments stock.")}
          </div>
        </div>

        {/* Header inputs */}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Сана<span className="lang-en"> · Date</span> ({t("ихтиёрий", "optional")})
            </label>
            <Input
              type="date"
              className="h-9 w-44 mt-1"
              value={producedAt}
              onChange={(e) => setProducedAt(e.target.value)}
              max={isoDateLocal(new Date())}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Изоҳ<span className="lang-en"> · Notes</span> ({t("ихтиёрий", "optional")})
            </label>
            <Input
              className="h-9 mt-1"
              placeholder={t("масалан: Смена А, парти №42", "e.g. Shift A, lot #42")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Lines */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2">{t("Ўлчам", "Size")}</th>
                <th className="text-left px-2 py-2 w-32">{t("Сони", "Qty")}</th>
                <th className="px-2 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineStates.map(({ line: l, needsProduct, needsQty }) => (
                <tr key={l.id}>
                  <td className="px-2 py-2">
                    <Select
                      className={cn("h-9", needsProduct && "border-destructive")}
                      value={l.productId}
                      onChange={(e) => update(l.id, { productId: e.target.value })}
                    >
                      <option value="">
                        {productsQuery.isLoading
                          ? t("Юкланмоқда…", "Loading…")
                          : t("Ўлчамни танланг…", "Select a size…")}
                      </option>
                      {activeProducts
                        .filter((p) => p.id === l.productId || !selectedProductIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                    </Select>
                    {needsProduct && (
                      <div className="mt-1 text-xs text-destructive">
                        {t("Ўлчамни танланг", "Select size")}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      className={cn(
                        "h-9 text-center tabular-nums",
                        needsQty && "border-destructive",
                      )}
                      value={l.quantity}
                      onChange={(e) => update(l.id, { quantity: e.target.value })}
                      placeholder="0"
                    />
                    {needsQty && (
                      <div className="mt-1 text-xs text-destructive">
                        {t("Миқдорни киритинг", "Enter quantity")}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => remove(l.id)}
                      disabled={lines.length === 1}
                      aria-label={t("Қаторни ўчириш", "Remove line")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((rs) => [...rs, newLine()])}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("Қатор қўшиш", "Add line")}
          </Button>

          <div className="flex items-center gap-3">
            {create.isError && (
              <span className="text-sm text-destructive">
                {(create.error as Error).message}
              </span>
            )}
            <Button onClick={() => create.mutate()} disabled={!canSave}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("Ишлаб чиқаришни сақлаш", "Save Production")}
            </Button>
          </div>
        </div>
      </section>

      {/* Recent entries */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Сўнгги ёзувлар<span className="lang-en font-normal">{" "}· Recent entries</span>
          </h2>
          <div className="text-xs text-text-tertiary">
            {t("Сўнгги 50 та ёзув", "Last 50 entries")}
          </div>
        </div>

        {entriesQuery.isLoading ? (
          <div className="text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : entriesQuery.isError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {(entriesQuery.error as Error).message}
          </div>
        ) : (entriesQuery.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            {t("Ишлаб чиқариш ёзуви йўқ.", "No production entries yet.")}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-32">{t("Сана", "Date")}</th>
                  <th className="text-left px-3 py-2 w-40">{t("Ким қайд этди", "Recorded by")}</th>
                  <th className="text-left px-3 py-2">{t("Ўлчамлар бўйича сони", "Quantities by size")}</th>
                  <th className="text-left px-3 py-2">{t("Изоҳ", "Notes")}</th>
                  <th className="px-3 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(entriesQuery.data ?? []).map((e) => {
                  const isVoided = e.voidedAt !== null;
                  return (
                  <tr key={e.id} className={cn("align-top", isVoided && "opacity-60")}>
                    <td className={cn("px-3 py-2.5 font-mono whitespace-nowrap", isVoided && "line-through")}>
                      {formatDate(e.producedAt)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-muted-foreground", isVoided && "line-through")}>
                      {e.recordedBy?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className={cn("flex flex-wrap gap-1.5", isVoided && "line-through")}>
                        {e.lines.map((line) => (
                          <span
                            key={line.id}
                            className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 border border-border"
                          >
                            <span className="text-xs text-text-tertiary">{line.product.label}</span>
                            <span className="font-mono font-bold tabular-nums text-success">
                              +{formatNumber(line.quantity, 0)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={cn("px-3 py-2.5 text-xs text-text-tertiary italic", isVoided && "line-through")}>
                      {e.notes || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {isVoided ? (
                        <Chip variant="neutral">{t("Бекор қилинган", "Voided")}</Chip>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={voidEntry.isPending && voidEntry.variables === e.id}
                          onClick={() => handleVoidClick(e.id)}
                          aria-label={t("Бекор қилиш", "Void")}
                        >
                          {confirmVoidId === e.id
                            ? t("Тасдиқлайсизми?", "Confirm?")
                            : t("Бекор қилиш", "Void")}
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
      </section>
    </div>
  );
}
