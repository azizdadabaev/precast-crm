"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Info,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  ArrowUpToLine,
  Pencil,
} from "lucide-react";
import {
  calculateSlab,
  projectTotal,
  tierPrice,
  M2_PRICE_TIERS,
  round2,
  type SlabResult,
  type Pattern,
} from "@/services/calculation-engine";
import { Button } from "@/components/ui/button";
import { formatNumber, roundDownToGrid, roundUpToGrid } from "@/lib/utils";
import { useCalculatorStore } from "@/store/calculator";
import { RateOverrideDialog } from "@/components/calculation/RateOverrideDialog";

export interface SlabRow {
  id: string;
  name: string;
  innerWidth: number;
  innerLength: number;
  bearing: number;            // default 0.15
  correction: number;         // default 0
  extraBeams: number;         // default 0
  forceStartBeam: boolean;    // default false
  patternOverride: Pattern | "AUTO";
  result: SlabResult | null;
  /**
   * Engineering-accurate width snapshot for the undersize warning. Set
   * once when the row is created (via Add Room → 0, or via the tapered
   * sandbox prefill → the engine's per-row inner width). NOT updated on
   * manual edits — manual edits ARE the operator's override. Drafts
   * reopened from the DB have this as null because we don't persist it.
   */
  originalWidth: number | null;
  /**
   * Per-row m² rate override. When `m2PriceOverride` is true, the
   * engine's auto-pick from beam length is replaced with
   * `m2PriceOverrideValue` (always a catalog tier price) and `result`'s
   * m2_price / m2_cost / subtotal are recomputed in-place by
   * `recomputeRow`. `m2PriceReason` is the operator's optional note,
   * surfaced on hover in the calculator and stamped into the persisted
   * `Calculation` row at save / order placement time.
   */
  m2PriceOverride: boolean;
  m2PriceOverrideValue: number | null;
  m2PriceReason: string | null;
}

interface Props {
  rows: SlabRow[];
  onChange: (rows: SlabRow[]) => void;
  discountPercent: number;
  onDiscountChange: (pct: number) => void;
}

const PATTERN_LABEL: Record<Pattern, string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

function makeRow(seq: number): SlabRow {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: `Room ${seq}`,
    innerWidth: 0,
    innerLength: 0,
    bearing: 0.15,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: "AUTO",
    result: null,
    // Manual rooms have no engineering ground truth — the operator IS the
    // source. Snapshot is 0 → the undersize warning never fires for them.
    originalWidth: 0,
    // New rooms default to engine auto-pick.
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
  };
}

/** Run the engine for a single row. Returns the row with a fresh `result`,
 *  or `result: null` if the inputs aren't valid yet. Exported so callers
 *  (e.g. the Calculations page when re-opening a saved draft) can fill in
 *  results without having to wait for the user to "wake up" each row. */
export function recomputeRow(row: SlabRow): SlabRow {
  if (!(row.innerWidth > 0 && row.innerLength > 0 && row.bearing >= 0)) {
    return { ...row, result: null };
  }
  try {
    const result = calculateSlab({
      inner_width: row.innerWidth,
      inner_length: row.innerLength,
      bearing: row.bearing,
      correction: row.correction,
      extra_beams: row.extraBeams,
      force_start_beam: row.forceStartBeam,
      pattern: row.patternOverride === "AUTO" ? undefined : row.patternOverride,
    });
    return { ...row, result: applyRateOverride(result, row) };
  } catch {
    return { ...row, result: null };
  }
}

/**
 * If the row has a per-row rate override set, replace the engine's
 * auto-picked m2_price + recompute the dependent m2_cost / subtotal.
 * Defense-in-depth: only apply if the override value is a real catalog
 * tier (Zod enforces this at the API boundary; this is a belt-and-
 * braces check in case the store rehydrates a corrupt value).
 */
function applyRateOverride(result: SlabResult, row: SlabRow): SlabResult {
  if (!row.m2PriceOverride || row.m2PriceOverrideValue == null) return result;
  if (!M2_PRICE_TIERS.some((t) => t.price === row.m2PriceOverrideValue)) {
    return result;
  }
  const newPrice = row.m2PriceOverrideValue;
  const newCost = round2(result.billed_area * newPrice);
  const newSubtotal = round2(
    newCost + result.pattern_extra_cost + result.manual_extra_beams_cost,
  );
  return {
    ...result,
    m2_price: newPrice,
    m2_cost: newCost,
    subtotal: newSubtotal,
  };
}

