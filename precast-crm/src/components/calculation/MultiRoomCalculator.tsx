"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { calculateSlab, projectTotal, type SlabResult, type Pattern } from "@/services/calculation-engine";
import { Input } from "@/components/ui/input";
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

function recompute(row: SlabRow): SlabRow {
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

export function MultiRoomCalculator({ rows, onChange, discountPercent, onDiscountChange }: Props) {
  const addRow = () => onChange([...rows, makeRow(rows.length + 1)]);
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<SlabRow>) =>
    onChange(rows.map((r) => (r.id === id ? recompute({ ...r, ...updates }) : r)));

  const totals = useMemo(() => {
    const valid = rows.map((r) => r.result).filter((r): r is SlabResult => !!r);
    const projTotal = projectTotal(valid, discountPercent);
    const beams = valid.reduce((s, r) => s + r.beam_count, 0);
    const blocks = valid.reduce((s, r) => s + r.total_blocks, 0);
    const monolithArea = valid.reduce((s, r) => s + r.monolith_area, 0);
    const concrete = valid.reduce((s, r) => s + r.concrete_volume, 0);
    return { projTotal, beams, blocks, monolithArea, concrete };
  }, [rows, discountPercent]);

  // Beam schedule (factory-friendly aggregate of beams by length)
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
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
            <tr>
              <th className="px-2 py-2 border-b min-w-[120px]">Name (Хона)</th>
              <th className="px-2 py-2 border-b text-center bg-yellow-50 min-w-[70px]">W (Эни)</th>
              <th className="px-2 py-2 border-b text-center bg-yellow-50 min-w-[70px]">L (Бўйи)</th>
              <th className="px-2 py-2 border-b text-center bg-yellow-50 min-w-[70px]">Bear (Миниш)</th>
              <th className="px-2 py-2 border-b text-center bg-yellow-50 min-w-[80px]">Corr (Корр.)</th>
              <th className="px-2 py-2 border-b text-center bg-blue-50 min-w-[110px]">Pattern (Шаблон)</th>
              <th className="px-2 py-2 border-b text-center min-w-[60px]">+B</th>
              <th className="px-2 py-2 border-b text-center min-w-[60px]">Start B</th>
              <th className="px-2 py-2 border-b text-center bg-green-50 min-w-[80px]">Beam Len</th>
              <th className="px-2 py-2 border-b text-center min-w-[70px]">Blks/Row</th>
              <th className="px-2 py-2 border-b text-center bg-orange-50 min-w-[80px]">Total Blks</th>
              <th className="px-2 py-2 border-b text-center bg-gray-100 min-w-[70px]">Beams</th>
              <th className="px-2 py-2 border-b text-center min-w-[80px]">Block Rows</th>
              <th className="px-2 py-2 border-b text-center bg-blue-50/30 min-w-[80px]">Slab L (Бўйи)</th>
              <th className="px-2 py-2 border-b text-center bg-blue-100/40 min-w-[90px]">Area (Юзаси)</th>
              <th className="px-2 py-2 border-b text-center min-w-[90px]">m² Rate</th>
              <th className="px-2 py-2 border-b text-right bg-green-50 min-w-[110px]">Subtotal</th>
              <th className="px-2 py-2 border-b min-w-[40px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const r = row.result;
              return (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5 bg-yellow-50/30">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm text-center"
                      value={row.innerWidth || ""}
                      onChange={(e) => updateRow(row.id, { innerWidth: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-1.5 bg-yellow-50/30">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm text-center"
                      value={row.innerLength || ""}
                      onChange={(e) => updateRow(row.id, { innerLength: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-1.5 bg-yellow-50/30">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm text-center"
                      value={row.bearing}
                      onChange={(e) => updateRow(row.id, { bearing: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-1.5 bg-yellow-50/30">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm text-center"
                      value={row.correction}
                      onChange={(e) => updateRow(row.id, { correction: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-1.5 bg-blue-50/30">
                    <select
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                      value={row.patternOverride}
                      onChange={(e) =>
                        updateRow(row.id, { patternOverride: e.target.value as Pattern | "AUTO" })
                      }
                    >
                      <option value="AUTO">Auto{r ? ` → ${PATTERN_LABEL[r.pattern_auto]}` : ""}</option>
                      <option value="GB">Г-Б</option>
                      <option value="BGB">Б-Г-Б</option>
                      <option value="GBG">Г-Б-Г</option>
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min="0"
                      className="h-8 text-sm text-center"
                      value={row.extraBeams}
                      onChange={(e) =>
                        updateRow(row.id, { extraBeams: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                      }
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={row.forceStartBeam}
                      onChange={(e) => updateRow(row.id, { forceStartBeam: e.target.checked })}
                    />
                  </td>
                  <td className="p-1.5 text-center font-bold bg-green-50/30 text-green-800">
                    {r ? formatNumber(r.beam_length, 2) : "—"}
                  </td>
                  <td className="p-1.5 text-center">{r?.blocks_per_row ?? "—"}</td>
                  <td className="p-1.5 text-center font-black bg-orange-50/30 text-orange-800">
                    {r?.total_blocks ?? "—"}
                  </td>
                  <td className="p-1.5 text-center font-black bg-gray-100/50">{r?.beam_count ?? "—"}</td>
                  <td className="p-1.5 text-center">{r?.block_rows ?? "—"}</td>
                  <td className="p-1.5 text-center bg-blue-50/20 text-blue-800 text-xs">
                    {r ? `${formatNumber(r.monolith_length, 2)} m` : "—"}
                  </td>
                  <td className="p-1.5 text-center bg-blue-100/30 text-xs">
                    {r ? `${formatNumber(r.monolith_area, 2)} m²` : "—"}
                  </td>
                  <td className="p-1.5 text-center text-xs">
                    {r ? formatNumber(r.m2_price, 0) : "—"}
                  </td>
                  <td className="p-1.5 text-right font-black bg-green-50/30 text-green-700">
                    {r ? formatNumber(r.subtotal, 0) : "—"}
                  </td>
                  <td className="p-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive/80"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="p-8 text-center text-muted-foreground italic">
                  No rooms added yet. Click "Add Room" to start.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/20 font-black">
              <tr>
                <td className="p-2 text-right" colSpan={10}>
                  TOTALS (ЖАМИ):
                </td>
                <td className="p-2 text-center text-orange-800 bg-orange-50/50">{totals.blocks}</td>
                <td className="p-2 text-center bg-gray-100">{totals.beams}</td>
                <td colSpan={2}></td>
                <td className="p-2 text-center text-xs bg-blue-100/30">
                  {formatNumber(totals.monolithArea, 2)} m²
                </td>
                <td colSpan={1}></td>
                <td className="p-2 text-right bg-green-50/50 text-base">
                  {formatNumber(totals.projTotal.rooms_subtotal, 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Discount + grand total */}
          <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              Grand Total (Сўнгги нархи)
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rooms subtotal</span>
                <span className="font-bold">{formatNumber(totals.projTotal.rooms_subtotal, 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="h-8 w-20 text-sm text-right"
                  value={discountPercent}
                  onChange={(e) =>
                    onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
              </div>
              <div className="flex justify-between text-rose-700">
                <span className="text-muted-foreground">Discount amount</span>
                <span>− {formatNumber(totals.projTotal.discount_amount, 0)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="font-bold">Total</span>
                <span className="font-black text-green-700 text-lg">
                  {formatNumber(totals.projTotal.total, 0)} UZS
                </span>
              </div>
            </div>
          </div>

          {/* Factory beam schedule */}
          <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              Beam Schedule (Балкалар рўйхати)
            </h3>
            <div className="space-y-2">
              {schedule.map(([len, qty]) => (
                <div
                  key={len}
                  className="flex justify-between items-center bg-background rounded-lg px-3 py-2 border shadow-sm"
                >
                  <span className="text-sm font-bold">{len} m</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-black">
                    {qty} pcs
                  </span>
                </div>
              ))}
              {schedule.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No beams yet.</div>
              )}
            </div>
          </div>

          {/* Concrete + blocks summary */}
          <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              Materials (Материаллар)
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Total blocks</span>
                <span className="font-bold">{totals.blocks} pcs</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Concrete topping</span>
                <span className="font-bold text-green-700">
                  {totals.concrete.toFixed(2)} m³
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Slab area (visual)</span>
                <span className="font-bold">{formatNumber(totals.monolithArea, 2)} m²</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        className="w-full border-dashed mt-4"
      >
        <Plus className="h-4 w-4 mr-2" /> Add Room (Янги хона қўшиш)
      </Button>
    </div>
  );
}
