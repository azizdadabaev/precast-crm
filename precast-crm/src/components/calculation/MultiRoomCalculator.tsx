"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NumberInput } from "@/components/calculation/NumberInput";

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
  /**
   * Page-level action buttons (Clear / Save Project / Place Order)
   * rendered inline in the post-table toolbar, immediately after
   * the "+ Add room" button. The page owns the click handlers; the
   * calculator just hosts them so the toolbar visually snaps to
   * the table without crossing component boundaries.
   */
  actions?: React.ReactNode;
}

// ── Column registry ─────────────────────────────────────────
//
// Stable IDs for the 19 columns. Used by the Customize Layout
// feature to persist user-chosen order + widths in the calculator
// store. Body / header / footer rendering all map over the active
// order; the per-cell rendering still lives inline below as a switch
// on these ids.
//
// Add a new column = add an id, add a COLUMN_DEFS entry, add a case
// to renderHeaderCell/renderBodyCell/renderFooterCell.

type ColumnId =
  | "name"
  | "width"
  | "length"
  | "bearing"
  | "correction"
  | "slabL"
  | "pattern"
  | "extras"
  | "startBeam"
  | "beamL"
  | "pitches"
  | "blockRows"
  | "blocksPerRow"
  | "totalBlocks"
  | "beams"
  | "slabArea"
  | "rate"
  | "subtotal"
  | "deleteCol";

interface ColumnDef {
  /** Default px width when the user hasn't overridden. */
  defaultWidth: number;
  /** Cyrillic primary header label. */
  primary: string;
  /** English secondary header label. */
  secondary: string;
  /** Optional info-icon tooltip text on the header. */
  tip?: string;
  /** Optional className for the <th> (tints, dividers, etc.). */
  headerCls?: string;
  /** Excluded from the Customize panel's width inputs (e.g. delete cell). */
  pinned?: boolean;
}

const COLUMN_DEFS: Record<ColumnId, ColumnDef> = {
  name: { defaultWidth: 86, primary: "Хона", secondary: "Name", headerCls: "bg-amber-50/40 dark:bg-amber-950/30 text-left" },
  width: { defaultWidth: 104, primary: "Эни", secondary: "Width", tip: "Inner width — clear inside-wall to inside-wall (m)" },
  length: { defaultWidth: 56, primary: "Бўйи", secondary: "Length", tip: "Inner length (m)" },
  bearing: { defaultWidth: 62, primary: "Миниш", secondary: "Bearing", tip: "Beam bearing onto each wall (m). Default 0.15", headerCls: "bg-amber-50/40 dark:bg-amber-950/30" },
  correction: { defaultWidth: 62, primary: "Корр.", secondary: "Correction", tip: "Correction added to L before pitch math (m). Use to nudge auto-pattern.", headerCls: "bg-amber-50/40 dark:bg-amber-950/30 grid-group-divider" },
  slabL: { defaultWidth: 70, primary: "Йиғма Б.", secondary: "Slab L" },
  pattern: { defaultWidth: 104, primary: "Шаблон", secondary: "Pattern", headerCls: "bg-sky-50/40 dark:bg-sky-950/30" },
  extras: { defaultWidth: 48, primary: "+Б", secondary: "Extra", tip: "Manual extra beams. First one absorbs into pattern when Г-Б-Г.", headerCls: "bg-sky-50/40 dark:bg-sky-950/30" },
  startBeam: { defaultWidth: 56, primary: "Бош Б.", secondary: "Start", tip: "Force a starting beam: Г-Б→Б-Г-Б, Г-Б-Г→Г-Б at N+1, Б-Г-Б no-op", headerCls: "bg-sky-50/40 dark:bg-sky-950/30 grid-group-divider" },
  beamL: { defaultWidth: 62, primary: "Б.уз.", secondary: "Beam L" },
  pitches: { defaultWidth: 56, primary: "Қадам", secondary: "Pitches" },
  blockRows: { defaultWidth: 56, primary: "Қатор", secondary: "Rows", headerCls: "bg-amber-100 dark:bg-amber-900/40" },
  blocksPerRow: { defaultWidth: 56, primary: "1 қат.", secondary: "Per row", headerCls: "bg-amber-100 dark:bg-amber-900/40" },
  totalBlocks: { defaultWidth: 64, primary: "Жами", secondary: "Blocks", headerCls: "bg-amber-100 dark:bg-amber-900/40" },
  beams: { defaultWidth: 56, primary: "Балка", secondary: "Beams" },
  slabArea: { defaultWidth: 78, primary: "Майдон", secondary: "Slab area", headerCls: "grid-group-divider" },
  rate: { defaultWidth: 108, primary: "м² нархи", secondary: "Rate", tip: "UZS per m² of billed area, by beam length tier", headerCls: "bg-emerald-50/40" },
  subtotal: { defaultWidth: 80, primary: "Сумма", secondary: "Subtotal", headerCls: "bg-emerald-50/40" },
  deleteCol: { defaultWidth: 36, primary: "", secondary: "", headerCls: "bg-emerald-50/40", pinned: true },
};

