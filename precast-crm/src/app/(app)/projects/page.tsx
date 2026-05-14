"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, Loader2 } from "lucide-react";
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
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ALL">("DRAFT");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects", status, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      return api(`/api/projects?${params.toString()}`);
    },
  });

  // Permission check — only show selection UI to users with project.delete.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canDelete = me?.permissions?.includes("project.delete") ?? false;

  // Project→Order conversion tracker. Counted client-side from the
  // current filtered list so it reflects whatever the operator is
  // looking at; switching the DRAFT/ALL toggle re-counts.
  const tracker = useMemo(() => {
    const total = projects.length;
    const ordered = projects.filter((p) => p.status === "ORDERED").length;
    const draft = projects.filter((p) => p.status === "DRAFT").length;
    const pct = total > 0 ? Math.round((ordered / total) * 100) : 0;
    return { total, ordered, draft, pct };
  }, [projects]);

  const deletableSelected = useMemo(() => {
    return projects.filter(
      (p) => selected.has(p.id) && p.status === "DRAFT",
    );
  }, [projects, selected]);

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAllDraftsOnPage() {
    const draftIds = projects
      .filter((p) => p.status === "DRAFT")
      .map((p) => p.id);
    const allChecked = draftIds.every((id) => selected.has(id));
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(draftIds));
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      return json as { deleted: number };
    },
    onSuccess: () => {
      setSelected(new Set());
      setConfirmOpen(false);
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
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

      {/* Tracker — projects → orders conversion. Reflects the current
          DRAFT/ALL filter so operators can see e.g. "of all my saved
          projects, X became orders". Hidden when there are no rows. */}
      {projects.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex flex-wrap items-baseline justify-between gap-3 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Лойиҳа → Буюртма
            <span className="lang-en font-normal"> · Project → Order tracker</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
            <span>
              <span className="text-muted-foreground text-xs">{t("Жами:", "Total:")} </span>
              <span className="font-bold">{tracker.total}</span>
            </span>
            <span>
              <span className="text-muted-foreground text-xs">{t("Лойиҳа:", "Drafts:")} </span>
              <span className="font-bold text-warning">{tracker.draft}</span>
            </span>
            <span>
              <span className="text-muted-foreground text-xs">{t("Буюртма:", "Ordered:")} </span>
              <span className="font-bold text-success">{tracker.ordered}</span>
            </span>
            <span className="font-bold">
              {tracker.pct}%
              <span className="text-muted-foreground text-xs font-normal ml-1">
                {t("буюртмага айлантирилган", "converted")}
              </span>
            </span>
          </div>
        </div>
      )}

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
        {/* Bulk-delete trigger. Renders only for users with project.delete
            permission AND when at least one DRAFT row is selected. The
            confirmation dialog handles the actual call. */}
        {canDelete && deletableSelected.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t(
              `${deletableSelected.length} та лойиҳани ўчириш`,
              `Delete ${deletableSelected.length} project${deletableSelected.length === 1 ? "" : "s"}`,
            )}
          </Button>
        )}
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
                {canDelete && (
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      title={t("Лойиҳаларни танлаш", "Select drafts")}
                      checked={
                        projects.filter((p) => p.status === "DRAFT").length > 0 &&
                        projects
                          .filter((p) => p.status === "DRAFT")
                          .every((p) => selected.has(p.id))
                      }
                      onChange={toggleAllDraftsOnPage}
                    />
                  </th>
                )}
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
                const isChecked = selected.has(p.id);
                const isDeletable = p.status === "DRAFT";
                return (
                  <tr
                    key={p.id}
                    className={
                      "hover:bg-muted/20 transition-colors " +
                      (isChecked ? "bg-destructive/5" : "")
                    }
                  >
                    {canDelete && (
                      <td className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          disabled={!isDeletable}
                          title={
                            isDeletable
                              ? t("Ўчириш учун танлаш", "Select to delete")
                              : t(
                                  "Буюртма берилган — ўчириб бўлмайди",
                                  "Has an order — cannot delete",
                                )
                          }
                          checked={isChecked}
                          onChange={() => toggleOne(p.id)}
                        />
                      </td>
                    )}
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

      {/* Bulk delete confirmation modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border">
            <h2 className="text-lg font-bold">
              {t(
                `${deletableSelected.length} та лойиҳани ўчириш?`,
                `Delete ${deletableSelected.length} project${deletableSelected.length === 1 ? "" : "s"}?`,
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Бу амални орқага қайтариб бўлмайди. Фақат буюртма берилмаган сақланган ҳисоб-китоблар ўчирилади.",
                "This action cannot be undone. Only draft (un-ordered) saved calculations will be removed.",
              )}
            </p>
            {errorMsg && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
                {errorMsg}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                disabled={deleteMutation.isPending}
              >
                {t("Бекор қилиш", "Cancel")}
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(deletableSelected.map((p) => p.id))
                }
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                {t("Ўчириш", "Delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
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
