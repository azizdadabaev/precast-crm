"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  DiscrepancyUpdateDialog,
  type DiscrepancyStatusValue,
} from "@/components/discrepancies/DiscrepancyUpdateDialog";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Discrepancy {
  id: string;
  expectedAmount: string;
  receivedAmount: string;
  shortfall: string;
  status: DiscrepancyStatusValue;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  order: { id: string; orderNumber: string; client: { id: string; name: string } };
  driver: { id: string; name: string } | null;
  reportedBy: { id: string; name: string } | null;
  resolvedBy: { id: string; name: string } | null;
}

type DTabKey = "OPEN" | "RESOLVED" | "DISPUTED";
const TABS: ReadonlyArray<DTabKey> = ["OPEN", "RESOLVED", "DISPUTED"] as const;
function translateTab(k: DTabKey, t: (uz: string, en: string) => string): string {
  switch (k) {
    case "OPEN":     return t("Очиқ", "Open");
    case "RESOLVED": return t("Ҳал қилинган", "Resolved");
    case "DISPUTED": return t("Низоли", "Disputed");
  }
}
function translateDStatus(s: DiscrepancyStatusValue, t: (uz: string, en: string) => string): string {
  switch (s) {
    case "OPEN":               return t("Очиқ", "Open");
    case "RESOLVED_RECOVERED": return t("Қайтарилди", "Recovered");
    case "RESOLVED_DISCOUNT":  return t("Чегирма", "Discount");
    case "RESOLVED_WRITEOFF":  return t("Ҳисобдан чиқарилди", "Write-off");
    case "DISPUTED":           return t("Низоли", "Disputed");
  }
}

// Per-status visual: chip variant + readable label + colored row left-edge.
const STATUS_META: Record<
  DiscrepancyStatusValue,
  {
    label: string;
    variant: React.ComponentProps<typeof Chip>["variant"];
    rowBorder: string;
  }
> = {
  OPEN:               { label: "Open",       variant: "danger",  rowBorder: "border-l-destructive" },
  RESOLVED_RECOVERED: { label: "Recovered",  variant: "success", rowBorder: "border-l-success" },
  RESOLVED_DISCOUNT:  { label: "Discount",   variant: "default", rowBorder: "border-l-primary" },
  RESOLVED_WRITEOFF:  { label: "Write-off",  variant: "neutral", rowBorder: "border-l-border-strong" },
  DISPUTED:           { label: "Disputed",   variant: "warning", rowBorder: "border-l-warning" },
};

function inTab(status: DiscrepancyStatusValue, tab: "OPEN" | "RESOLVED" | "DISPUTED") {
  if (tab === "OPEN") return status === "OPEN";
  if (tab === "DISPUTED") return status === "DISPUTED";
  return status === "RESOLVED_RECOVERED" || status === "RESOLVED_DISCOUNT" || status === "RESOLVED_WRITEOFF";
}

export default function DiscrepanciesPage() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DTabKey>("OPEN");
  const [target, setTarget] = useState<Discrepancy | null>(null);

  const { data: items = [], isLoading } = useQuery<Discrepancy[]>({
    queryKey: ["discrepancies"],
    queryFn: () => api("/api/discrepancies"),
  });

  const visible = items.filter((d) => inTab(d.status, tab));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Тафовутлар
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Discrepancies
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Тасдиқлаш пайтида аниқланган нақд пул камомади. Фақат АДМИН / ЭГА.",
            "Cash shortfalls flagged at confirmation time. ADMIN / OWNER only.",
          )}
        </p>
      </div>

      {/* Underline tabs (etalon pattern) */}
      <div className="flex border-b border-border">
        {TABS.map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              className={cn(
                "relative h-10 px-4 text-[12px] font-bold uppercase tracking-wider transition-colors",
                active
                  ? "text-primary"
                  : "text-text-tertiary hover:text-foreground",
              )}
              onClick={() => setTab(k)}
            >
              {translateTab(k, t)}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t("Тафовут йўқ.", "No discrepancies.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">{t("Буюртма №", "Order #")}</th>
                  <th className="text-left px-3 py-2.5">{t("Мижоз", "Client")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳайдовчи", "Driver")}</th>
                  <th className="text-right px-3 py-2.5">{t("Кутилган", "Expected")}</th>
                  <th className="text-right px-3 py-2.5">{t("Олинган", "Received")}</th>
                  <th className="text-right px-3 py-2.5">{t("Кам", "Short")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳолат", "Status")}</th>
                  <th className="text-left px-3 py-2.5">{t("Қайд этилди", "Reported")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳал қилинди", "Resolved")}</th>
                  <th className="px-3 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d, i) => {
                  const meta = STATUS_META[d.status];
                  return (
                    <tr
                      key={d.id}
                      className={cn(
                        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                        "border-l-[3px]",
                        meta.rowBorder,
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-primary text-xs">
                        <Link href={`/orders/${d.order.id}`} className="hover:underline">
                          {d.order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{d.order.client.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {d.driver?.name ?? <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatNumber(d.expectedAmount, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatNumber(d.receivedAmount, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-destructive">
                        {formatNumber(d.shortfall, 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip variant={meta.variant}>{translateDStatus(d.status, t)}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                        {formatDate(d.reportedAt)}
                        {d.reportedBy && (
                          <div className="font-sans not-italic">{d.reportedBy.name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                        {d.resolvedAt ? (
                          <>
                            {formatDate(d.resolvedAt)}
                            {d.resolvedBy && (
                              <div className="font-sans not-italic">{d.resolvedBy.name}</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button variant="outline" size="sm" onClick={() => setTarget(d)}>
                          {t("Янгилаш", "Update")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DiscrepancyUpdateDialog
        open={!!target}
        onClose={() => setTarget(null)}
        initialStatus={target?.status ?? "OPEN"}
        onSubmit={async (status, note) => {
          if (!target) return;
          await api(`/api/discrepancies/${target.id}`, {
            method: "PATCH",
            json: { status, resolutionNote: note },
          });
          qc.invalidateQueries({ queryKey: ["discrepancies"] });
        }}
      />
    </div>
  );
}
