"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Trash2, Plus, Copy, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import {
  estimateProject,
  DEFAULT_JOINT_MM,
  DEFAULT_WASTE_PCT,
  DEFAULT_GLUE_KG_PER_M2,
  type WallInput,
  type Opening,
  type ProjectEstimateResult,
  type PerSizeResult,
  type ProjectEstimateOpts,
} from "@/services/gazoblok-engine";

export interface CalcProduct {
  id: string;
  label: string;
  lengthM: number;
  heightM: number;
  thicknessM: number;
  pricePerBlock: number;
}
export interface WallCalcSnapshot {
  walls: WallInput[];
  opts: ProjectEstimateOpts;
  result: ProjectEstimateResult;
}
export interface GazoblokWallCalculatorProps {
  products: CalcProduct[];
  onAddToOrder: (perSize: PerSizeResult[]) => void;
  onSnapshotChange: (snap: WallCalcSnapshot | null) => void;
}

interface OpeningRow {
  kind: Opening["kind"];
  widthM: string;
  heightM: string;
  qty: string;
}
interface WallRow {
  id: string;
  name: string;
  lengthM: string;
  heightM: string;
  productId: string;
  orientation: "STANDARD" | "ROTATED";
  openings: OpeningRow[];
  collapsed: boolean;
}

let _wid = 0;
const newWall = (): WallRow => ({
  id: `w${++_wid}`,
  name: "",
  lengthM: "",
  heightM: "",
  productId: "",
  orientation: "STANDARD",
  openings: [],
  collapsed: false,
});

// Block orientation matters only for asymmetric blocks (height ≠ thickness):
// STANDARD lays the block so the wall thickness = block thickness (course = height),
// ROTATED turns it so the wall thickness = block height (course = thickness).
// Symmetric blocks (height == thickness in cm) offer no meaningful choice → null.
function orientationOptions(p: CalcProduct | undefined) {
  if (!p) return null;
  const hCm = Math.round(p.heightM * 100);
  const tCm = Math.round(p.thicknessM * 100);
  if (hCm === tCm) return null;
  return {
    STANDARD: { wallCm: tCm, courseCm: hCm },
    ROTATED: { wallCm: hCm, courseCm: tCm },
  };
}

// Standard opening presets (bilingual chip labels rendered via t()).
const DOOR_PRESET: OpeningRow = { kind: "DOOR", widthM: "0.9", heightM: "2.1", qty: "1" };
const WINDOW_PRESET: OpeningRow = { kind: "WINDOW", widthM: "1.5", heightM: "1.2", qty: "1" };
const OTHER_PRESET: OpeningRow = { kind: "OTHER", widthM: "", heightM: "", qty: "1" };

