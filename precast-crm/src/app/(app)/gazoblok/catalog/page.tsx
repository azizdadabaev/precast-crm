"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Plus, Save } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { Bi, useLang, useT } from "@/lib/i18n";
import { parseMoney, uzPart } from "@/lib/gazoblok-text";
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
// Dims are edited in MILLIMETRES (stored in metres); the price is shown
// grouped («18 000») and read back with parseMoney.
interface RowDraft {
  label: string;
  lengthMm: string;
  heightMm: string;
  thicknessMm: string;
  pricePerBlock: string;
  lowStockThreshold: string;
}

/** Stored metres → mm text for an input (0.6 → "600"; keeps 0.1 mm). */
function mToMmInput(m: string): string {
  const n = Number(m);
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 10) : "";
}

/** «18 000»; a price with tiyin keeps up to 2 decimals. */
function groupedPrice(price: string): string {
  const n = Number(price);
  return Number.isFinite(n) ? formatNumber(n, 2) : price;
}

function productToDraft(p: Product): RowDraft {
  return {
    label: p.label,
    lengthMm: mToMmInput(p.lengthM),
    heightMm: mToMmInput(p.heightM),
    thicknessMm: mToMmInput(p.thicknessM),
    pricePerBlock: groupedPrice(p.pricePerBlock),
    lowStockThreshold: String(p.lowStockThreshold),
  };
}

