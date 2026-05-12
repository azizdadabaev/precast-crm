"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { useT } from "@/lib/i18n";

interface Project {
  id: string;
  name: string | null;
  shapeType: string;
  status: "DRAFT" | "ORDERED" | "ARCHIVED";
  dimensions: { width?: number; length?: number; widths?: number[] };
  createdAt: string;
  updatedAt: string;
  tentativeClientName: string | null;
  tentativeClientPhone: string | null;
  tentativeClientAddress: string | null;
  client: { id: string; name: string; phone: string; address: string | null } | null;
  calculations: Array<{
    id: string;
    beamCount: number;
    totalBlocks: number;
    monolithArea: string;
    subtotal: string;
  }>;
  orders: Array<{ id: string; orderNumber: string; status: string }>;
}

export default function ProjectsPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ALL">("DRAFT");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects", status, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      return api(`/api/projects?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Лойиҳалар
            <span className="lang-en text-muted-foreground font-normal text-base">{" "}· Projects</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Сақланган ҳисоб-китоблар, ҳали буюртма берилмаган. Исм, телефон ёки манзил бўйича қидиринг.",
              "Saved calculations not yet placed as orders. Search by name, phone or address.",
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/calculations">
            <Plus className="h-4 w-4 mr-2" /> {t("Янги ҳисоб-китоб", "New Calculation")}
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t(
              "Қидириш · исм, телефон (охирги 4 рақам) ёки манзил",
              "Search · name, phone (last 4 digits OK), or address",
            )}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-border bg-card overflow-hidden">
          {(["DRAFT", "ALL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-3 h-9 text-xs font-semibold uppercase tracking-wider transition-colors ${
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setStatus(s)}
            >
              {s === "DRAFT" ? t("Лойиҳалар", "Drafts") : t("Барчаси", "All")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="text-muted-foreground p-6">{t("Юкланмоқда…", "Loading…")}</div>
        ) : projects.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">
            {q
              ? t(`"${q}" бўйича лойиҳа топилмади.`, `No projects match "${q}".`)
              : t(
                  "Ҳозирча лойиҳалар йўқ — ҳисоб-китобни бошланг.",
                  "No drafts yet — start a calculation to save one.",
                )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Мижоз<span className="lang-en"> · Client</span></th>
                <th className="text-left px-3 py-2">Тел<span className="lang-en"> · Phone</span></th>
                <th className="text-left px-3 py-2">Манзил<span className="lang-en"> · Address</span></th>
                <th className="text-center px-3 py-2">Хоналар<span className="lang-en"> · Rooms</span></th>
                <th className="text-right px-3 py-2">Майдон<span className="lang-en"> · Area</span></th>
                <th className="text-right px-3 py-2">Сумма<span className="lang-en"> · Subtotal</span></th>
                <th className="text-left px-3 py-2">{t("Ҳолат", "Status")}</th>
                <th className="text-left px-3 py-2">{t("Янгиланди", "Updated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map((p) => {
                const totalArea = p.calculations.reduce(
                  (s, c) => s + Number(c.monolithArea),
                  0,
                );
                const totalSum = p.calculations.reduce(
                  (s, c) => s + Number(c.subtotal),
                  0,
                );
                const clientName = p.client?.name ?? p.tentativeClientName ?? "—";
                const clientPhone = p.client?.phone ?? p.tentativeClientPhone ?? "";
                const clientAddress = p.client?.address ?? p.tentativeClientAddress ?? "";
                const order = p.orders[0];
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {clientName}
                      </Link>
                      {p.name && (
                        <div className="text-xs text-muted-foreground">{p.name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {clientPhone ? formatPhone(clientPhone) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {clientAddress || "—"}
                    </td>
                    <td className="px-3 py-2 text-center">{p.calculations.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(totalArea, 2)} m²
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatNumber(totalSum, 0)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={p.status} order={order} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {formatDate(p.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  order,
}: {
  status: "DRAFT" | "ORDERED" | "ARCHIVED";
  order?: { orderNumber: string };
}) {
  if (status === "DRAFT") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning border border-warning/30 rounded px-2 py-0.5">
        Лойиҳа<span className="lang-en"> · Draft</span>
      </span>
    );
  }
  if (status === "ORDERED") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/30 rounded px-2 py-0.5 tabular-nums">
        {order?.orderNumber ?? "Ordered"}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border rounded px-2 py-0.5">
      Архив
    </span>
  );
}