export function GazoblokWallCalculator({
  products,
  onAddToOrder,
  onSnapshotChange,
}: GazoblokWallCalculatorProps) {
  const t = useT();

  const [walls, setWalls] = useState<WallRow[]>([newWall()]);
  const [jointMm, setJointMm] = useState(String(DEFAULT_JOINT_MM));
  const [wastePct, setWastePct] = useState(String(DEFAULT_WASTE_PCT));
  const [glueKg, setGlueKg] = useState(String(DEFAULT_GLUE_KG_PER_M2));
  const [advOpen, setAdvOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
  }, []);

  const handleAddToOrder = () => {
    if (added || !result) return;
    onAddToOrder(result.perSize);
    setAdded(true);
    addedTimer.current = setTimeout(() => setAdded(false), 1500);
  };

  // ── Live estimate ─────────────────────────────────────────────
  const productMap = useMemo(
    () =>
      new Map(
        products.map((p) => [
          p.id,
          {
            lengthM: p.lengthM,
            heightM: p.heightM,
            thicknessM: p.thicknessM,
            pricePerBlock: p.pricePerBlock,
            label: p.label,
          },
        ]),
      ),
    [products],
  );

  const opts: ProjectEstimateOpts = {
    jointMm: jointMm.trim() === "" ? undefined : Number(jointMm),
    wastePct: wastePct.trim() === "" ? undefined : Number(wastePct),
    glueKgPerM2: glueKg.trim() === "" ? undefined : Number(glueKg),
  };

  const readyWalls: WallInput[] = useMemo(
    () =>
      walls
        .filter((w) => Number(w.lengthM) > 0 && Number(w.heightM) > 0)
        .map((w) => ({
          id: w.id,
          name: w.name.trim() || undefined,
          lengthM: Number(w.lengthM),
          heightM: Number(w.heightM),
          productId: w.productId,
          orientation: w.orientation,
          openings: w.openings
            .filter((o) => Number(o.widthM) > 0 && Number(o.heightM) > 0 && Number(o.qty) >= 1)
            .map((o) => ({
              kind: o.kind,
              widthM: Number(o.widthM),
              heightM: Number(o.heightM),
              qty: Math.floor(Number(o.qty)),
            })),
        })),
    [walls],
  );

  const result = useMemo<ProjectEstimateResult | null>(() => {
    if (readyWalls.length === 0) return null;
    try {
      return estimateProject(readyWalls, productMap, opts);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyWalls, productMap, jointMm, wastePct, glueKg]);

  useEffect(() => {
    // Snapshot must satisfy the server Zod schema (productId min length 1); a
    // sizeless wall (no block chosen) is tolerated by the engine as a warning
    // but would 422 the whole order — so exclude it from the emitted snapshot.
    const snapshotWalls = readyWalls.filter((w) => w.productId !== "");
    onSnapshotChange(result ? { walls: snapshotWalls, opts, result } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // ── Mutators ──────────────────────────────────────────────────
  const setWall = (id: string, patch: Partial<WallRow>) =>
    setWalls((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const addWall = () => setWalls((ws) => [...ws, newWall()]);
  const dupWall = (id: string) =>
    setWalls((ws) => {
      const w = ws.find((x) => x.id === id);
      return w ? [...ws, { ...w, id: `w${++_wid}` }] : ws;
    });
  const delWall = (id: string) =>
    setWalls((ws) => (ws.length > 1 ? ws.filter((w) => w.id !== id) : ws));
  const addOpening = (id: string, preset: OpeningRow) =>
    setWall(id, { openings: [...(walls.find((w) => w.id === id)?.openings ?? []), { ...preset }] });
  const setOpening = (id: string, idx: number, patch: Partial<OpeningRow>) =>
    setWall(id, {
      openings: (walls.find((w) => w.id === id)?.openings ?? []).map((o, i) =>
        i === idx ? { ...o, ...patch } : o,
      ),
    });
  const delOpening = (id: string, idx: number) =>
    setWall(id, {
      openings: (walls.find((w) => w.id === id)?.openings ?? []).filter((_, i) => i !== idx),
    });

  const openingKindLabel = (kind: Opening["kind"]) =>
    kind === "DOOR"
      ? t("Эшик", "Door")
      : kind === "WINDOW"
        ? t("Дераза", "Window")
        : t("Бошқа", "Custom");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-5 items-start">
      {/* ── Wall builder ──────────────────────────────────────── */}
      <div className="space-y-4">
        {walls.map((w, wi) => {
          const product = w.productId ? products.find((p) => p.id === w.productId) : undefined;
          const oo = orientationOptions(product);
          const activeOrientation = w.orientation ?? "STANDARD";
          const orientationLabel = (o: { wallCm: number; courseCm: number }) =>
            t(`Девор ${o.wallCm}см · қатор ${o.courseCm}см`, `Wall ${o.wallCm}cm · course ${o.courseCm}cm`);
          return (
            <section
              key={w.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <button
                  type="button"
                  aria-label={w.collapsed ? t("Ёйиш", "Expand") : t("Йиғиш", "Collapse")}
                  onClick={() => setWall(w.id, { collapsed: !w.collapsed })}
                  className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${w.collapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {w.name.trim() || `${t("Девор", "Wall")} ${wi + 1}`}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {Number(w.lengthM) > 0 && Number(w.heightM) > 0
                      ? `${formatNumber(Number(w.lengthM), 2)} × ${formatNumber(Number(w.heightM), 2)} м`
                      : t("Ўлчам киритилмаган", "No dimensions")}
                    {oo && ` · ${oo[activeOrientation].wallCm}см девор`}
                  </div>
                </div>
                {product && (
                  <Chip variant="neutral" size="sm" className="shrink-0">
                    {product.label}
                  </Chip>
                )}
                <button
                  type="button"
                  aria-label={t("Нусха олиш", "Duplicate")}
                  onClick={() => dupWall(w.id)}
                  className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("Ўчириш", "Delete")}
                  disabled={walls.length <= 1}
                  onClick={() => delWall(w.id)}
                  className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Expanded body */}
              {!w.collapsed && (
                <div className="p-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-1">
                      <FieldLabel uz="Ном" en="Name" />
                      <Input
                        placeholder={t("Ихтиёрий", "Optional")}
                        value={w.name}
                        onChange={(e) => setWall(w.id, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <FieldLabel uz="Узунлиги (м)" en="Length (m)" />
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        className="tabular-nums"
                        placeholder="0"
                        value={w.lengthM}
                        onChange={(e) => setWall(w.id, { lengthM: e.target.value })}
                      />
                    </div>
                    <div>
                      <FieldLabel uz="Баландлиги (м)" en="Height (m)" />
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        className="tabular-nums"
                        placeholder="0"
                        value={w.heightM}
                        onChange={(e) => setWall(w.id, { heightM: e.target.value })}
                      />
                    </div>
                    <div>
                      <FieldLabel uz="Блок ўлчами" en="Block size" />
                      <Select
                        value={w.productId}
                        onChange={(e) => setWall(w.id, { productId: e.target.value })}
                      >
                        <option value="">
                          {t("Блок ўлчами танланг…", "Select block size…")}
                        </option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  {/* Block orientation — only for asymmetric blocks */}
                  {oo && (
                    <div>
                      <FieldLabel uz="Блок йўналиши" en="Block orientation" />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        {(["STANDARD", "ROTATED"] as const).map((key) => {
                          const active = activeOrientation === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setWall(w.id, { orientation: key })}
                              className={`h-11 md:h-9 px-3 text-xs font-medium tabular-nums transition-colors ${
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card text-muted-foreground hover:bg-accent/40"
                              }`}
                            >
                              {orientationLabel(oo[key])}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Openings */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t("Очиқликлар", "Openings")}
                    </div>
                    {w.openings.map((o, oi) => (
                      <div
                        key={oi}
                        className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-2"
                      >
                        <div className="text-xs font-medium min-w-[64px] pb-2">
                          {openingKindLabel(o.kind)}
                        </div>
                        <div className="w-24">
                          <FieldLabel uz="Эни (м)" en="Width (m)" />
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.1}
                            className="tabular-nums"
                            placeholder="0"
                            value={o.widthM}
                            onChange={(e) => setOpening(w.id, oi, { widthM: e.target.value })}
                          />
                        </div>
                        <div className="w-24">
                          <FieldLabel uz="Бўйи (м)" en="Height (m)" />
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.1}
                            className="tabular-nums"
                            placeholder="0"
                            value={o.heightM}
                            onChange={(e) => setOpening(w.id, oi, { heightM: e.target.value })}
                          />
                        </div>
                        <div className="w-20">
                          <FieldLabel uz="Сони" en="Qty" />
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            className="tabular-nums"
                            placeholder="1"
                            value={o.qty}
                            onChange={(e) => setOpening(w.id, oi, { qty: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={t("Ўчириш", "Delete")}
                          onClick={() => delOpening(w.id, oi)}
                          className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addOpening(w.id, DOOR_PRESET)}
                        className="h-11 md:h-9"
                      >
                        {t("+ Эшик 0,9×2,1", "+ Door 0.9×2.1")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addOpening(w.id, WINDOW_PRESET)}
                        className="h-11 md:h-9"
                      >
                        {t("+ Дераза 1,5×1,2", "+ Window 1.5×1.2")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addOpening(w.id, OTHER_PRESET)}
                        className="h-11 md:h-9"
                      >
                        {t("+ Бошқа", "+ Custom")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}

        <Button type="button" variant="secondary" onClick={addWall} className="h-11 md:h-9">
          <Plus className="h-4 w-4 mr-1" />
          {t("Девор қўшиш", "Add wall")}
        </Button>

        {/* Advanced */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/40 transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("Қўшимча", "Advanced")}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${advOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {advOpen && (
            <div className="p-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel uz="Чок (мм)" en="Joint (mm)" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  className="tabular-nums"
                  placeholder={String(DEFAULT_JOINT_MM)}
                  value={jointMm}
                  onChange={(e) => setJointMm(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel uz="Чиқинди (%)" en="Waste (%)" />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className="tabular-nums"
                  placeholder={String(DEFAULT_WASTE_PCT)}
                  value={wastePct}
                  onChange={(e) => setWastePct(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel uz="Ёпиштиргич (кг/м²)" en="Glue (kg/m²)" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  className="tabular-nums"
                  placeholder={String(DEFAULT_GLUE_KG_PER_M2)}
                  value={glueKg}
                  onChange={(e) => setGlueKg(e.target.value)}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Results ───────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-4">
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("Натижа", "Result")}
          </div>

          {!result ? (
            <p className="text-sm text-muted-foreground italic">
              {t(
                "Ҳисоблаш учун девор ўлчамларини киритинг.",
                "Enter wall dimensions to calculate.",
              )}
            </p>
          ) : (
            <>
              {/* Per-size rows */}
              <div className="space-y-2">
                {result.perSize.map((p) => (
                  <div key={p.productId} className="text-sm border-b border-border pb-2">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      {formatNumber(p.blocksNeeded, 0)} {t("та", "pcs")} ·{" "}
                      {formatNumber(p.volumeM3, 3)} м³
                    </div>
                    <div className="tabular-nums font-semibold mt-0.5">
                      {formatNumber(p.price, 0)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">UZS</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Glue note (info-only) */}
              <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning space-y-0.5">
                <div className="tabular-nums">
                  {t("Ёпиштиргич", "Glue")}: ~{formatNumber(result.glue.kg, 0)} кг ·{" "}
                  {formatNumber(result.glue.bags, 0)} {t("қоп", "bags")}
                </div>
                <div>{t("Тахминий · нархсиз", "Estimate · not priced")}</div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {result.warnings.map((wn, i) => (
                    <div key={i}>
                      <Chip variant="warning" size="sm">
                        {wn.message}
                      </Chip>
                    </div>
                  ))}
                </div>
              )}

              {/* Grand total */}
              <div className="pt-2 border-t border-border space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Жами", "Total")}
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatNumber(result.totalPrice, 0)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">UZS</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {t("Жами блоклар", "Total blocks")}:{" "}
                    <span className="font-medium text-foreground">
                      {formatNumber(result.totalBlocks, 0)}
                    </span>
                  </span>
                  <span>
                    м³:{" "}
                    <span className="font-medium text-foreground">
                      {formatNumber(result.totalVolumeM3, 3)}
                    </span>
                  </span>
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={added || !result || result.totalBlocks <= 0}
                onClick={handleAddToOrder}
              >
                {added ? t("Қўшилди ✓", "Added ✓") : t("Буюртмага қўшиш", "Add to order")}
              </Button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

// ── Small presentational helper (mirrors gazoblok/new/page.tsx) ──
function FieldLabel({ uz, en }: { uz: string; en: string }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider mb-1">
      {uz}
      <span className="lang-en text-[10px] text-muted-foreground font-normal"> · {en}</span>
    </div>
  );
}