/** Compares by value, so «18000» typed over «18 000» is not a change. */
function draftsEqual(a: RowDraft, b: RowDraft): boolean {
  return (
    a.label === b.label &&
    Number(a.lengthMm) === Number(b.lengthMm) &&
    Number(a.heightMm) === Number(b.heightMm) &&
    Number(a.thicknessMm) === Number(b.thicknessMm) &&
    parseMoney(a.pricePerBlock) === parseMoney(b.pricePerBlock) &&
    a.lowStockThreshold === b.lowStockThreshold
  );
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

/** Build the engine's BlockProduct from mm dims (engine works in metres). */
function toBlockProduct(
  lengthMm: string,
  heightMm: string,
  thicknessMm: string,
  pricePerBlock: number,
): BlockProduct {
  return {
    lengthM: Number(lengthMm) / 1000,
    heightM: Number(heightMm) / 1000,
    thicknessM: Number(thicknessMm) / 1000,
    pricePerBlock,
  };
}

export default function GazoblokCatalogPage() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();

  // Catalog writes need pricing.edit (server enforces it); without it the
  // page is read-only. Read-only while /me loads so nothing flashes editable.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canEdit = me?.permissions.includes("pricing.edit") ?? false;

  const productsQuery = useQuery<Product[]>({
    queryKey: ["gazoblok", "products"],
    queryFn: () => api("/api/gazoblok/products"),
  });

  const configQuery = useQuery<GazoblokConfig>({
    queryKey: ["gazoblok", "config"],
    queryFn: () => api("/api/gazoblok/config"),
  });

  // ── Grade draft ───────────────────────────────────────────────
  const [grade, setGrade] = useState<string>("");
  useEffect(() => {
    if (configQuery.data) setGrade(configQuery.data.grade);
  }, [configQuery.data]);

  const saveGrade = useMutation({
    mutationFn: () =>
      api("/api/gazoblok/config", { method: "PUT", json: { grade: grade.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gazoblok", "config"] });
    },
  });

  // ── Per-row edit drafts, keyed by product id ──────────────────
  // baselineRef holds the last server snapshot each draft was built
  // from. On refetch we overwrite a draft ONLY if it still equals its
  // baseline — an operator's in-progress edits on row B must survive a
  // refetch triggered by saving row A.
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const baselineRef = useRef<Record<string, RowDraft>>({});
  useEffect(() => {
    const data = productsQuery.data;
    if (!data) return;
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const p of data) {
        const fresh = productToDraft(p);
        const existing = prev[p.id];
        const baseline = baselineRef.current[p.id];
        next[p.id] =
          existing && baseline && !draftsEqual(existing, baseline)
            ? existing
            : fresh;
      }
      return next;
    });
    baselineRef.current = Object.fromEntries(
      data.map((p) => [p.id, productToDraft(p)]),
    );
  }, [productsQuery.data]);

  const patchProduct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/gazoblok/products/${id}`, { method: "PATCH", json: body }),
    onSuccess: (_data, { id }) => {
      // Drop the saved row's baseline so the refetch snapshot resets it.
      delete baselineRef.current[id];
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
    },
  });

  const disableProduct = useMutation({
    mutationFn: (id: string) =>
      api(`/api/gazoblok/products/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      delete baselineRef.current[id];
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
    },
  });

  // ── Archive two-tap confirm ───────────────────────────────────
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [],
  );
  const handleArchiveClick = (id: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (confirmArchiveId === id) {
      setConfirmArchiveId(null);
      disableProduct.mutate(id);
      return;
    }
    setConfirmArchiveId(id);
    confirmTimerRef.current = setTimeout(() => setConfirmArchiveId(null), 3000);
  };

  // ── Add-size form (dims in MILLIMETRES) ───────────────────────
  const emptyAdd = {
    label: "",
    lengthMm: "",
    heightMm: "",
    thicknessMm: "",
    pricePerBlock: "",
    lowStockThreshold: "50",
  };
  const [add, setAdd] = useState(emptyAdd);
  // Client-side duplicate-dims pre-check message (server also 422s).
  const [dupError, setDupError] = useState<string | null>(null);

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
          pricePerBlock: parseMoney(add.pricePerBlock),
          lowStockThreshold: Number(add.lowStockThreshold),
        },
      });
    },
    onSuccess: () => {
      setAdd(emptyAdd);
      qc.invalidateQueries({ queryKey: ["gazoblok", "products"] });
      qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
    },
  });

  const products = productsQuery.data ?? [];
  const gradeDirty = grade.trim() !== (configQuery.data?.grade ?? "");

  const addValid =
    isPositive(add.lengthMm) &&
    isPositive(add.heightMm) &&
    isPositive(add.thicknessMm) &&
    parseMoney(add.pricePerBlock) !== null &&
    isNonNeg(add.lowStockThreshold);

  /** Mirrors the server's duplicate check: same dims on an ACTIVE size. */
  const sameDim = (storedM: string, typedMm: string) =>
    Math.abs(Number(storedM) * 1000 - Number(typedMm)) < 0.001;
  const submitAdd = () => {
    const duplicate = products.some(
      (p) =>
        p.active &&
        sameDim(p.lengthM, add.lengthMm) &&
        sameDim(p.heightM, add.heightMm) &&
        sameDim(p.thicknessM, add.thicknessMm),
    );
    if (duplicate) {
      setDupError(t("Бу ўлчам аллақачон мавжуд", "This size already exists"));
      return;
    }
    setDupError(null);
    createProduct.mutate();
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Boxes className="h-6 w-6 text-muted-foreground" />
          <Bi uz="Газоблок" en="Gazoblok" enClassName="text-muted-foreground font-normal text-base" />
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Газоблок ўлчамлари ва ҳар бир блок нархини бошқаринг, шунингдек ягона зичлик маркасини белгиланг. Ўлчамлар миллиметрда.",
            "Manage gazoblok sizes and the price per block, plus the single density grade. Sizes in millimetres.",
          )}
        </p>
        {me && !canEdit && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Нархни фақат нарх ҳуқуқи борлар ўзгартиради", "Only users with pricing rights can change prices")}
          </p>
        )}
      </div>

      {/* Grade section */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Bi uz="Зичлик маркаси" en="Density grade (e.g. D500)" enClassName="font-normal" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Барча газоблоклар учун ягона маркани белгилайди.",
              "Sets one global grade label for all Газоблок sizes.",
            )}
          </div>
        </header>
        {configQuery.isLoading ? (
          <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : configQuery.isError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("Маълумотни юклаб бўлмади. Уланишни текширинг.", "Failed to load. Check your connection.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => configQuery.refetch()}>
              {t("Қайта уриниш", "Retry")}
            </Button>
          </div>
        ) : (
          <div className="p-3 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                {t("Марка", "Grade")}
              </label>
              <Input
                className="w-40"
                readOnly={!canEdit}
                placeholder="D500"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
            </div>
            {canEdit && (
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
            )}
            {configQuery.data?.grade && (
              <div className="text-xs text-muted-foreground">
                {t("Жорий:", "Current:")} {configQuery.data.grade}
              </div>
            )}
            {saveGrade.isError && (
              <div className="text-sm text-destructive w-full">
                {uzPart((saveGrade.error as Error).message, lang)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Catalog */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Bi uz="Каталог" en="Catalog (sizes & prices)" enClassName="font-normal" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Ўлчамлар миллиметрда. м³ нархи ва 1 м³ даги блоклар сони автоматик ҳисобланади.",
              "Dimensions in millimetres. The m³ price and blocks-per-m³ are derived automatically.",
            )}
          </div>
        </header>

        {productsQuery.isLoading ? (
          <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : productsQuery.isError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("Маълумотни юклаб бўлмади. Уланишни текширинг.", "Failed to load. Check your connection.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => productsQuery.refetch()}>
              {t("Қайта уриниш", "Retry")}
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t("Ҳозирча ўлчамлар йўқ.", "No sizes yet.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Phones: each size stacks into a labelled card; md+: a normal table. */}
            <table className="w-full text-sm block md:table">
              <thead className="hidden md:table-header-group bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Номи", "Label")}</th>
                  <th className="text-left px-3 py-2">
                    {t("Ўлчам, мм", "Size, mm")}
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
              <tbody className="block md:table-row-group divide-y">
                {products.map((p) => {
                  const d = drafts[p.id];
                  if (!d) return null;

                  // Derived values use the engine on Number()-coerced
                  // meter dims. Guard against an invalid mid-edit state.
                  let perM3 = "—";
                  let perM3Count = "—";
                  const dimsOk =
                    isPositive(d.lengthMm) &&
                    isPositive(d.heightMm) &&
                    isPositive(d.thicknessMm);
                  const price = parseMoney(d.pricePerBlock);
                  if (dimsOk) {
                    const priceOk = price !== null && price > 0;
                    const bp = toBlockProduct(
                      d.lengthMm,
                      d.heightMm,
                      d.thicknessMm,
                      priceOk ? price : 0,
                    );
                    try {
                      // A non-positive price makes the derived m³ price
                      // meaningless — keep the dash instead of "0".
                      if (priceOk) perM3 = formatNumber(pricePerM3(bp), 0);
                      perM3Count = formatNumber(blocksPerM3(bp), 1);
                    } catch {
                      // dims invalid for the engine — leave dashes
                    }
                  }

                  const rowDirty = !draftsEqual(d, productToDraft(p));

                  const rowValid =
                    d.label.trim() !== "" &&
                    dimsOk &&
                    price !== null &&
                    isNonNeg(d.lowStockThreshold);

                  const setField = (k: keyof RowDraft, v: string) =>
                    setDrafts((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [k]: v } }));

                  return (
                    <tr key={p.id} className={cn("grid grid-cols-2 gap-3 p-4 md:table-row md:p-0", !p.active && "opacity-50")}>
                      <td className="col-span-2 md:table-cell md:px-3 md:py-2 align-top">
                        <span className="md:hidden block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Номи", "Label")}</span>
                        <Input
                          className="w-full md:w-32"
                          readOnly={!canEdit}
                          value={d.label}
                          onChange={(e) => setField("label", e.target.value)}
                        />
                      </td>
                      <td className="col-span-2 md:table-cell md:px-3 md:py-2 align-top">
                        <span className="md:hidden block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Ўлчам, мм", "Size, mm")}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            readOnly={!canEdit}
                            className="min-w-0 flex-1 md:flex-none md:w-20 font-mono tabular-nums"
                            value={d.lengthMm}
                            onChange={(e) => setField("lengthMm", e.target.value)}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            readOnly={!canEdit}
                            className="min-w-0 flex-1 md:flex-none md:w-20 font-mono tabular-nums"
                            value={d.heightMm}
                            onChange={(e) => setField("heightMm", e.target.value)}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            readOnly={!canEdit}
                            className="min-w-0 flex-1 md:flex-none md:w-20 font-mono tabular-nums"
                            value={d.thicknessMm}
                            onChange={(e) => setField("thicknessMm", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="md:table-cell md:px-3 md:py-2 align-top">
                        <span className="md:hidden block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Нарх / блок", "Price / block")}</span>
                        <Input
                          inputMode="decimal"
                          readOnly={!canEdit}
                          className="w-full md:w-28 font-mono tabular-nums text-right"
                          value={d.pricePerBlock}
                          onChange={(e) => setField("pricePerBlock", e.target.value)}
                          onBlur={() => {
                            const v = parseMoney(d.pricePerBlock);
                            if (v !== null) setField("pricePerBlock", formatNumber(v, 2));
                          }}
                        />
                        <div className="text-[10px] text-muted-foreground mt-1">UZS</div>
                      </td>
                      <td className="md:table-cell md:px-3 md:py-2 align-top md:text-right">
                        <span className="md:hidden block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Кам захира", "Low-stock")}</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          readOnly={!canEdit}
                          className="w-full md:w-20 font-mono tabular-nums text-right"
                          value={d.lowStockThreshold}
                          onChange={(e) => setField("lowStockThreshold", e.target.value)}
                        />
                      </td>
                      <td className="md:table-cell md:px-3 md:py-2 align-top md:text-right text-xs text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                        <span className="md:hidden block font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Хосила", "Derived")}</span>
                        <div>{perM3} {t("UZS/м³", "UZS/m³")}</div>
                        <div>{perM3Count} {t("блок/м³", "blocks/m³")}</div>
                      </td>
                      <td className="md:table-cell md:px-3 md:py-2 align-top md:text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="md:hidden block font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("Захира", "Stock")}</span>
                        {p.stock ? formatNumber(p.stock.quantity, 0) : "—"}
                      </td>
                      <td className="col-span-2 md:table-cell md:px-3 md:py-2 align-top md:text-right md:whitespace-nowrap">
                        {canEdit && (
                        <div className="flex flex-wrap md:flex-col md:items-end gap-2 md:gap-1">
                          <Button
                            size="sm"
                            className="h-11 md:h-8"
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
                                  // Operator types mm; catalog stores metres.
                                  lengthM: Number(d.lengthMm) / 1000,
                                  heightM: Number(d.heightMm) / 1000,
                                  thicknessM: Number(d.thicknessMm) / 1000,
                                  pricePerBlock: price,
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
                              className="h-11 md:h-8"
                              variant="outline"
                              disabled={
                                disableProduct.isPending &&
                                disableProduct.variables === p.id
                              }
                              onClick={() => handleArchiveClick(p.id)}
                            >
                              {confirmArchiveId === p.id
                                ? t("Тасдиқлайсизми?", "Confirm?")
                                : t("Архивлаш", "Archive")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-11 md:h-8"
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
                          {patchProduct.isError &&
                            patchProduct.variables?.id === p.id && (
                              <div className="text-[11px] text-destructive text-right max-w-[12rem] whitespace-normal">
                                {uzPart((patchProduct.error as Error).message, lang)}
                              </div>
                            )}
                          {disableProduct.isError &&
                            disableProduct.variables === p.id && (
                              <div className="text-[11px] text-destructive text-right max-w-[12rem] whitespace-normal">
                                {uzPart((disableProduct.error as Error).message, lang)}
                              </div>
                            )}
                        </div>
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

      {/* Add size — dims in MILLIMETRES */}
      {canEdit && (
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Bi uz="Ўлчам қўшиш" en="Add size (mm)" enClassName="font-normal" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t(
              "Ўлчамларни миллиметрда киритинг (масалан 600 × 300 × 200).",
              "Enter dimensions in millimetres (e.g. 600 × 300 × 200).",
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
              inputMode="decimal"
              className="w-28 font-mono tabular-nums text-right"
              placeholder="18 000"
              value={add.pricePerBlock}
              onChange={(e) => setAdd({ ...add, pricePerBlock: e.target.value })}
              onBlur={() => {
                const v = parseMoney(add.pricePerBlock);
                if (v !== null) setAdd({ ...add, pricePerBlock: formatNumber(v, 2) });
              }}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("Кам захира чегараси", "Low-stock threshold")}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-24 tabular-nums"
              placeholder="50"
              value={add.lowStockThreshold}
              onChange={(e) => setAdd({ ...add, lowStockThreshold: e.target.value })}
            />
          </div>
          <Button
            disabled={!addValid || createProduct.isPending}
            onClick={submitAdd}
          >
            {createProduct.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {t("Қўшиш", "Add")}
          </Button>
          {(dupError || createProduct.isError) && (
            <div className="text-sm text-destructive w-full">
              {dupError ?? uzPart((createProduct.error as Error).message, lang)}
            </div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
