"use client";

import { useMemo } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { calculateSlab, projectTotal, type SlabResult, type Pattern } from "@/services/calculation-engine";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

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
    return { ...row, result };
  } catch {
    return { ...row, result: null };
  }
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
  const addRow = () => onChange([...rows, makeRow(rows.length + 1)]);
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<SlabRow>) =>
    onChange(rows.map((r) => (r.id === id ? recomputeRow({ ...r, ...updates }) : r)));

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
      <div className="rounded-lg border border-border overflow-x-auto bg-background shadow-sm">
        <table className="calc-grid">
          {/* Explicit column widths — table-layout: fixed honors these exactly */}
          <colgroup>
            <col width={108} />  {/* Хона          */}
            <col width={56} />   {/* Эни           */}
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
            <col width={68} />   {/* м² нархи      */}
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
                    <input
                      type="number"
                      step="0.01"
                      className="grid-input is-numeric"
                      value={row.innerWidth || ""}
                      onChange={(e) => updateRow(row.id, { innerWidth: Number(e.target.value) })}
                      placeholder="0.00"
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

                  {/* Pricing */}
                  <td className="grid-cell px-2 text-center tabular-nums text-xs grid-tint-pricing">
                    {r ? fmt(r.m2_price, 0) : "—"}
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
    </div>
  );
}
