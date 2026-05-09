"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaperResult, Tier } from "../engine";
import {
  hasExistingCalculatorDraft,
  sendGroupsToCalculator,
} from "../calculator-bridge";
import { RectangularNotice } from "./RectangularNotice";

export function TaperedResults({ result }: { result: TaperResult | null }) {
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
      <StrategyCard r={result} />
      <InstallationCard r={result} />
      <MaterialCard r={result} />
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
        <ul className="list-disc list-inside text-sm text-amber-900 space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
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

function StrategyCard({ r }: { r: TaperResult }) {
  const router = useRouter();
  const canSend = r.groups.length > 0;

  function handleSendToCalculator() {
    if (!canSend) return;
    if (hasExistingCalculatorDraft()) {
      const ok = window.confirm(
        "The main calculator already has a draft. Sending these groups will replace it. Continue?",
      );
      if (!ok) return;
    }
    sendGroupsToCalculator({ groups: r.groups, beamSpacing: r.beamSpacing });
    router.push("/calculations");
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Group</th>
                <th className="text-right px-3 py-2">Beam length (m)</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.groups.map((g, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">#{i + 1}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">
                    {g.beamLength.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.qty}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {summarizeRowRange(g.rowsCovered)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ProductionNotes r={r} />
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            disabled={!canSend}
            onClick={handleSendToCalculator}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            title="Each group becomes a calculator row: Width = beam length, Length = qty × spacing"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Калькуляторга юбориш · Send to calculator
          </Button>
        </div>
      </CardContent>
    </Card>
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

function MaterialCard({ r }: { r: TaperResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          5. Материал · Material summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Beams" value={`${r.billOfMaterials.beams} pcs`} />
          <Stat
            label="Approx blocks"
            value={`${r.billOfMaterials.blocks} pcs`}
          />
          <Stat label="Concrete topping" value="—" />
        </div>
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
  if (r.perRowBeamLengths.length === 0) return null;

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
              Per-row beam lengths (W_n)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1 tabular-nums">
              {r.perRowBeamLengths.map((w, i) => (
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
