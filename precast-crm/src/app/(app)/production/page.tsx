"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { ProductionLogForm } from "@/components/production/ProductionLogForm";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatInventoryLabel } from "@/lib/inventory";
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
          Ишлаб чиқариш
          <span className="lang-en text-muted-foreground font-normal text-base">{" "}· Production</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Бугунги завод маҳсулотини қайд этинг. Ҳар бир ёзув омбордаги захирани кўпайтиради.",
            "Log today's factory output. Each entry increments stock in the warehouse.",
          )}
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
          Сўнгги 14 кун
          <span className="lang-en font-normal">{" "}· Recent 14 days</span>
        </h2>
        {isLoading ? (
          <div className="text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            {t("Ишлаб чиқариш ёзуви йўқ.", "No production entries yet.")}
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
              <div
                key={day}
                className="rounded-lg border border-border bg-card overflow-hidden border-l-[3px] border-l-success"
              >
                <div className="px-4 py-2 bg-muted border-b border-border flex items-baseline justify-between">
                  <div className="text-sm font-semibold font-mono">{formatDate(day)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    {dayEntries.length} {t("ёзув", dayEntries.length === 1 ? "entry" : "entries")}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {beamLines.map(([len, qty]) => (
                      <div
                        key={len}
                        className="flex items-baseline justify-between bg-muted rounded-md px-3 py-1.5 border border-border"
                      >
                        <span className="text-xs text-text-tertiary">
                          {formatInventoryLabel("BEAM", len)}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-success">
                          +{qty}
                        </span>
                      </div>
                    ))}
                    {blocks > 0 && (
                      <div className="flex items-baseline justify-between bg-gold/10 rounded-md px-3 py-1.5 border border-gold/30">
                        <span className="text-xs text-gold font-medium">
                          Ғишт<span className="lang-en"> · Blocks</span>
                        </span>
                        <span className="font-mono font-bold tabular-nums text-gold">
                          +{blocks}
                        </span>
                      </div>
                    )}
                  </div>
                  {dayEntries.some((e) => e.notes) && (
                    <div className="text-xs text-text-tertiary mt-2 italic">
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
