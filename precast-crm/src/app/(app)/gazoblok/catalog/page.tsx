"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Plus, Save } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  pricePerM3,
  blocksPerM3,
  type BlockProduct,
} from "@/services/gazoblok-engine";

// ─────────────────────────────────────────────────────────────────
// API shapes. Prisma Decimal fields arrive as STRINGS — every dim and
// price below is a string and MUST be Number()-coerced before math.
// Dimensions are stored in METERS.
// ─────────────────────────────────────────────────────────────────

interface Stock {
  quantity: number;
}

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
  stock: Stock | null;
}

interface GazoblokConfig {
  grade: string;
}

// A per-row edit draft. Kept as strings so a field can be cleared mid-edit.
interface RowDraft {
  label: string;
  lengthM: string;
  heightM: string;
  thicknessM: string;
  pricePerBlock: string;
  lowStockThreshold: string;
}

function productToDraft(p: Product): RowDraft {
  return {
    label: p.label,
    lengthM: p.lengthM,
    heightM: p.heightM,
    thicknessM: p.thicknessM,
    pricePerBlock: p.pricePerBlock,
    lowStockThreshold: String(p.lowStockThreshold),
  };
}

function isPositive(s: string): boolean {
  if (s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function isNonNeg(s: string): boolean {
  if (s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

/** Build the engine's BlockProduct from Number()-coerced meter dims. */
function toBlockProduct(
  lengthM: string,
  heightM: string,
  thicknessM: string,
  pricePerBlock: string,
): BlockProduct {
  return {
    lengthM: Number(lengthM),
    heightM: Number(heightM),
    thicknessM: Number(thicknessM),
    pricePerBlock: Number(pricePerBlock),
  };
}

/** Format meters as millimetres for display (0.6 m → 600). */
function mToMm(m: string): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n * 1000, 0);
}

export default function GazoblokCatalogPage() {
  const t = useT();
  const qc = useQueryClient();

  const productsQuery = useQuery<Product[]>({
    queryKey: ["gazoblok", "products"],
    queryFn: () => api("/api/gazoblok/products"),
  });

  const configQuery = useQuery<GazoblokConfig>({
    queryKey: ["gazoblok", "config"],
    queryFn: () => api("/api/gazoblok/config"),
  });

  const [error, setError] = useState<string | null>(null);

  // ── Grade draft ───────────────────────────────────────────────
  const [grade, setGrade] = useState<string>("");
  useEffect(() => {
    if (configQuery.data) setGrade(configQuery.data.grade);
  }, [configQuery.data]);

  const saveGrade = useMutation({
    mutationFn: () =>
      api("/api/gazoblok/config", { method: "PUT", json: { grade: grade.trim() } }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["gazoblok", "config"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // ── Per-row edit drafts, keyed by product id ──────────────────
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  useEffect(() => {
    if (productsQuery.data) {
      setDrafts(
        Object.fromEntries(productsQuery.data.map((p) => [p.id, productToDraft(p)])),
      );
    }
  }, [productsQuery.data]);

  const patchProduct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/gazoblok/products/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const disableProduct = useMutation({
    mutationFn: (id: string) =>
      api(`/api/gazoblok/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // ── Add-size form (dims in MILLIMETRES) ───────────────────────
  const emptyAdd = { label: "", lengthMm: "", heightMm: "", thicknessMm: "", pricePerBlock: "" };
  const [add, setAdd] = useState(emptyAdd);

  const createProduct = useMutation({
    mutationFn: () => {
      const L = Number(add.lengthMm);
      const H = Number(add.heightMm);
      const T = Number(add.thicknessMm);
      // Operator types mm; catalog stores metres → divide by 1000.
      const label = add.label.trim() || `${L}×${H}×${T}`;
      return api("/api/gazoblok/products", {
        method: "POST",
        json: {
          label,
          lengthM: L / 1000,
          heightM: H / 1000,
          thicknessM: T / 1000,
          pricePerBlock: Number(add.pricePerBlock),
          lowStockThreshold: 50,
        },
      });
    },
    onSuccess: () => {
      setError(null);
      setAdd(emptyAdd);
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (productsQuery.isLoading || configQuery.isLoading) {
    return (
      <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
    );
  }

  const products = productsQuery.data ?? [];
  const gradeDirty = grade.trim() !== (configQuery.data?.grade ?? "");

  const addValid =
    isPositive(add.lengthMm) &&
    isPositive(add.heightMm) &&
    isPositive(add.thicknessMm) &&
    isNonNeg(add.pricePerBlock);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Boxes className="h-6 w-6 text-muted-foreground" />
          Газоблок
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Gazoblok
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Газоблок ўлчамлари ва ҳар бир блок нархини бошқаринг, шунингдек ягона зичлик маркасини белгиланг. Жадвалдаги ўлчамлар метрда сақланади.",
            "Manage Газоблок sizes and the price per block, plus the single density grade. Catalog dimensions are stored in metres.",
          )}
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Grade section */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Зичлик маркаси · Density grade
            <span className="lang-en font-normal"> (e.g. D500)</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Барча газоблоклар учун ягона маркани белгилайди.",
              "Sets one global grade label for all Газоблок sizes.",
            )}
          </div>
        </header>
        <div className="p-3 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Марка", "Grade")}
            </label>
            <Input
              className="w-40"
              placeholder="D500"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>
          <Button
            disabled={!gradeDirty || grade.trim() === "" || saveGrade.isPending}
            onClick={() => saveGrade.mutate()}
          >
            {saveGrade.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("Сақлаш", "Save")}
          </Button>
          {configQuery.data?.grade && (
            <div className="text-xs text-muted-foreground">
              {t("Жорий:", "Current:")} {configQuery.data.grade}
            </div>
          )}
        </div>
      </section>

      {/* Catalog */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Каталог · Catalog
            <span className="lang-en font-normal"> (sizes &amp; prices)</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Ўлчамлар метрда. м³ нархи ва 1 м³ даги блоклар сони автоматик ҳисобланади.",
              "Dimensions in metres. The m³ price and blocks-per-m³ are derived automatically.",
            )}
          </div>
        </header>

        {products.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t("Ҳозирча ўлчамлар йўқ.", "No sizes yet.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Номи", "Label")}</th>
                  <th className="text-left px-3 py-2">
                    {t("Ўлчам (м)", "Dims (m)")}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t("Нарх / блок", "Price / block")}
                  </th>
                  <th className="text-right px-3 py-2">
                    {t("Кам захира", "Low-stock")}
                  </th>
                  <th className="text-right px-3 py-2">{t("Хосила", "Derived")}</th>
                  <th className="text-right px-3 py-2">{t("Захира", "Stock")}</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => {
                  const d = drafts[p.id];
                  if (!d) return null;

                  // Derived values use the engine on Number()-coerced
                  // meter dims. Guard against an invalid mid-edit state.
                  let perM3 = "—";
                  let perM3Count = "—";
                  const dimsOk =
                    isPositive(d.lengthM) &&
                    isPositive(d.heightM) &&
                    isPositive(d.thicknessM);
                  if (dimsOk) {
                    const bp = toBlockProduct(
                      d.lengthM,
                      d.heightM,
                      d.thicknessM,
                      d.pricePerBlock || "0",
                    );
                    try {
                      perM3 = formatNumber(pricePerM3(bp), 0);
                      perM3Count = formatNumber(blocksPerM3(bp), 1);
                    } catch {
                      // dims invalid for the engine — leave dashes
                    }
                  }

                  const baseline = productToDraft(p);
                  const rowDirty =
                    d.label !== baseline.label ||
                    d.lengthM !== baseline.lengthM ||
                    d.heightM !== baseline.heightM ||
                    d.thicknessM !== baseline.thicknessM ||
                    d.pricePerBlock !== baseline.pricePerBlock ||
                    d.lowStockThreshold !== baseline.lowStockThreshold;

                  const rowValid =
                    d.label.trim() !== "" &&
                    isPositive(d.lengthM) &&
                    isPositive(d.heightM) &&
                    isPositive(d.thicknessM) &&
                    isNonNeg(d.pricePerBlock) &&
                    isNonNeg(d.lowStockThreshold);

                  const setField = (k: keyof RowDraft, v: string) =>
                    setDrafts((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [k]: v } }));

                  return (
                    <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                      <td className="px-3 py-2 align-top">
                        <Input
                          className="w-32"
                          value={d.label}
                          onChange={(e) => setField("label", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.001}
                            className="w-20 tabular-nums"
                            value={d.lengthM}
                            onChange={(e) => setField("lengthM", e.target.value)}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.001}
                            className="w-20 tabular-nums"
                            value={d.heightM}
                            onChange={(e) => setField("heightM", e.target.value)}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.001}
                            className="w-20 tabular-nums"
                            value={d.thicknessM}
                            onChange={(e) => setField("thicknessM", e.target.value)}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {mToMm(d.lengthM)} × {mToMm(d.heightM)} × {mToMm(d.thicknessM)} mm
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1000}
                          className="w-28 tabular-nums"
                          value={d.pricePerBlock}
                          onChange={(e) => setField("pricePerBlock", e.target.value)}
                        />
                        <div className="text-[10px] text-muted-foreground mt-1">UZS</div>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          className="w-20 tabular-nums text-right"
                          value={d.lowStockThreshold}
                          onChange={(e) => setField("lowStockThreshold", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        <div>{perM3} UZS/m³</div>
                        <div>{perM3Count} {t("блок/м³", "blocks/m³")}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">
                        {p.stock ? formatNumber(p.stock.quantity, 0) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            size="sm"
                            disabled={
                              !rowDirty ||
                              !rowValid ||
                              (patchProduct.isPending &&
                                patchProduct.variables?.id === p.id)
                            }
                            onClick={() =>
                              patchProduct.mutate({
                                id: p.id,
                                body: {
                                  label: d.label.trim(),
                                  lengthM: Number(d.lengthM),
                                  heightM: Number(d.heightM),
                                  thicknessM: Number(d.thicknessM),
                                  pricePerBlock: Number(d.pricePerBlock),
                                  lowStockThreshold: Number(d.lowStockThreshold),
                                },
                              })
                            }
                          >
                            {t("Сақлаш", "Save")}
                          </Button>
                          {p.active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                disableProduct.isPending &&
                                disableProduct.variables === p.id
                              }
                              onClick={() => disableProduct.mutate(p.id)}
                            >
                              {t("Ўчириш", "Disable")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                patchProduct.isPending &&
                                patchProduct.variables?.id === p.id
                              }
                              onClick={() =>
                                patchProduct.mutate({ id: p.id, body: { active: true } })
                              }
                            >
                              {t("Қайта ёқиш", "Re-enable")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add size — dims in MILLIMETRES */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Ўлчам қўшиш · Add size
            <span className="lang-en font-normal"> (dims in mm)</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Ўлчамларни МИЛЛИМЕТРДА киритинг (масалан 600 × 300 × 200). Каталогга метрда сақланади.",
              "Enter dimensions in MILLIMETRES (e.g. 600 × 300 × 200). Stored in the catalog as metres.",
            )}
          </div>
        </header>
        <div className="p-3 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Номи (ихтиёрий)", "Label (optional)")}
            </label>
            <Input
              className="w-32"
              placeholder={t("авто", "auto")}
              value={add.label}
              onChange={(e) => setAdd({ ...add, label: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Узунлик (мм)", "Length (mm)")}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-24 tabular-nums"
              placeholder="600"
              value={add.lengthMm}
              onChange={(e) => setAdd({ ...add, lengthMm: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Баландлик (мм)", "Height (mm)")}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-24 tabular-nums"
              placeholder="300"
              value={add.heightMm}
              onChange={(e) => setAdd({ ...add, heightMm: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Қалинлик (мм)", "Thickness (mm)")}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-24 tabular-nums"
              placeholder="200"
              value={add.thicknessMm}
              onChange={(e) => setAdd({ ...add, thicknessMm: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Нарх / блок (UZS)", "Price / block (UZS)")}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              className="w-28 tabular-nums"
              value={add.pricePerBlock}
              onChange={(e) => setAdd({ ...add, pricePerBlock: e.target.value })}
            />
          </div>
          <Button
            disabled={!addValid || createProduct.isPending}
            onClick={() => createProduct.mutate()}
          >
            {createProduct.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {t("Қўшиш", "Add")}
          </Button>
        </div>
      </section>
    </div>
  );
}
