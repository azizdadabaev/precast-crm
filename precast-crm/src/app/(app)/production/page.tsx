"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { ProductionLogForm } from "@/components/production/ProductionLogForm";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatInventoryLabel } from "@/lib/inventory";

interface ProductionLine {
  id: string;
  kind: "BEAM" | "BLOCK";
  beamLength: string | null;
  quantity: number;
}

interface ProductionEntry {
  id: string;
  producedAt: string;
  notes: string | null;
  createdAt: string;
  recordedBy: { id: string; name: string; email: string } | null;
  lines: ProductionLine[];
}

export default function ProductionPage() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useQuery<ProductionEntry[]>({
    queryKey: ["production"],
    queryFn: () => api("/api/production?days=14"),
  });

  const create = useMutation({
    mutationFn: (payload: {
      producedAt: string;
      notes: string | null;
      lines: Array<{ kind: "BEAM" | "BLOCK"; beamLength: number | null; quantity: number }>;
    }) =>
      api("/api/production", {
        method: "POST",
        json: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  // Group entries by day for the recent log
  const grouped = useMemo(() => {
    const map = new Map<string, ProductionEntry[]>();
    for (const e of entries) {
      const day = e.producedAt.slice(0, 10);
      const cur = map.get(day) ?? [];
      cur.push(e);
      map.set(day, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Ишлаб чиқариш{" "}
          <span className="text-muted-foreground font-normal text-base">· Production</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Log today's factory output. Each entry increments stock in the warehouse.
        </p>
      </div>

      <ProductionLogForm
        onSubmit={async (payload) => {
          await create.mutateAsync(payload);
        }}
      />

      {/* Recent entries */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Сўнгги 14 кун · Recent 14 days
        </h2>
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground">
            No production entries yet.
          </div>
        ) : (
          grouped.map(([day, dayEntries]) => {
            // Aggregate the day's totals
            const beamMap = new Map<number, number>();
            let blocks = 0;
            for (const e of dayEntries) {
              for (const line of e.lines) {
                if (line.kind === "BEAM" && line.beamLength) {
                  const len = Number(line.beamLength);
                  beamMap.set(len, (beamMap.get(len) ?? 0) + line.quantity);
                } else if (line.kind === "BLOCK") {
                  blocks += line.quantity;
                }
              }
            }
            const beamLines = Array.from(beamMap.entries()).sort((a, b) => a[0] - b[0]);

            return (
              <div key={day} className="rounded-lg border bg-background overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b flex items-baseline justify-between">
                  <div className="text-sm font-semibold">{formatDate(day)}</div>
                  <div className="text-xs text-muted-foreground">
                    {dayEntries.length} entr{dayEntries.length === 1 ? "y" : "ies"}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {beamLines.map(([len, qty]) => (
                      <div
                        key={len}
                        className="flex items-baseline justify-between bg-muted/20 rounded px-3 py-1.5"
                      >
                        <span className="text-xs text-muted-foreground">
                          {formatInventoryLabel("BEAM", len)}
                        </span>
                        <span className="font-semibold tabular-nums">+{qty}</span>
                      </div>
                    ))}
                    {blocks > 0 && (
                      <div className="flex items-baseline justify-between bg-orange-50/60 rounded px-3 py-1.5">
                        <span className="text-xs text-orange-800">Ғишт · Blocks</span>
                        <span className="font-semibold tabular-nums text-orange-800">
                          +{blocks}
                        </span>
                      </div>
                    )}
                  </div>
                  {dayEntries.some((e) => e.notes) && (
                    <div className="text-xs text-muted-foreground mt-2 italic">
                      {dayEntries
                        .filter((e) => e.notes)
                        .map((e) => `"${e.notes}" — ${e.recordedBy?.name ?? "?"}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
