"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";
import { calculateSlab, type SlabResult, type CalculationConstants, DEFAULT_CONSTANTS } from "@/services/calculation-engine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export interface SlabRow {
  id: string;
  name: string;
  width: number;
  length: number;
  pricePerM2: number;
  extraBeams: number;
  extraFillers: number;
  result: SlabResult | null;
}

interface Props {
  rows: SlabRow[];
  onChange: (rows: SlabRow[]) => void;
}

export function MultiRoomCalculator({ rows, onChange }: Props) {
  const addRow = () => {
    const newRow: SlabRow = {
      id: Math.random().toString(36).slice(2, 9),
      name: `Room ${rows.length + 1}`,
      width: 0,
      length: 0,
      pricePerM2: 140,
      extraBeams: 0,
      extraFillers: 0,
      result: null,
    };
    onChange([...rows, newRow]);
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, updates: Partial<SlabRow>) => {
    const nextRows = rows.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, ...updates };
      
      // Recalculate if dimensions or overrides changed
      if (updated.width > 0 && updated.length > 0) {
        try {
          const res = calculateSlab(
            { width: updated.width, length: updated.length },
            {},
            { extraBeams: updated.extraBeams, extraFillers: updated.extraFillers }
          );
          updated.result = res;

          // Auto-pricing logic (only if price wasn't manually touched in this turn? 
          // Actually let's just re-apply if width changed)
          if (updates.width !== undefined || updates.length !== undefined) {
             const bl = res.beam_length;
             if (bl <= 4.30) updated.pricePerM2 = 140;
             else if (bl <= 5.30) updated.pricePerM2 = 160;
             else if (bl <= 6.30) updated.pricePerM2 = 180;
             else updated.pricePerM2 = 200;
          }
        } catch (e) {
          console.error("Calculation error", e);
          updated.result = null;
        }
      } else {
        updated.result = null;
      }
      
      return updated;
    });
    onChange(nextRows);
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.result) return acc;
        const area = r.width * r.length;
        const sum = area * r.pricePerM2;
        return {
          blocks: acc.blocks + r.result.total_blocks,
          beams: acc.beams + r.result.beam_count,
          area: acc.area + area,
          sum: acc.sum + sum,
        };
      },
      { blocks: 0, beams: 0, area: 0, sum: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
            <tr>
              <th className="px-3 py-3 border-b bg-yellow-50 min-w-[160px]">Name (Хона номи)</th>
              <th className="px-3 py-3 border-b text-center bg-yellow-50 min-w-[80px]">Width (Эни)</th>
              <th className="px-3 py-3 border-b text-center bg-yellow-50 min-w-[80px]">Length (Бўйи)</th>
              <th className="px-3 py-3 border-b text-center bg-yellow-50 min-w-[70px]">Bear (Миниш)</th>
              <th className="px-3 py-3 border-b text-center bg-green-50 min-w-[90px]">Beam Len (Б.Уз.)</th>
              <th className="px-3 py-3 border-b text-center min-w-[80px]">Blks/Row (1 қат)</th>
              <th className="px-3 py-3 border-b text-center bg-orange-50 min-w-[80px]">Total Blks (Жами)</th>
              <th className="px-3 py-3 border-b text-center bg-gray-100 min-w-[80px]">Beams (Балка)</th>
              <th className="px-3 py-3 border-b text-center min-w-[70px]">Pattern (Шаблон)</th>
              <th className="px-3 py-3 border-b text-center bg-blue-50/50 min-w-[90px]">Actual Length (Бўйи жами)</th>
              <th className="px-3 py-3 border-b text-center bg-blue-100/50 min-w-[90px]">Actual Area (Юзаси)</th>
              <th className="px-3 py-3 border-b text-center min-w-[70px]">+Beam</th>
              <th className="px-3 py-3 border-b text-center min-w-[70px]">+Fill</th>
              <th className="px-3 py-3 border-b text-center min-w-[90px]">Area (Майдон)</th>
              <th className="px-3 py-3 border-b text-center bg-green-50 min-w-[80px]">Price (Нарх)</th>
              <th className="px-3 py-3 border-b text-right min-w-[100px]">Sum (Сумма)</th>
              <th className="px-3 py-3 border-b"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const pattern = row.result?.beam_count === row.result?.rows_final ? "Ғ-Б" : "Б-Ғ-Б";
              const extraBeamCost = row.result 
                ? row.result.extra_beams_qty * row.result.beam_length * row.result.extra_beam_price_per_m
                : 0;
              const m2Cost = row.result ? row.result.m2_area * row.pricePerM2 : 0;
              const rowSum = m2Cost + extraBeamCost;

              return (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-2 px-3 bg-yellow-50/30">
                  <Input
                    className="h-9 py-1 text-sm font-medium"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </td>
                <td className="p-2 px-3 bg-yellow-50/30">
                  <Input
                    type="number"
                    className="h-9 py-1 text-sm text-center"
                    value={row.width || ""}
                    onChange={(e) => updateRow(row.id, { width: Number(e.target.value) })}
                  />
                </td>
                <td className="p-2 px-3 bg-yellow-50/30">
                  <Input
                    type="number"
                    className="h-9 py-1 text-sm text-center"
                    value={row.length || ""}
                    onChange={(e) => updateRow(row.id, { length: Number(e.target.value) })}
                  />
                </td>
                <td className="p-2 px-3 bg-yellow-50/30 text-center text-sm text-muted-foreground">
                  0.15
                </td>
                <td className="p-2 px-3 text-center font-bold text-sm bg-green-50/30 text-green-800">
                  {row.result ? formatNumber(row.result.beam_length, 2) : "—"}
                </td>
                <td className="p-2 px-3 text-center text-sm">
                  {row.result?.blocks_per_row || "—"}
                </td>
                <td className="p-2 px-3 text-center font-black text-sm bg-orange-50/30 text-orange-800">
                  {row.result?.total_blocks || "—"}
                </td>
                <td className="p-2 px-3 text-center font-black text-sm bg-gray-100/50">
                  {row.result?.beam_count || "—"}
                </td>
                <td className="p-2 px-3 text-center text-xs font-medium text-muted-foreground uppercase">
                  {row.result ? pattern : "—"}
                </td>
                <td className="p-2 px-3 text-center font-bold text-sm bg-blue-50/20 text-blue-800">
                  {row.result ? formatNumber(row.result.actual_length, 2) : "—"}
                </td>
                <td className="p-2 px-3 text-center font-bold text-sm bg-blue-100/20">
                  {row.result ? formatNumber(row.result.actual_length * row.result.beam_length, 2) : "—"}
                </td>
                <td className="p-2 px-3">
                  <Input
                    type="number"
                    className="h-9 py-1 text-sm text-center border-blue-200"
                    value={row.extraBeams}
                    onChange={(e) => updateRow(row.id, { extraBeams: Number(e.target.value) })}
                  />
                </td>
                <td className="p-2 px-3">
                  <Input
                    type="number"
                    className="h-9 py-1 text-sm text-center border-blue-200"
                    value={row.extraFillers}
                    onChange={(e) => updateRow(row.id, { extraFillers: Number(e.target.value) })}
                  />
                </td>
                <td className="p-2 px-3 text-center font-bold text-sm">
                  {row.result ? formatNumber(row.result.covered_area, 2) : "—"}
                </td>
                <td className="p-2 px-3 bg-green-50/30">
                  <Input
                    type="number"
                    className="h-9 py-1 text-sm text-center text-green-800 font-bold"
                    value={row.pricePerM2 || ""}
                    onChange={(e) => updateRow(row.id, { pricePerM2: Number(e.target.value) })}
                  />
                </td>
                <td className="p-2 px-3 text-right font-black text-sm text-green-700">
                  {row.result ? formatNumber(rowSum, 0) : "—"}
                </td>
                <td className="p-2 px-3 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive/80"
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
                <td colSpan={17} className="p-8 text-center text-muted-foreground italic text-sm">
                  No rooms added yet. Click "Add Room" to start calculation.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (() => {
            const finalTotals = rows.reduce((acc, row) => {
              if (!row.result) return acc;
              const extraBeamCost = row.result.extra_beams_qty * row.result.beam_length * row.result.extra_beam_price_per_m;
              const m2Cost = row.result.m2_area * row.pricePerM2;
              return {
                blocks: acc.blocks + row.result.total_blocks,
                beams: acc.beams + row.result.beam_count,
                area: acc.area + row.result.covered_area,
                sum: acc.sum + (m2Cost + extraBeamCost)
              };
            }, { blocks: 0, beams: 0, area: 0, sum: 0 });

            return (
            <tfoot className="bg-muted/20 font-black">
              <tr>
                <td className="p-3 text-right" colSpan={6}>TOTALS (ЖАМИ):</td>
                <td className="p-3 text-center text-orange-800 bg-orange-50/50">{finalTotals.blocks}</td>
                <td className="p-3 text-center bg-gray-100">{finalTotals.beams}</td>
                <td className="p-3" colSpan={5}></td>
                <td className="p-3 text-center text-sm">{formatNumber(finalTotals.area, 2)} m²</td>
                <td className="p-3 text-right text-green-800 bg-green-50/50 text-base" colSpan={2}>{formatNumber(finalTotals.sum, 0)}</td>
                <td></td>
              </tr>
            </tfoot>
            );
          })()}
        </table>
      </div>
      
      {rows.length > 0 && (() => {
        // Aggregate beam schedule
        const schedule: Record<string, number> = {};
        let totalWeight = 0;
        let totalConcrete = 0;
        
        rows.forEach(r => {
          if (!r.result) return;
          const len = r.result.beam_length.toFixed(2);
          schedule[len] = (schedule[len] || 0) + r.result.beam_count;
          totalWeight += r.result.weights.total_kg;
          totalConcrete += r.result.concrete_volume;
        });

        const truckLoads = Math.ceil(totalWeight / 20000); // Assume 20-ton truck

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-6 border-t border-dashed">
            {/* Beam Schedule - CRITICAL FOR FACTORY */}
            <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mr-2" />
                Factory Beam Schedule (Балкалар рўйхати)
              </h3>
              <div className="space-y-2">
                {Object.entries(schedule).sort((a,b) => Number(b[0]) - Number(a[0])).map(([len, qty]) => (
                  <div key={len} className="flex justify-between items-center bg-background rounded-lg px-3 py-2 border shadow-sm">
                    <span className="text-sm font-bold">{len} m</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-black">{qty} pcs (дона)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Logistics Summary - CRITICAL FOR DELIVERY */}
            <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                Logistics Summary (Логистика ва юк)
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-end border-b pb-2">
                  <span className="text-xs text-muted-foreground">Total Weight (Юк вазни):</span>
                  <span className="text-lg font-black text-blue-700">{(totalWeight / 1000).toFixed(2)} Tons</span>
                </div>
                <div className="flex justify-between items-end border-b pb-2">
                  <span className="text-xs text-muted-foreground">Est. Trucks (Машиналар):</span>
                  <span className="text-lg font-black text-blue-700">{truckLoads} <span className="text-xs font-normal">(20t cap)</span></span>
                </div>
              </div>
            </div>

            {/* Material Summary - CRITICAL FOR SITE */}
            <div className="bg-muted/30 rounded-xl p-4 border border-muted-foreground/10">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2" />
                Material BoQ (Материаллар жами)
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-end border-b pb-2">
                  <span className="text-xs text-muted-foreground">Concrete Topping (Бетон):</span>
                  <span className="text-lg font-black text-green-700">{totalConcrete.toFixed(2)} m³</span>
                </div>
                <div className="flex justify-between items-end border-b pb-2">
                  <span className="text-xs text-muted-foreground">Est. Concrete Weight:</span>
                  <span className="text-sm font-bold">{(totalConcrete * 2400 / 1000).toFixed(1)} Tons</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed mt-4">
        <Plus className="h-4 w-4 mr-2" /> Add Room (Янги хона қўшиш)
      </Button>
    </div>
  );
}
