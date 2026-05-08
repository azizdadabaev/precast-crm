"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import {
  DiscrepancyUpdateDialog,
  type DiscrepancyStatusValue,
} from "@/components/discrepancies/DiscrepancyUpdateDialog";
import { formatDate, formatNumber } from "@/lib/utils";

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

const TABS: Array<{ key: "OPEN" | "RESOLVED" | "DISPUTED"; label: string }> = [
  { key: "OPEN", label: "Open" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "DISPUTED", label: "Disputed" },
];

const STATUS_BADGE: Record<DiscrepancyStatusValue, string> = {
  OPEN:                "bg-amber-100 text-amber-800",
  RESOLVED_RECOVERED:  "bg-emerald-100 text-emerald-800",
  RESOLVED_DISCOUNT:   "bg-sky-100 text-sky-800",
  RESOLVED_WRITEOFF:   "bg-rose-100 text-rose-800",
  DISPUTED:            "bg-purple-100 text-purple-800",
};

function inTab(status: DiscrepancyStatusValue, tab: "OPEN" | "RESOLVED" | "DISPUTED") {
  if (tab === "OPEN") return status === "OPEN";
  if (tab === "DISPUTED") return status === "DISPUTED";
  return status === "RESOLVED_RECOVERED" || status === "RESOLVED_DISCOUNT" || status === "RESOLVED_WRITEOFF";
}

export default function DiscrepanciesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"OPEN" | "RESOLVED" | "DISPUTED">("OPEN");
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
          Тафовутлар <span className="text-muted-foreground font-normal text-base">· Discrepancies</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Cash shortfalls flagged at confirmation time. ADMIN / OWNER only.
        </p>
      </div>

      <div className="flex rounded-md border bg-background overflow-hidden text-xs w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`px-3 h-9 font-semibold uppercase tracking-wider transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No {tab.toLowerCase()} discrepancies.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Order #</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Driver</th>
                <th className="text-right px-3 py-2">Expected</th>
                <th className="text-right px-3 py-2">Received</th>
                <th className="text-right px-3 py-2">Short</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Reported</th>
                <th className="text-left px-3 py-2">Resolved</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 tabular-nums font-bold">
                    <Link href={`/orders/${d.order.id}`} className="hover:underline">
                      {d.order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{d.order.client.name}</td>
                  <td className="px-3 py-2 text-xs">{d.driver?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.expectedAmount, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.receivedAmount, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700 font-semibold">
                    {formatNumber(d.shortfall, 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${STATUS_BADGE[d.status]}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(d.reportedAt)}
                    {d.reportedBy && <div>{d.reportedBy.name}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.resolvedAt ? (
                      <>
                        {formatDate(d.resolvedAt)}
                        {d.resolvedBy && <div>{d.resolvedBy.name}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setTarget(d)}>
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
