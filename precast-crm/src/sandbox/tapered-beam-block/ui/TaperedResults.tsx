"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, AlertTriangle, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_BEARING,
  TRANSVERSE_RIB_WARNING_PREFIX,
  type TaperResult,
  type Tier,
} from "../engine";
import {
  buildGroupedRooms,
  buildPerRowRooms,
  buildPrefillUrl,
  hasExistingCalculatorDraft,
  type PrefillMode,
} from "../calculator-bridge";
import { RectangularNotice } from "./RectangularNotice";

export function TaperedResults({ result }: { result: TaperResult | null }) {
  // Per-row is the default since the factory cuts beams to order from
  // the 65 m prestressing bed; grouping is an operator convenience for
  // a simpler manifest, not a production requirement.
  const [viewMode, setViewMode] = useState<PrefillMode>("per-row");

  if (!result) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Натижа бу ерда кўринади. · Results appear here once you press Calculate.
        </CardContent>
      </Card>
    );
  }

  if (result.isRectangular) {
    return <RectangularNotice />;
  }

  if (result.errors.length > 0) {
    return <ErrorPanel errors={result.errors} />;
  }

  return (
    <div className="space-y-4">
      {result.warnings.length > 0 && <WarningPanel warnings={result.warnings} />}
      <InputCard r={result} />
      <GeometryCard r={result} />
      <StrategyCard r={result} viewMode={viewMode} onChangeViewMode={setViewMode} />
      <InstallationCard r={result} />
      <MaterialCard r={result} viewMode={viewMode} />
      <DetailsExpander r={result} />
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────

function ErrorPanel({ errors }: { errors: string[] }) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-destructive">
          Хатолик · Errors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc list-inside text-sm text-destructive space-y-1">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function WarningPanel({ warnings }: { warnings: string[] }) {
  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-amber-900">
          Огоҳлантириш · Warnings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm text-amber-900 space-y-1.5">
          {warnings.map((w, i) => {
            const isStructural = w.startsWith(TRANSVERSE_RIB_WARNING_PREFIX);
            const Icon = isStructural ? Building : AlertTriangle;
            return (
              <li key={i} className="flex items-start gap-2">
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    isStructural ? "text-rose-700" : "text-amber-700"
                  }`}
                />
                <span>{w}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── §9 sections ─────────────────────────────────────────────

function InputCard({ r }: { r: TaperResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          1. Кириш · Input
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Width 1" value={`${r.width1} m`} />
        <Stat label="Width 2" value={`${r.width2} m`} />
        <Stat label="Length" value={`${r.length} m`} />
        <Stat label="Spacing" value={`${r.beamSpacing} m`} />
        {r.length1 !== null && (
          <Stat label="Length 1 (irregular)" value={`${r.length1} m`} />
        )}
        {r.length2 !== null && (
          <Stat label="Length 2 (irregular)" value={`${r.length2} m`} />
        )}
      </CardContent>
    </Card>
  );
}

function GeometryCard({ r }: { r: TaperResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          2. Геометрия · Geometry
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="ΔW" value={`${r.deltaW.toFixed(3)} m`} />
        <Stat
          label="C_m (per metre)"
          value={`${(r.changePerMetre * 100).toFixed(2)} cm/m`}
        />
        <Stat
          label="C_r (per row)"
          value={`${(r.changePerRow * 100).toFixed(2)} cm/row`}
          highlightCr={Math.abs(r.changePerRow) > 0.5}
        />
        <Stat label="Rows (practical)" value={String(r.rowsPractical)} />
        <Stat
          label="L_effective"
          value={`${r.effectiveLength.toFixed(3)} m`}
        />
        <Stat label="Severity" value={r.severity} />
      </CardContent>
    </Card>
  );
}

function StrategyCard({
  r,
  viewMode,
  onChangeViewMode,
}: {
  r: TaperResult;
  viewMode: PrefillMode;
  onChangeViewMode: (m: PrefillMode) => void;
}) {
  const router = useRouter();
  const canSend = r.perRowDetails.length > 0 && r.groups.length > 0;

  function handleSendToCalculator() {
    if (!canSend) return;
    if (hasExistingCalculatorDraft()) {
      const ok = window.confirm(
        viewMode === "per-row"
          ? `The main calculator already has a draft. Sending ${r.perRowDetails.length} per-row entries will replace it. Continue?`
          : `The main calculator already has a draft. Sending ${r.groups.length} grouped entries will replace it. Continue?`,
      );
      if (!ok) return;
    }
    const rooms =
      viewMode === "per-row"
        ? buildPerRowRooms(r.perRowDetails, r.beamSpacing)
        : buildGroupedRooms(r.groups, r.beamSpacing);
    const url = buildPrefillUrl({
      source: "tapered-sandbox",
      mode: viewMode,
      rooms,
    });
    router.push(url);
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          3. Стратегия · Beam strategy
        </CardTitle>
        <StrategyBadge tier={r.groupingStrategy} />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* View mode toggle — segmented control */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Кўриниш · View mode
          </div>
          <div className="flex rounded-md border bg-background overflow-hidden text-xs">
            <button
              type="button"
              className={`px-3 h-8 font-semibold uppercase tracking-wider transition-colors ${
                viewMode === "per-row"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => onChangeViewMode("per-row")}
            >
              Қаторма-қатор · Per-row
            </button>
            <button
              type="button"
              className={`px-3 h-8 font-semibold uppercase tracking-wider transition-colors ${
                viewMode === "grouped"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => onChangeViewMode("grouped")}
            >
              Гурухланган · Grouped
            </button>
          </div>
        </div>

        {viewMode === "per-row" ? (
          <PerRowTable r={r} />
        ) : (
          <GroupedTable r={r} />
        )}

        <ProductionNotes r={r} />

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            disabled={!canSend}
            onClick={handleSendToCalculator}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            title={
              viewMode === "per-row"
                ? `Each row → one calculator room (inner_length = ${r.beamSpacing} m)`
                : `Each group → one calculator room (inner_length = qty × ${r.beamSpacing} m)`
            }
          >
            <Send className="h-4 w-4 mr-1.5" />
            Калькуляторга юбориш · Send to calculator
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PerRowTable({ r }: { r: TaperResult }) {
  const totalBeamMeters = r.perRowDetails.reduce(
    (s, d) => s + (Math.abs(d.innerWidth) + 2 * DEFAULT_BEARING),
    0,
  );
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-14">Row</th>
              <th className="text-right px-3 py-2">Inner W (m)</th>
              <th className="text-right px-3 py-2">Beam (m)</th>
              <th className="text-right px-3 py-2">Blocks</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.perRowDetails.map((d) => {
              const beam = Math.abs(d.innerWidth) + 2 * DEFAULT_BEARING;
              return (
                <tr key={d.rowIndex}>
                  <td className="px-3 py-2 font-medium">#{d.rowIndex + 1}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">
                    {Math.abs(d.innerWidth).toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {beam.toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d.blocksInRow}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 font-semibold">
            <tr>
              <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                Total
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.perRowDetails.length} rows
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totalBeamMeters.toFixed(2)} m
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.totalBlocksPerRowMode}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ҳар бир қатор учун аниқ ўлчам — бизнинг 65 м бэддан кесиб тайёрлаймиз. ·
        Per-row exact widths — cut to order from our 65 m prestressing bed.
      </p>
    </div>
  );
}

function GroupedTable({ r }: { r: TaperResult }) {
  const cr = Math.abs(r.changePerRow);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Group</th>
              <th className="text-right px-3 py-2">Inner width (m)</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-right px-3 py-2">Blocks</th>
              <th className="text-left px-3 py-2">Rows</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.groups.map((g, i) => {
              const blocksPerRow = Math.ceil(Math.abs(g.innerWidth) / 0.2);
              const blocksGroup = blocksPerRow * g.qty;
              return (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">#{i + 1}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">
                    {Math.abs(g.innerWidth).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {blocksGroup}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {summarizeRowRange(g.rowsCovered)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 font-semibold">
            <tr>
              <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                Total
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.groupCount} SKU
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.groups.reduce((s, g) => s + g.qty, 0)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.totalBlocksGroupedMode}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Гурухланган — оддий ишлаб чиқариш режасини яратади, лекин баъзи қаторларда
        озгина кенгликдан ортиб кетиши мумкин (≤ {cr.toFixed(2)} м/qator). ·
        Grouped — produces a simpler production plan; some rows will be slightly
        wider than required (up to {cr.toFixed(2)} m of edge compensation per group).
      </p>
    </div>
  );
}

function InstallationCard({ r }: { r: TaperResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          4. Ўрнатиш · Installation notes
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Edge compensation (§3.7):</span>{" "}
          for any row whose stock beam exceeds its actual width, absorb
          the difference via edge concrete pour, ring beam, cut blocks, or a
          triangular infill strip — pick whichever minimises site cutting.
        </p>
        {r.requiresHybrid && (
          <p>
            <span className="font-medium text-foreground">Hybrid zone:</span>{" "}
            the slab tail is poured monolithically. Beam-block deck stops at
            the last group; the wedge end is concrete with reinforcement bars.
          </p>
        )}
        <p>
          <span className="font-medium text-foreground">Recommended layout:</span>{" "}
          orient beams along the {r.changePerRow >= 0 ? "widening" : "narrowing"} axis;
          install group #1 at the {r.changePerRow >= 0 ? "narrow" : "wide"} end
          and progress toward the opposite side in row order.
        </p>
      </CardContent>
    </Card>
  );
}

function MaterialCard({
  r,
  viewMode,
}: {
  r: TaperResult;
  viewMode: PrefillMode;
}) {
  const totalBeamMeters = r.perRowDetails.reduce(
    (s, d) => s + (Math.abs(d.innerWidth) + 2 * DEFAULT_BEARING),
    0,
  );
  const groupedBeams = r.groups.reduce((s, g) => s + g.qty, 0);
  const overSupply = r.totalBlocksGroupedMode - r.totalBlocksPerRowMode;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          5. Материал · Material summary{" "}
          <span className="text-[10px] tracking-widest text-muted-foreground/70">
            ({viewMode})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {viewMode === "per-row" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat
              label="Total beams"
              value={`${r.rowsPractical} (cut to order)`}
            />
            <Stat
              label="Total beam meters"
              value={`${totalBeamMeters.toFixed(2)} m`}
            />
            <Stat
              label="Total blocks"
              value={`${r.totalBlocksPerRowMode} pcs`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Total beams" value={`${groupedBeams} pcs`} />
            <Stat label="SKU count" value={`${r.groupCount}`} />
            <Stat
              label="Total blocks"
              value={`${r.totalBlocksGroupedMode} pcs`}
            />
            {overSupply > 0 && (
              <Stat
                label="vs. per-row"
                value={`+${overSupply} blocks (edge absorb)`}
              />
            )}
          </div>
        )}
        {r.totalBlocksGroupedMode !== r.totalBlocksPerRowMode && (
          <div className="text-[11px] text-muted-foreground border-t pt-2">
            Per-row total <span className="tabular-nums font-semibold">{r.totalBlocksPerRowMode}</span>{" "}
            · Grouped total <span className="tabular-nums font-semibold">{r.totalBlocksGroupedMode}</span>
            {" "}— grouped over-supplies because each group rounds UP to its widest row; the surplus absorbs the taper at the edge.
          </div>
        )}
        {r.billOfMaterials.notes.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {r.billOfMaterials.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProductionNotes({ r }: { r: TaperResult }) {
  // §5 priorities — surface as a short reminder list.
  return (
    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
      <li>Minimise stopper adjustments on the prestressing bed.</li>
      <li>Minimise prestressing interruptions.</li>
      <li>SKU count: {r.groupCount}.</li>
      {r.requiresHybrid && (
        <li className="text-amber-800">
          Hybrid: beams cover {r.groups.reduce((s, g) => s + g.qty, 0)} of {r.rowsPractical} rows;
          remainder is monolithic.
        </li>
      )}
    </ul>
  );
}

function DetailsExpander({ r }: { r: TaperResult }) {
  const [open, setOpen] = useState(false);
  if (r.perRowInnerWidths.length === 0) return null;

  // Pull [VERIFY] markers from BoM notes.
  const verifyMarkers = r.billOfMaterials.notes.filter((n) =>
    n.includes("[VERIFY"),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
            Тафсилот · Show details
          </CardTitle>
          <span className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-xs">
          <div>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Per-row inner widths (W_n)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1 tabular-nums">
              {r.perRowInnerWidths.map((w, i) => (
                <div
                  key={i}
                  className="flex justify-between border rounded px-2 py-1 bg-muted/20"
                >
                  <span className="text-muted-foreground">W<sub>{i}</sub></span>
                  <span>{w.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
          {verifyMarkers.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                [VERIFY §12] markers triggered by this calculation
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-800">
                {verifyMarkers.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function Stat({
  label,
  value,
  highlightCr,
}: {
  label: string;
  value: string;
  highlightCr?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
        {label}
      </div>
      <div
        className={`tabular-nums font-semibold ${
          highlightCr ? "text-rose-700" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StrategyBadge({ tier }: { tier: Tier }) {
  if (tier === "hybrid") {
    return (
      <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 uppercase tracking-wider">
        Hybrid
      </Badge>
    );
  }
  const variants: Record<number, string> = {
    1: "bg-emerald-100 text-emerald-800",
    2: "bg-sky-100 text-sky-800",
    3: "bg-amber-100 text-amber-800",
    4: "bg-orange-100 text-orange-800",
  };
  return (
    <Badge
      className={`${variants[tier as number] ?? "bg-muted"} hover:opacity-90 uppercase tracking-wider`}
    >
      Strategy {tier}
    </Badge>
  );
}

function summarizeRowRange(rows: number[]): string {
  if (rows.length === 0) return "—";
  if (rows.length === 1) return `row ${rows[0]}`;
  const sorted = [...rows].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Check contiguity for a tighter label.
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  return contiguous
    ? `rows ${first}–${last} (${rows.length})`
    : `rows ${rows.join(", ")}`;
}