/** The auto-picked rate for a row, regardless of override state. Used
 *  by the rate dropdown's "Auto" label and the override-indicator
 *  tooltip. Returns 0 when the row hasn't been calculated yet. */
export function autoPickedRate(row: SlabRow): number {
  if (!row.result) return 0;
  if (!row.m2PriceOverride) return row.result.m2_price;
  // result.m2_price has been overridden — recover the auto value from
  // the engine's tier table against the current beam_length.
  return tierPrice(row.result.beam_length, M2_PRICE_TIERS);
}

// Header cell that supports a primary label + a small secondary translation
function H({
  primary,
  secondary,
  tip,
  className,
  align = "center",
}: {
  primary: string;
  secondary?: string;
  tip?: string;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const alignCls = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th title={tip} className={`${alignCls} ${className ?? ""}`}>
      <div className="flex items-center justify-center gap-1 leading-tight">
        <span>{primary}</span>
        {tip && <Info className="h-3 w-3 text-muted-foreground/60" />}
      </div>
      {secondary && (
        <div className="text-[9px] font-normal normal-case text-muted-foreground/70 mt-0.5">
          {secondary}
        </div>
      )}
    </th>
  );
}

export function MultiRoomCalculator({ rows, onChange, discountPercent, onDiscountChange }: Props) {
  // Workspace-level rounding granularity, persisted via the calculator
  // store. One setting applies to every row; survives in-app navigation
  // and is keyed per user (see src/store/calculator.ts).
  const roundingGrid = useCalculatorStore((s) => s.roundingGrid);
  const changeGrid = useCalculatorStore((s) => s.setRoundingGrid);

  const addRow = () => onChange([...rows, makeRow(rows.length + 1)]);
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<SlabRow>) =>
    onChange(rows.map((r) => (r.id === id ? recomputeRow({ ...r, ...updates }) : r)));

  // Per-row rate override flow. Picking a tier opens the confirmation
  // dialog; "auto" reverts immediately (always-safe).
  const [pendingPick, setPendingPick] = useState<{
    rowId: string;
    rate: number;
    autoRate: number;
    initialReason: string | null;
  } | null>(null);

  function handleRatePick(rowId: string, picked: "auto" | number) {
    const room = rows.find((r) => r.id === rowId);
    if (!room) return;
    if (picked === "auto") {
      // Reverting to auto is always safe — clear override fields and
      // let recomputeRow snap m2_price back to the engine's tier.
      updateRow(rowId, {
        m2PriceOverride: false,
        m2PriceOverrideValue: null,
        m2PriceReason: null,
      });
      return;
    }
    // Choosing a tier — confirm before persisting.
    setPendingPick({
      rowId,
      rate: picked,
      autoRate: autoPickedRate(room),
      initialReason: room.m2PriceReason,
    });
  }

  function confirmRatePick(reason: string | null) {
    if (!pendingPick) return;
    updateRow(pendingPick.rowId, {
      m2PriceOverride: true,
      m2PriceOverrideValue: pendingPick.rate,
      m2PriceReason: reason,
    });
    setPendingPick(null);
  }

  const onRoundUp = (id: string) => {
    const room = rows.find((r) => r.id === id);
    if (!room) return;
    updateRow(id, { innerWidth: roundUpToGrid(room.innerWidth, roundingGrid) });
  };
  const onRoundDown = (id: string) => {
    const room = rows.find((r) => r.id === id);
    if (!room) return;
    const next = roundDownToGrid(room.innerWidth, roundingGrid);
    if (next <= 0) return;
    updateRow(id, { innerWidth: next });
  };
  const onRoundAllUp = () => {
    onChange(
      rows.map((r) => {
        if (r.innerWidth <= 0) return r;
        return recomputeRow({
          ...r,
          innerWidth: roundUpToGrid(r.innerWidth, roundingGrid),
        });
      }),
    );
  };
  const anyRowEligibleForSweep = rows.some((r) => r.innerWidth > 0);

  const totals = useMemo(() => {
    const valid = rows.map((r) => r.result).filter((r): r is SlabResult => !!r);
    const projTotal = projectTotal(valid, discountPercent);
    const beams = valid.reduce((s, r) => s + r.beam_count, 0);
    const blocks = valid.reduce((s, r) => s + r.total_blocks, 0);
    const monolithLength = valid.reduce((s, r) => s + r.monolith_length, 0);
    const monolithArea = valid.reduce((s, r) => s + r.monolith_area, 0);
    const concrete = valid.reduce((s, r) => s + r.concrete_volume, 0);
    return { projTotal, beams, blocks, monolithLength, monolithArea, concrete };
  }, [rows, discountPercent]);

  const schedule = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      if (!r.result) continue;
      const len = r.result.beam_length.toFixed(2);
      acc[len] = (acc[len] ?? 0) + r.result.beam_count;
    }
    return Object.entries(acc).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Toolbar — rounding grid selector + bulk snap-up. Sits above the
          table so the choice is obvious; per-row arrows reflect this grid. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Лабораторий ўлчам · Round to
          </span>
          <div className="flex rounded-md border bg-background overflow-hidden text-xs">
            <button
              type="button"
              className={`px-3 h-7 font-semibold uppercase tracking-wider transition-colors ${
                roundingGrid === 0.1
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => changeGrid(0.1)}
            >
              10 см
            </button>
            <button
              type="button"
              className={`px-3 h-7 font-semibold uppercase tracking-wider transition-colors ${
                roundingGrid === 0.05
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => changeGrid(0.05)}
            >
              5 см
            </button>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!anyRowEligibleForSweep}
          onClick={onRoundAllUp}
          title="Apply round-up to every row's Width using the current grid"
        >
          <ArrowUpToLine className="h-3.5 w-3.5 mr-1.5" />
          Барча хоналарни юқорилаштириш · Round all up
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto bg-background shadow-sm">
        <table className="calc-grid">
          {/* Explicit column widths — table-layout: fixed honors these exactly */}
          <colgroup>
            <col width={108} />  {/* Хона          */}
            <col width={104} />  {/* Эни (input + 2 arrows + warning) */}
            <col width={56} />   {/* Бўйи          */}
            <col width={62} />   {/* Миниш         */}
            <col width={62} />   {/* Корр.         */}
            <col width={104} />  {/* Шаблон        */}
            <col width={48} />   {/* +Б            */}
            <col width={56} />   {/* Бош Б.        */}
            <col width={62} />   {/* Б.уз.         */}
            <col width={56} />   {/* Қадам         */}
            <col width={56} />   {/* 1 қат.        */}
            <col width={56} />   {/* Балка         */}
            <col width={56} />   {/* Қатор         */}
            <col width={64} />   {/* Жами ғишт     */}
            <col width={70} />   {/* Йиғма Б.      */}
            <col width={78} />   {/* Майдон        */}
            <col width={108} />  {/* м² нархи (Select + native arrow + pencil) */}
            <col width={96} />   {/* Сумма         */}
            <col width={36} />   {/* delete        */}
          </colgroup>

          <thead>
            <tr>
              {/* ── Inputs ── */}
              <H primary="Хона" secondary="Name" align="left" className="bg-amber-50/40" />
              <H primary="Эни" secondary="Width" tip="Inner width — clear inside-wall to inside-wall (m)" className="bg-amber-50/40" />
              <H primary="Бўйи" secondary="Length" tip="Inner length (m)" className="bg-amber-50/40" />
              <H primary="Миниш" secondary="Bearing" tip="Beam bearing onto each wall (m). Default 0.15" className="bg-amber-50/40" />
              <H primary="Корр." secondary="Correction" tip="Correction added to L before pitch math (m). Use to nudge auto-pattern." className="bg-amber-50/40 grid-group-divider" />

              {/* ── Pattern ── */}
              <H primary="Шаблон" secondary="Pattern" className="bg-sky-50/40" />
              <H primary="+Б" secondary="Extra" tip="Manual extra beams. First one absorbs into pattern when Г-Б-Г." className="bg-sky-50/40" />
              <H primary="Бош Б." secondary="Start" tip="Force a starting beam: Г-Б→Б-Г-Б, Г-Б-Г→Г-Б at N+1, Б-Г-Б no-op" className="bg-sky-50/40 grid-group-divider" />

              {/* ── Computed ── */}
              <H primary="Б.уз." secondary="Beam L" />
              <H primary="Қадам" secondary="Pitches" />
              <H primary="1 қат." secondary="Per row" />
              <H primary="Балка" secondary="Beams" />
              <H primary="Қатор" secondary="Rows" />
              <H primary="Жами" secondary="Blocks" />
              <H primary="Йиғма Б." secondary="Slab L" />
              <H primary="Майдон" secondary="Slab area" className="grid-group-divider" />

              {/* ── Pricing ── */}
              <H primary="м² нархи" secondary="Rate" tip="UZS per m² of billed area, by beam length tier" className="bg-emerald-50/40" />
              <H primary="Сумма" secondary="Subtotal" className="bg-emerald-50/40" />
              <th className="bg-emerald-50/40"></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const r = row.result;
              const fmt = (v: number, d = 2) => formatNumber(v, d);
              return (
                <tr key={row.id}>
                  {/* Inputs */}
                  <td className="grid-cell grid-tint-input">
                    <input
                      className="grid-input is-text"
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      placeholder="Room name"
                    />
                  </td>
                  <td className="grid-cell grid-tint-input">
                    <WidthCell
                      row={row}
                      onWidthChange={(w) => updateRow(row.id, { innerWidth: w })}
                      onRoundUp={() => onRoundUp(row.id)}
                      onRoundDown={() => onRoundDown(row.id)}
                    />
                  </td>
                  <td className="grid-cell grid-tint-input">
                    <input
                      type="number"
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.innerLength || ""}
                      onChange={(e) => updateRow(row.id, { innerLength: Number(e.target.value) })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="grid-cell grid-tint-input">
                    <input
                      type="number"
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.bearing}
                      onChange={(e) => updateRow(row.id, { bearing: Number(e.target.value) })}
                    />
                  </td>
                  <td className="grid-cell grid-tint-input grid-group-divider">
                    <input
                      type="number"
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.correction}
                      onChange={(e) => updateRow(row.id, { correction: Number(e.target.value) })}
                    />
                  </td>

                  {/* Pattern controls — resolved pattern always shown first
                      so even if truncated, the part the site crew uses stays visible */}
                  <td className="grid-cell grid-tint-pattern">
                    <select
                      className="grid-select font-semibold text-sky-900"
                      value={row.patternOverride}
                      onChange={(e) =>
                        updateRow(row.id, { patternOverride: e.target.value as Pattern | "AUTO" })
                      }
                    >
                      <option value="AUTO">
                        {r ? `${PATTERN_LABEL[r.pattern]} · auto` : "Auto"}
                      </option>
                      <option value="GB">
                        {r && r.pattern === "BGB" && row.forceStartBeam
                          ? "Г-Б → Б-Г-Б"
                          : "Г-Б"}
                      </option>
                      <option value="BGB">Б-Г-Б</option>
                      <option value="GBG">
                        {r && r.pattern === "GB" && row.patternOverride === "GBG"
                          ? "Г-Б-Г → Г-Б"
                          : "Г-Б-Г"}
                      </option>
                    </select>
                  </td>
                  <td className="grid-cell grid-tint-pattern">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="grid-input is-numeric"
                      value={row.extraBeams}
                      onChange={(e) =>
                        updateRow(row.id, {
                          extraBeams: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </td>
                  <td className="grid-cell grid-tint-pattern grid-group-divider text-center">
                    <label className="inline-flex items-center justify-center h-8 w-full cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary cursor-pointer"
                        checked={row.forceStartBeam}
                        onChange={(e) => updateRow(row.id, { forceStartBeam: e.target.checked })}
                      />
                    </label>
                  </td>

                  {/* Computed — all centered to align with their headers */}
                  <td className="grid-cell px-2 text-center tabular-nums text-emerald-700 font-semibold">
                    {r ? fmt(r.beam_length) : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums text-muted-foreground">
                    {r ? r.pitches : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums">
                    {r?.blocks_per_row ?? "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums font-semibold">
                    {r?.beam_count ?? "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums">
                    {r?.block_rows ?? "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums text-orange-700 font-semibold">
                    {r?.total_blocks ?? "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums text-xs text-blue-700">
                    {r ? `${fmt(r.monolith_length)} m` : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums text-xs text-blue-700 grid-group-divider">
                    {r ? `${fmt(r.monolith_area)} m²` : "—"}
                  </td>

                  {/* Pricing — rate is editable per-row, catalog-only */}
                  <td className="grid-cell px-2 text-center tabular-nums text-xs grid-tint-pricing">
                    {r ? (
                      <RateCell
                        row={row}
                        onPick={(picked) => handleRatePick(row.id, picked)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums font-bold text-emerald-800 grid-tint-pricing">
                    {r ? fmt(r.subtotal, 0) : "—"}
                  </td>
                  <td className="grid-cell text-center grid-tint-pricing">
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove room"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-sm italic">No rooms yet.</div>
                    <Button variant="outline" size="sm" onClick={addRow}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add the first room
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              {/*
                Column layout (19 cols):
                  1 Name | 2 W | 3 L | 4 Bear | 5 Corr | 6 Pattern | 7 +B | 8 StartB
                  | 9 BeamL | 10 Pitches | 11 Blks/row | 12 Beams | 13 Block rows
                  | 14 Total blks | 15 Slab L | 16 Slab area | 17 m² rate
                  | 18 Subtotal | 19 (delete)
              */}
              <tr className="bg-muted/40 font-bold">
                <td colSpan={11} className="px-3 text-right uppercase text-[11px] tracking-wider text-muted-foreground">
                  Жами · Totals
                </td>
                {/* col 12: Beams */}
                <td className="text-center px-2 tabular-nums">{totals.beams}</td>
                {/* col 13: Block rows */}
                <td></td>
                {/* col 14: Total blocks */}
                <td className="text-center px-2 tabular-nums text-orange-700">{totals.blocks}</td>
                {/* col 15: Slab L */}
                <td className="text-center px-2 tabular-nums text-xs">
                  {formatNumber(totals.monolithLength, 2)} m
                </td>
                {/* col 16: Slab area */}
                <td className="text-center px-2 tabular-nums text-xs text-blue-700">
                  {formatNumber(totals.monolithArea, 2)} m²
                </td>
                {/* col 17: m² rate */}
                <td></td>
                {/* col 18: Subtotal */}
                <td className="text-center px-2 tabular-nums text-emerald-800">
                  {formatNumber(totals.projTotal.rooms_subtotal, 0)}
                </td>
                {/* col 19: delete */}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length > 0 && (
        <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add room · Янги хона
        </Button>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Discount + grand total */}
          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Сўнгги нархи · Grand Total
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Жами хоналар · Rooms subtotal</span>
                <span className="font-semibold tabular-nums">
                  {formatNumber(totals.projTotal.rooms_subtotal, 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Чегирма % · Discount</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="grid-input is-numeric h-8 w-20 rounded border border-input pr-5"
                    value={discountPercent}
                    onChange={(e) =>
                      onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                    }
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    %
                  </span>
                </div>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span className="text-muted-foreground">Чегирма суммаси · Discount amount</span>
                  <span className="tabular-nums">
                    − {formatNumber(totals.projTotal.discount_amount, 0)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t pt-2.5 mt-2">
                <span className="font-bold">Сумма · Total</span>
                <span className="font-black text-emerald-700 text-xl tabular-nums">
                  {formatNumber(totals.projTotal.total, 0)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">UZS</span>
                </span>
              </div>
            </div>
          </div>

          {/* Production list — beams (by length) AND total blocks together */}
          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Балка + Ғишт · Production list
            </h3>
            <div className="space-y-1.5">
              {schedule.map(([len, qty]) => (
                <div
                  key={len}
                  className="flex justify-between items-center bg-muted/30 rounded px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold tabular-nums">
                    Балка <span className="text-muted-foreground font-normal">·</span> {len} m
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold tabular-nums">
                    {qty} pcs
                  </span>
                </div>
              ))}
              {schedule.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No beams yet.</div>
              )}
              {totals.blocks > 0 && (
                <div className="flex justify-between items-center bg-orange-50/60 rounded px-3 py-1.5 text-sm border-t-2 border-orange-200/60 mt-2">
                  <span className="font-semibold">
                    Ғишт <span className="text-muted-foreground font-normal">· total blocks</span>
                  </span>
                  <span className="text-xs bg-orange-500/15 text-orange-800 px-2 py-0.5 rounded font-semibold tabular-nums">
                    {totals.blocks} pcs
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Materials — concrete + area only (counts moved into the production list) */}
          <div className="rounded-lg border bg-background p-4 shadow-sm">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Материаллар · Materials
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Бетон қатлами · Concrete topping</span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  {totals.concrete.toFixed(2)} m³
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Йиғма майдон · Slab area</span>
                <span className="font-semibold tabular-nums">
                  {formatNumber(totals.monolithArea, 2)} m²
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <RateOverrideDialog
        open={!!pendingPick}
        onClose={() => setPendingPick(null)}
        autoRate={pendingPick?.autoRate ?? 0}
        selectedRate={pendingPick?.rate ?? 0}
        initialReason={pendingPick?.initialReason ?? null}
        onConfirm={confirmRatePick}
      />
    </div>
  );
}

// ── Rate cell — Select dropdown + Pencil indicator on overridden rows ──
//
// "Auto" is always present at the top of the list; its label shows the
// engine's auto-picked tier so the operator can read off the current
// rate even when an override is active. Selecting a non-Auto tier
// triggers the parent's confirmation dialog. Reverting to Auto applies
// immediately (no dialog — always safe). Per spec, table density is
// preserved: overridden rows show ONE small Pencil icon and amber text;
// no subtitle, no extra rows.
function RateCell({
  row,
  onPick,
}: {
  row: SlabRow;
  onPick: (picked: "auto" | number) => void;
}) {
  const r = row.result;
  if (!r) return <>—</>;

  const auto = autoPickedRate(row);
  const overridden = row.m2PriceOverride;
  const value = overridden ? String(r.m2_price) : "auto";

  const tooltip = overridden
    ? `Auto: ${formatNumber(auto, 0)} (${
        r.m2_price > auto ? "↑ markup" : "↓ discount"
      })${row.m2PriceReason ? `. Reason: ${row.m2PriceReason}` : ""}`
    : undefined;

  return (
    <div
      className={`flex items-center justify-center gap-1 ${
        overridden ? "text-amber-700 font-semibold" : ""
      }`}
      title={tooltip}
    >
      <select
        className="grid-input is-numeric w-full min-w-0 text-center bg-transparent cursor-pointer pr-1"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onPick(v === "auto" ? "auto" : Number(v));
        }}
      >
        <option value="auto">
          {overridden
            ? `Авто (${formatNumber(auto, 0)})`
            : `${formatNumber(auto, 0)} (auto)`}
        </option>
        {M2_PRICE_TIERS.map((t) => (
          <option key={t.price} value={String(t.price)}>
            {formatNumber(t.price, 0)}
          </option>
        ))}
      </select>
      {overridden && (
        <Pencil
          className="h-3 w-3 text-amber-600 shrink-0"
          aria-label="Rate override"
        />
      )}
    </div>
  );
}

// ── Width input cell with snap-up/down arrows + undersize warning ──
//
// Pulled into its own component so the row body stays scannable. The
// arrows reflect the parent's `roundingGrid`; clicking either one drives
// updateRow via the parent. The warning fires only when the engine had a
// meaningful original (originalWidth > 0) AND the current width has been
// rounded BELOW it — manual rooms (originalWidth = 0) never warn.
function WidthCell({
  row,
  onWidthChange,
  onRoundUp,
  onRoundDown,
}: {
  row: SlabRow;
  onWidthChange: (w: number) => void;
  onRoundUp: () => void;
  onRoundDown: () => void;
}) {
  const original = row.originalWidth ?? 0;
  const undersized = original > 0 && row.innerWidth > 0 && row.innerWidth < original;
  const differs =
    original > 0 && row.innerWidth > 0 && Math.abs(row.innerWidth - original) > 1e-6;
  const inputTitle = differs
    ? `Аслида: ${formatNumber(original, 3)} м · Originally calculated: ${formatNumber(original, 3)} m`
    : undefined;
  const warningTitle = `Ўлчам аслидан кичикроқ (${formatNumber(original, 3)} → ${formatNumber(row.innerWidth, 3)}). Девордан ўтмаслик мумкин. · Width is smaller than original (${formatNumber(original, 3)} → ${formatNumber(row.innerWidth, 3)}). May not reach the wall — verify.`;

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        className="grid-input is-numeric flex-1 min-w-0"
        value={row.innerWidth || ""}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        placeholder="0.00"
        title={inputTitle}
      />
      <div className="flex flex-col gap-px">
        <button
          type="button"
          aria-label="Юқорилаштириш · Round up"
          title="Round up"
          onClick={onRoundUp}
          className="h-3 w-4 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-muted text-muted-foreground"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Тушириш · Round down"
          title="Round down"
          onClick={onRoundDown}
          className="h-3 w-4 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-muted text-muted-foreground"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      {undersized ? (
        <span
          role="img"
          aria-label={warningTitle}
          title={warningTitle}
          className="inline-flex items-center justify-center text-amber-600 shrink-0"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden />
      )}
    </div>
  );
}