const DEFAULT_COLUMN_ORDER: readonly ColumnId[] = [
  "name", "width", "length", "bearing", "correction",
  "slabL",
  "pattern", "extras", "startBeam",
  "beamL", "pitches", "blockRows", "blocksPerRow", "totalBlocks", "beams",
  "slabArea",
  "rate", "subtotal", "deleteCol",
];

const COLUMN_MIN_WIDTH = 32;
const COLUMN_MAX_WIDTH = 320;

/** Resolve effective width for a column from the user's overrides or default. */
function widthForColumn(id: ColumnId, overrides: Record<string, number> | null): number {
  const stored = overrides?.[id];
  if (typeof stored === "number" && Number.isFinite(stored)) {
    return Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, stored));
  }
  return COLUMN_DEFS[id].defaultWidth;
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
  // Accept either a real slab (length>0) OR extras-only (length=0 + extras>=1).
  // Width and bearing always required; bearing of 0 is valid for "no bearing".
  const hasSlab = row.innerLength > 0;
  const hasExtrasOnly = row.innerLength === 0 && row.extraBeams >= 1;
  if (!(row.innerWidth > 0 && row.bearing >= 0 && (hasSlab || hasExtrasOnly))) {
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

// Feature flag for the Customize-Layout toolbar button + side panel.
// Operators have settled on the default column widths so the button
// was retired from the page. Keeping the underlying state, panel
// JSX, and store fields intact means flipping this back to `true`
// restores the feature in one line — no code archaeology needed.
const SHOW_CUSTOMIZE_LAYOUT = false;

export function MultiRoomCalculator({ rows, onChange, discountPercent, onDiscountChange, actions }: Props) {
  // Workspace-level rounding granularity, persisted via the calculator
  // store. One setting applies to every row; survives in-app navigation
  // and is keyed per user (see src/store/calculator.ts).
  const roundingGrid = useCalculatorStore((s) => s.roundingGrid);
  const changeGrid = useCalculatorStore((s) => s.setRoundingGrid);

  // Customize-layout: per-user column WIDTH overrides (order is fixed).
  // `isCustomizingLayout` is a transient toggle for the panel. Gated
  // by SHOW_CUSTOMIZE_LAYOUT above — currently hidden from the UI.
  const storedColumnWidths = useCalculatorStore((s) => s.columnWidths);
  const setColumnWidths = useCalculatorStore((s) => s.setColumnWidths);
  const [isCustomizingLayout, setIsCustomizingLayout] = useState(false);
  const columnWidthOf = useCallback(
    (id: ColumnId) => widthForColumn(id, storedColumnWidths),
    [storedColumnWidths],
  );

  const commitColumnWidth = useCallback(
    (id: ColumnId, px: number) => {
      const clamped = Math.max(
        COLUMN_MIN_WIDTH,
        Math.min(COLUMN_MAX_WIDTH, Math.round(px)),
      );
      setColumnWidths({ ...(storedColumnWidths ?? {}), [id]: clamped });
    },
    [setColumnWidths, storedColumnWidths],
  );

  const resetLayout = useCallback(() => {
    setColumnWidths(null);
  }, [setColumnWidths]);

  /**
   * The row id whose Width input should focus on the next render.
   * Set by `addRow` and the Shift+Enter shortcut; cleared by the
   * `WidthCell` once it has focused its input. Single-shot — never
   * re-fires on subsequent renders for the same id.
   */
  const [focusPendingId, setFocusPendingId] = useState<string | null>(null);

  const addRow = () => {
    const newRow = makeRow(rows.length + 1);
    onChange([...rows, newRow]);
    setFocusPendingId(newRow.id);
  };
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<SlabRow>) =>
    onChange(rows.map((r) => (r.id === id ? recomputeRow({ ...r, ...updates }) : r)));

  // ── Auto-create a blank Room 1 whenever rows is empty. ──
  // Triggers on:
  //   - first visit (autosaved store hydrates to []),
  //   - after Clear (clearAll wipes rows),
  //   - after Place Order / Save edits success (also clearAll),
  //   - if the operator deletes every room manually.
  // Result: the calculator never shows an empty "No rooms yet" state;
  // the operator always lands on a blank row they can type over.
  useEffect(() => {
    if (rows.length === 0) {
      onChange([makeRow(1)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  // ── Shift+Enter shortcut: add a new row + focus its Width input. ──
  // Listener is global on the page (works regardless of which cell
  // has focus), but it lives inside this component so it tears down
  // automatically when the calculator unmounts. Refs avoid the
  // empty-deps stale-closure problem on `rows` / `onChange`.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !e.shiftKey) return;
      // Don't fire while typing inside a textarea (none today, but
      // be defensive — Shift+Enter inserts a newline there).
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      e.preventDefault();
      const newRow = makeRow(rowsRef.current.length + 1);
      onChangeRef.current([...rowsRef.current, newRow]);
      setFocusPendingId(newRow.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
    <div className="space-y-3">

      {isCustomizingLayout && (
        <div className="rounded-lg border bg-card shadow-sm p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Устунлар тартиби · Customize layout
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adjust each column&apos;s width in pixels. Changes persist
                per-user. Click Reset to restore defaults.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetLayout}
                disabled={!storedColumnWidths}
                title="Restore default column widths"
              >
                Reset to defaults
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCustomizingLayout(false)}
              >
                Done
              </Button>
            </div>
          </div>

          {/* Per-column width inputs. Order is fixed; only widths are
              user-customizable. */}
          <div className="border-t pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Column widths (px)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
              {DEFAULT_COLUMN_ORDER.map((id) => {
                const def = COLUMN_DEFS[id];
                if (def.pinned) return null; // delete column not user-resizable
                const w = columnWidthOf(id);
                const isCustom =
                  typeof storedColumnWidths?.[id] === "number" &&
                  storedColumnWidths[id] !== def.defaultWidth;
                return (
                  <label
                    key={id}
                    className="flex items-center justify-between gap-2 text-sm py-1"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{def.primary}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        · {def.secondary}
                      </span>
                    </span>
                    <input
                      type="number"
                      min={COLUMN_MIN_WIDTH}
                      max={COLUMN_MAX_WIDTH}
                      step={4}
                      value={w}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) commitColumnWidth(id, next);
                      }}
                      className={`w-20 h-8 rounded border bg-background px-2 text-sm tabular-nums text-right ${
                        isCustom
                          ? "border-primary/60"
                          : "border-input"
                      }`}
                    />
                    <span className="text-[10px] text-muted-foreground w-6 text-right">
                      {def.defaultWidth}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Outer wrapper so the right-edge scroll affordance can pin to
          the visible area regardless of the inner scroll position.
          `relative` here only — the inner scroll container is unchanged
          on desktop (overflow-x-auto already existed). */}
      <div className="relative">
      <div className="rounded-lg border border-border overflow-x-auto bg-background shadow-sm">
        <table className="calc-grid">
          {/* Colgroup — order is fixed (DEFAULT_COLUMN_ORDER), widths
              come from `columnWidths` in the store with sensible
              defaults. Width and Length keep their `w-11` mobile
              class so the sticky 44 px works regardless of any
              custom override (the override applies on desktop where
              the column isn't sticky). */}
          <colgroup>
            {DEFAULT_COLUMN_ORDER.map((id) => {
              const w = columnWidthOf(id);
              const responsive =
                id === "width" || id === "length" ? "w-11 lg:w-auto" : undefined;
              return (
                <col
                  key={id}
                  className={responsive}
                  style={{ width: `${w}px` }}
                />
              );
            })}
          </colgroup>

          <thead>
            <tr>
              {/* ── Inputs ── */}
              <H primary="Хона" secondary="Name" align="left" className="bg-amber-50/40" />
              <H
                primary="Эни"
                secondary="Width"
                tip="Inner width — clear inside-wall to inside-wall (m)"
                className="sticky lg:static left-0 z-20 !bg-muted lg:!bg-amber-50/40"
              />
              <H
                primary="Бўйи"
                secondary="Length"
                tip="Inner length (m)"
                className="sticky lg:static left-11 lg:left-[104px] z-20 !bg-muted lg:!bg-amber-50/40 lg:shadow-none shadow-[inset_-2px_0_0_0_rgba(0,0,0,0.06)]"
              />
              <H primary="Миниш" secondary="Bearing" tip="Beam bearing onto each wall (m). Default 0.15" className="bg-amber-50/40" />
              <H primary="Корр." secondary="Correction" tip="Correction added to L before pitch math (m). Use to nudge auto-pattern." className="bg-amber-50/40 grid-group-divider" />
              <H primary="Йиғма Б." secondary="Slab L" />

              {/* ── Pattern ── */}
              <H primary="Шаблон" secondary="Pattern" className="bg-sky-50/40" />
              <H primary="+Б" secondary="Extra" tip="Manual extra beams. First one absorbs into pattern when Г-Б-Г." className="bg-sky-50/40" />
              <H primary="Бош Б." secondary="Start" tip="Force a starting beam: Г-Б→Б-Г-Б, Г-Б-Г→Г-Б at N+1, Б-Г-Б no-op" className="bg-sky-50/40 grid-group-divider" />

              {/* ── Computed ── */}
              <H primary="Б.уз." secondary="Beam L" />
              <H primary="Қадам" secondary="Pitches" />
              <H primary="Қатор" secondary="Rows" className="bg-amber-100" />
              <H primary="1 қат." secondary="Per row" className="bg-amber-100" />
              <H primary="Жами" secondary="Blocks" className="bg-amber-100" />
              <H primary="Балка" secondary="Beams" />
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
                    {/* On <lg the row's round-up/down arrows live here
                        instead of inside Width — see RowRoundArrows
                        for the why. The input still stretches to the
                        cell with `flex-1 min-w-0` so long names ellipsis
                        truncate; the arrow stack stays put via
                        `flex-shrink-0`. Desktop hides the arrows so
                        the Name cell is just the input, exactly as
                        before. */}
                    <div className="flex items-center gap-1">
                      <input
                        className="grid-input is-text flex-1 min-w-0"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        placeholder="Room name"
                      />
                      <div className="lg:hidden flex-shrink-0">
                        <RowRoundArrows
                          onUp={() => onRoundUp(row.id)}
                          onDown={() => onRoundDown(row.id)}
                          size="md"
                        />
                      </div>
                    </div>
                  </td>
                  {/* Width: sticky on <lg so it pins as the user scrolls
                      the rest of the row sideways. Bg is opaque on
                      mobile, transparent-amber on desktop (matches the
                      surrounding grid-tint-input column). */}
                  <td className="grid-cell sticky lg:static left-0 z-10 bg-amber-50 lg:bg-amber-50/40">
                    <WidthCell
                      row={row}
                      onWidthChange={(w) => updateRow(row.id, { innerWidth: w })}
                      onRoundUp={() => onRoundUp(row.id)}
                      onRoundDown={() => onRoundDown(row.id)}
                      shouldFocus={row.id === focusPendingId}
                      onFocused={() => setFocusPendingId(null)}
                    />
                  </td>
                  {/* Length: second sticky col, offset by Width's 104 px.
                      Right-edge inset shadow on mobile draws the
                      "frozen boundary" line. */}
                  <td className="grid-cell sticky lg:static left-11 lg:left-[104px] z-10 bg-amber-50 lg:bg-amber-50/40 lg:shadow-none shadow-[inset_-2px_0_0_0_rgba(0,0,0,0.06)]">
                    <NumberInput
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.innerLength}
                      onChange={(n) => updateRow(row.id, { innerLength: n })}
                      placeholder="0.00"
                      showZeroAsEmpty
                    />
                  </td>
                  <td className="grid-cell grid-tint-input">
                    <NumberInput
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.bearing}
                      onChange={(n) => updateRow(row.id, { bearing: n })}
                    />
                  </td>
                  <td className="grid-cell grid-tint-input grid-group-divider">
                    <NumberInput
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.correction}
                      onChange={(n) => updateRow(row.id, { correction: n })}
                    />
                  </td>

                  {/* Slab L (monolith_length) — moved here from after
                      Beams so the resulting span sits next to the
                      input dimensions that produce it. */}
                  <td className="grid-cell px-2 text-center tabular-nums text-xs text-blue-700">
                    {r ? `${fmt(r.monolith_length)} m` : "—"}
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
                    <NumberInput
                      min="0"
                      step="1"
                      className="grid-input is-numeric"
                      value={row.extraBeams}
                      onChange={(n) => updateRow(row.id, { extraBeams: n })}
                      integer
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

                  {/* Computed — all centered to align with their headers.
                      Order matches the header above: Beam L → Pitches
                      → Rows → Per Row → Blocks → Beams. Cell bodies
                      have no amber tint — header background carries
                      the grouping signal. The "Blocks" cell drops the
                      previous orange text tint so the totals row can
                      own the per-block color emphasis.
                      Extras-only rows (length=0 + extras>=1) zero-out
                      pattern/pitch/m² fields; render those columns as
                      em-dashes so the operator sees this row is special. */}
                  <td className="grid-cell px-2 text-center tabular-nums text-emerald-700 font-semibold">
                    {r ? fmt(r.beam_length) : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums text-muted-foreground">
                    {r && !r.is_extras_only ? r.pitches : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums">
                    {r && !r.is_extras_only ? r.block_rows : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums">
                    {/* Edge-beam-only row (Length ≤ 0.20, auto-picks BGB
                        at pitches=0): only a closing beam, no actual
                        block rows. blocks_per_row from the width is
                        cosmetically misleading there — gate on
                        block_rows > 0. total_blocks is already 0 so
                        the project total is unaffected. */}
                    {r && !r.is_extras_only && r.block_rows > 0 ? r.blocks_per_row : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums">
                    {r && !r.is_extras_only ? r.total_blocks : "—"}
                  </td>
                  <td className="grid-cell px-2 text-center tabular-nums font-semibold">
                    {r?.beam_count ?? "—"}
                  </td>
                  {/* Slab L moved earlier in the row (right after
                      Correction) — see header comment. */}
                  <td className="grid-cell px-2 text-center tabular-nums text-xs text-blue-700 grid-group-divider">
                    {r ? `${fmt(r.monolith_area)} m²` : "—"}
                  </td>

                  {/* Pricing — rate is editable per-row, catalog-only.
                      Extras-only rows have no m² rate (subtotal comes
                      from the per-meter extra-beam tier in the engine). */}
                  <td className="grid-cell px-2 text-center tabular-nums text-xs grid-tint-pricing">
                    {r && !r.is_extras_only ? (
                      <RateCell
                        row={row}
                        onPick={(picked) => handleRatePick(row.id, picked)}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
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

            {/* No empty-state row — the auto-create effect above
                guarantees rows.length >= 1, so we never render it.
                Defensive removal: if the effect ever races (e.g.
                during an unmount), the table just shows nothing for
                a frame instead of stale empty-state UI. */}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              {/*
                Column layout (19 cols — Slab L moved up next to inputs):
                  1 Name | 2 W | 3 L | 4 Bear | 5 Corr
                  | 6 Slab L
                  | 7 Pattern | 8 +B | 9 StartB
                  | 10 BeamL | 11 Pitches | 12 Block rows | 13 Blks/row
                  | 14 Total blks | 15 Beams | 16 Slab area
                  | 17 m² rate | 18 Subtotal | 19 (delete)

                Visual emphasis on the two material totals:
                  - Block totals (col 14): amber-100 bg + amber-800 text,
                    matching the soft amber group header tint above.
                  - Beams total (col 15): emerald-50 bg + emerald-700 text
                    to differentiate the other material category.
                These two numbers drive production planning — operators
                read them before clicking Place Order.
              */}
              <tr className="bg-muted/40 font-bold">
                {/* cols 1-5: label fills the input-group span. */}
                <td colSpan={5} className="px-3 text-right uppercase text-[11px] tracking-wider text-muted-foreground">
                  Жами · Totals
                </td>
                {/* col 6: Slab L total — sits in its new column position. */}
                <td className="text-center px-2 tabular-nums text-xs">
                  {formatNumber(totals.monolithLength, 2)} m
                </td>
                {/* cols 7-13: Pattern through Per Row — no totals. */}
                <td colSpan={7}></td>
                {/* col 14: Total blocks — material total */}
                <td className="text-center px-2 tabular-nums bg-amber-100 text-amber-800 font-bold">
                  {totals.blocks}
                </td>
                {/* col 15: Beams — material total */}
                <td className="text-center px-2 tabular-nums bg-emerald-50 text-emerald-700 font-bold">
                  {totals.beams}
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
        {/* Right-edge scroll affordance — only visible on <lg.
            Sits OUTSIDE the inner overflow-x-auto so it stays pinned
            to the visible right edge regardless of the user's scroll
            position. `pointer-events-none` so it never swallows
            taps on cells underneath. */}
        <div
          aria-hidden
          className="lg:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent rounded-r-lg"
        />
      </div>

      {/* Bottom toolbar — visually snapped to the table.
          LEFT: rounding grid selector + bulk Round all up.
          RIGHT: Add room + page-level actions (Clear / Save / Place Order).
          Hidden when there are no rows; the empty-state row inside the
          table already exposes "Add the first room". */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center flex-wrap gap-2 text-sm">
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
            {/* Round all up — same visual weight as the 5cm/10cm
                toggles above (h-7 with a colored backdrop) so it
                doesn't read as a tiny utility icon. Always wears
                the "active" look since it's an action button, not a
                radio toggle. */}
            <button
              type="button"
              disabled={!anyRowEligibleForSweep}
              onClick={onRoundAllUp}
              title="Барча хоналарни юқорилаштириш · Round all up — apply to every row's Width using the current grid"
              aria-label="Барча хоналарни юқорилаштириш · Round all up"
              className="h-7 px-3 inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground font-semibold uppercase tracking-wider text-xs hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowUpToLine className="h-3.5 w-3.5" />
              All
            </button>
            {/* Customize layout — opens a side panel for column width
                tweaking (per-user, persisted via the calculator store).
                Hidden via SHOW_CUSTOMIZE_LAYOUT above; flip the const
                back to true to re-expose. State + panel JSX still
                live in this file so the feature returns in one diff. */}
            {SHOW_CUSTOMIZE_LAYOUT && (
              <Button
                variant={isCustomizingLayout ? "default" : "outline"}
                size="sm"
                onClick={() => setIsCustomizingLayout((v) => !v)}
                title="Customize column widths"
                aria-label="Customize column widths"
                className="h-7 px-2 text-[10px] uppercase tracking-wider"
              >
                {isCustomizingLayout ? "Done" : "Customize"}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              className="border-dashed"
              title="Shift+Enter also adds a new room and focuses its Width"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              <span>Add room · Янги хона</span>
              <kbd className="ml-2 hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                Shift + Enter
              </kbd>
            </Button>
            {actions}
          </div>
        </div>
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
                  {/* NumberInput already handles select-on-focus when
                      the value is 0 (replaces the leading "0" cleanly
                      when the operator types) and strips paste-time
                      "02" → "2" leading zeros. Plain <input type=number>
                      didn't, which left the "0" stuck in front of new
                      digits — fixed by reusing the calculator's existing
                      number-input primitive. */}
                  <NumberInput
                    step="1"
                    min="0"
                    max="100"
                    integer
                    showZeroAsEmpty
                    className="grid-input is-numeric h-8 w-20 rounded border border-input pr-5"
                    value={discountPercent}
                    onChange={(n) =>
                      onDiscountChange(Math.min(100, Math.max(0, n)))
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
        <option value="auto">{formatNumber(auto, 0)}</option>
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

/**
 * Up/down round-arrow stack used by the row's Width control.
 *
 * Two render sites share this:
 *   - desktop: inside `WidthCell`, sitting next to the Width input
 *   - mobile (<lg): inside the Name cell, since the sticky Width
 *     column on mobile is too narrow to comfortably hold both the
 *     input and the arrows
 *
 * Both sites call the SAME parent handlers (`onRoundUp(row.id)` /
 * `onRoundDown(row.id)`) — only the position changes. The `size`
 * prop bumps the buttons to a fingertip-friendly target on mobile
 * without affecting the dense desktop look.
 */
function RowRoundArrows({
  onUp,
  onDown,
  size = "sm",
}: {
  onUp: () => void;
  onDown: () => void;
  size?: "sm" | "md";
}) {
  const cls =
    size === "md"
      ? "h-5 w-7 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-muted text-muted-foreground"
      : "h-3 w-4 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-muted text-muted-foreground";
  const iconCls = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <div className="flex flex-col gap-px">
      {/* tabIndex={-1} keeps these click-only — Tab from the Width
          input lands on Length, not on the arrow buttons. The bulk
          "Round all up" toolbar covers the keyboard-driven need. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Юқорилаштириш · Round up"
        title="Round up"
        onClick={onUp}
        className={cls}
      >
        <ChevronUp className={iconCls} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Тушириш · Round down"
        title="Round down"
        onClick={onDown}
        className={cls}
      >
        <ChevronDown className={iconCls} />
      </button>
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
//
// On <lg the arrow stack is HIDDEN here and re-rendered inside the row's
// Name cell instead — the sticky Width column on mobile is too narrow
// to host both the input and the arrows without crowding.
function WidthCell({
  row,
  onWidthChange,
  onRoundUp,
  onRoundDown,
  shouldFocus,
  onFocused,
}: {
  row: SlabRow;
  onWidthChange: (w: number) => void;
  onRoundUp: () => void;
  onRoundDown: () => void;
  /** When true, focus + select the input on this render. Single-shot. */
  shouldFocus?: boolean;
  /** Called once the input has been focused so the parent can clear its pending flag. */
  onFocused?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus + select-all on the next paint after Shift+Enter / Add room.
  // `select()` complements `NumberInput`'s onFocus select-on-zero — we
  // explicit-select here so even non-zero default values get replaced
  // cleanly when the operator types the next digit.
  useEffect(() => {
    if (!shouldFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    onFocused?.();
  }, [shouldFocus, onFocused]);
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
      <NumberInput
        ref={inputRef}
        step="0.01"
        className="grid-input is-numeric flex-1 min-w-0"
        value={row.innerWidth}
        onChange={(n) => onWidthChange(n)}
        placeholder="0.00"
        title={inputTitle}
        showZeroAsEmpty
      />
      {/* Arrows are visible on desktop only — the mobile copy lives
          inside the row's Name cell to free the narrow sticky Width
          column. Same handlers, same row id. */}
      <div className="hidden lg:block">
        <RowRoundArrows onUp={onRoundUp} onDown={onRoundDown} />
      </div>
      {/* Warning glyph + layout placeholder. Hidden on <lg to give
          the input the full 44 px sticky column width — the
          undersize warning is a desktop convenience, the operator on
          mobile accepts that they may not see it inline. */}
      {undersized ? (
        <span
          role="img"
          aria-label={warningTitle}
          title={warningTitle}
          className="hidden lg:inline-flex items-center justify-center text-amber-600 shrink-0"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="hidden lg:inline-block w-3.5 shrink-0" aria-hidden />
      )}
    </div>
  );
}
