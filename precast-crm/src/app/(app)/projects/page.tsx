"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableTh } from "@/components/ui/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { Plus, Search, Trash2, Loader2 } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { PhoneLink } from "@/components/PhoneLink";
import { useT } from "@/lib/i18n";
import { getViloyats, viloyatLabel } from "@/lib/regions";
import type { SortDir } from "@/lib/table-query";
import { useDraftsTableDesign } from "@/hooks/useDraftsTableDesign";
import { draftsTableStyleVars } from "@/lib/drafts-table-style";
import type { DraftsColumnKey } from "@/lib/drafts-table-design";
import { useThemeStore } from "@/store/theme";

type ProjectFilter = "DRAFT" | "ALL" | "AGENT";

interface Project {
  id: string;
  name: string | null;
  shapeType: string;
  status: "DRAFT" | "ORDERED" | "ARCHIVED";
  aiGenerated: boolean;
  dimensions: { width?: number; length?: number; widths?: number[] };
  createdAt: string;
  updatedAt: string;
  tentativeClientName: string | null;
  tentativeClientPhone: string | null;
  tentativeClientAddress: string | null;
  client: { id: string; name: string; phone: string; address: string | null } | null;
  createdBy: { name: string } | null;
  calculations: Array<{
    id: string;
    beamCount: number;
    totalBlocks: number;
    monolithLength: string;
    monolithArea: string;
    subtotal: string;
  }>;
  orders: Array<{ id: string; orderNumber: string; status: string }>;
}

/** Paginated envelope returned by /api/projects when `page` is sent. */
interface ProjectsResponse {
  rows: Project[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Whole-result-set status split, so the tracker isn't limited to one page. */
  statusCounts?: { DRAFT: number; ORDERED: number };
}

export default function ProjectsPage() {
  const t = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("DRAFT");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [operatorId, setOperatorId] = useState("");
  const [viloyat, setViloyat] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Single-row delete (uses /api/projects/[id], so it can also remove a
  // project that already became an order — unlike the DRAFT-only bulk delete).
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [rowErrorMsg, setRowErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ProjectsResponse>({
    queryKey: ["projects", filter, q, page, sortBy, sortDir, operatorId, viloyat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "DRAFT") params.set("status", "DRAFT");
      if (filter === "AGENT") params.set("source", "agent");
      if (q.trim()) params.set("q", q.trim());
      if (operatorId) params.set("operatorId", operatorId);
      if (viloyat) params.set("viloyat", viloyat);
      // `page` is what opts this caller into the paginated envelope.
      params.set("page", String(page));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      return api(`/api/projects?${params.toString()}`);
    },
    // Keep the previous page on screen while the next one loads.
    placeholderData: (prev) => prev,
  });
  const projects = useMemo(() => data?.rows ?? [], [data]);

  // Permission check — only show selection UI to users with project.delete.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canDelete = me?.permissions?.includes("project.delete") ?? false;

  // Operator filter options. Reuses the @mention list (same order.view gate).
  const { data: operators = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["users", "mentionable"],
    queryFn: () => api("/api/users/mentionable"),
    staleTime: 5 * 60_000,
  });

  const viloyats = useMemo(() => getViloyats(), []);
  const filtersActive = Boolean(viloyat || operatorId);

  // Owner-editable table layout (global, from /table-design/drafts). Column
  // ORDER is the array order; hidden columns are dropped entirely. Everything
  // visual is passed down as `--dt-*` CSS variables on the <table>, so a theme
  // flip re-renders one style object instead of every cell.
  const design = useDraftsTableDesign();
  const isDark = useThemeStore((s) => s.theme) === "dark";
  const visibleColumns = useMemo(
    () => design.columns.filter((c) => c.visible),
    [design],
  );
  const tableStyle = useMemo(
    () => draftsTableStyleVars(design, isDark),
    [design, isDark],
  );

  /** Re-clicking the active column flips direction; any change resets paging. */
  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // Selection is page-scoped: rows the operator can no longer see must never
  // stay silently checked and end up in a bulk delete.
  useEffect(() => {
    setSelected(new Set());
  }, [filter, q, page, sortBy, sortDir, operatorId, viloyat]);

  // A delete can shrink the table past the current page — snap back so the
  // operator never lands on an empty page with no pager to escape it.
  useEffect(() => {
    if (data && page > data.pageCount) setPage(data.pageCount);
  }, [data, page]);

  // Project→Order conversion tracker. Counted client-side from the rows
  // currently on screen — i.e. the loaded page of the active filter, not
  // the whole table (the status split isn't part of the API envelope).
  // Counts come from the server over the WHOLE filtered result set — counting
  // the loaded rows would only ever describe the current page and understate
  // conversion. Falls back to the page's own rows if an older/unpaginated
  // response arrives without the counts.
  const tracker = useMemo(() => {
    const counts = data?.statusCounts;
    const ordered = counts ? counts.ORDERED : projects.filter((p) => p.status === "ORDERED").length;
    const draft = counts ? counts.DRAFT : projects.filter((p) => p.status === "DRAFT").length;
    const total = counts ? data?.total ?? ordered + draft : projects.length;
    const pct = total > 0 ? Math.round((ordered / total) * 100) : 0;
    return { total, ordered, draft, pct };
  }, [projects, data]);

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

  const deleteOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/projects/" + id, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      return json as { deleted: boolean };
    },
    onSuccess: () => {
      setToDelete(null);
      setRowErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => setRowErrorMsg(e.message),
  });

  // Column filter popovers. Plain selects so the whole option list stays
  // keyboard-reachable inside the header popover.
  const filterSelectClass =
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs";

  const viloyatFilter = (
    <select
      className={filterSelectClass}
      aria-label={t("Вилоят бўйича фильтр", "Filter by region")}
      value={viloyat}
      onChange={(e) => {
        setViloyat(e.target.value);
        setPage(1);
      }}
    >
      <option value="">Барчаси · All</option>
      {viloyats.map((v) => (
        <option key={v.id} value={v.name}>
          {viloyatLabel(v.name)}
        </option>
      ))}
    </select>
  );

  const operatorFilter = (
    <select
      className={filterSelectClass}
      aria-label={t("Оператор бўйича фильтр", "Filter by operator")}
      value={operatorId}
      onChange={(e) => {
        setOperatorId(e.target.value);
        setPage(1);
      }}
    >
      <option value="">Барчаси · All</option>
      <option value="ai">AI агент · AI agent</option>
      <option value="none">—</option>
      {operators.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );

  // Header cells keyed by column so the designer can reorder/hide them without
  // any header losing its behaviour: sortability and the filter funnel belong
  // to the COLUMN, not to its position.
  //   - sortable:   Ҳолат, Янгиланди, Оператор
  //   - funnels:    Манзил (вилоят), Оператор
  //   - inert:      Мижоз / Тел (they render a client → tentative fallback, so
  //                 no SQL ordering can match what's on screen) and the five
  //                 totals below, which are reduced from `calculations` in the
  //                 browser and therefore cannot be ordered server-side.
  const headerCells: Record<DraftsColumnKey, ReactNode> = {
    client: (
      <SortableTh key="client">
        Мижоз<span className="lang-en"> · Client</span>
      </SortableTh>
    ),
    phone: (
      <SortableTh key="phone">
        Тел<span className="lang-en"> · Phone</span>
      </SortableTh>
    ),
    address: (
      <SortableTh key="address" filterContent={viloyatFilter} filterActive={Boolean(viloyat)}>
        Манзил<span className="lang-en"> · Address</span>
      </SortableTh>
    ),
    rooms: (
      <SortableTh key="rooms" align="center">
        Хоналар<span className="lang-en"> · Rooms</span>
      </SortableTh>
    ),
    slabL: (
      <SortableTh key="slabL" align="right">
        Монолит Б<span className="lang-en"> · Slab L</span>
      </SortableTh>
    ),
    area: (
      <SortableTh key="area" align="right">
        Майдон<span className="lang-en"> · Area</span>
      </SortableTh>
    ),
    weight: (
      <SortableTh key="weight" align="right">
        Оғирлик<span className="lang-en"> · Weight</span>
      </SortableTh>
    ),
    subtotal: (
      <SortableTh key="subtotal" align="right">
        Сумма<span className="lang-en"> · Subtotal</span>
      </SortableTh>
    ),
    status: (
      <SortableTh
        key="status"
        field="status"
        activeField={sortBy}
        activeDir={sortDir}
        onSort={handleSort}
      >
        {t("Ҳолат", "Status")}
      </SortableTh>
    ),
    updated: (
      <SortableTh
        key="updated"
        field="updatedAt"
        activeField={sortBy}
        activeDir={sortDir}
        onSort={handleSort}
      >
        {t("Янгиланди", "Updated")}
      </SortableTh>
    ),
    operator: (
      <SortableTh
        key="operator"
        field="operator"
        activeField={sortBy}
        activeDir={sortDir}
        onSort={handleSort}
        filterContent={operatorFilter}
        filterActive={Boolean(operatorId)}
      >
        Оператор<span className="lang-en"> · Operator</span>
      </SortableTh>
    ),
  };

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

      {/* Tracker — projects → orders conversion for the rows on screen.
          Hidden when there are no rows. */}
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
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex rounded-md border border-border bg-card overflow-hidden">
          {([
            { key: "DRAFT", label: t("Лойиҳалар", "Drafts") },
            { key: "ALL", label: t("Барчаси", "All") },
            { key: "AGENT", label: t("AI агент", "AI Agent") },
          ] as const).map((opt) => {
            const active = filter === opt.key;
            const isAgent = opt.key === "AGENT";
            return (
              <button
                key={opt.key}
                type="button"
                className={`px-3 h-9 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? isAgent
                      ? "bg-amber-500 text-white"
                      : "bg-primary text-primary-foreground"
                    : isAgent
                      ? "text-amber-600 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => {
                  setFilter(opt.key);
                  setPage(1);
                }}
              >
                {isAgent ? "🤖 " : ""}
                {opt.label}
              </button>
            );
          })}
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
              : filtersActive
                ? t(
                    "Танланган фильтрларга мос лойиҳа йўқ.",
                    "No projects match the selected filters.",
                  )
                : t(
                    "Ҳозирча лойиҳалар йўқ — ҳисоб-китобни бошланг.",
                    "No drafts yet — start a calculation to save one.",
                  )}
            {/* Without this the column funnels are unreachable — the header
                row isn't rendered when the filtered result is empty. */}
            {filtersActive && (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViloyat("");
                    setOperatorId("");
                    setPage(1);
                  }}
                >
                  {t("Фильтрларни тозалаш", "Clear filters")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
          <table className="drafts-table w-full min-w-[760px] table-fixed" style={tableStyle}>
            {/* Configured widths. The selection and delete columns are fixed
                and never part of the design. */}
            <colgroup>
              {canDelete && <col style={{ width: 40 }} />}
              {visibleColumns.map((c) => (
                <col key={c.key} style={{ width: `${c.width}%` }} />
              ))}
              {canDelete && <col style={{ width: 40 }} />}
            </colgroup>
            <thead>
              <tr>
                {canDelete && (
                  <th>
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
                {visibleColumns.map((c) => headerCells[c.key])}
                {canDelete && <th />}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const totalLength = p.calculations.reduce(
                  (s, c) => s + Number(c.monolithLength),
                  0,
                );
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
                // Body cells keyed like the headers. `dt-muted` / `dt-accent`
                // opt into the configured secondary / money colors; the rest
                // inherit the configured body color from `.drafts-table`.
                const cells: Record<DraftsColumnKey, ReactNode> = {
                  client: (
                    <td key="client">
                      <div className="flex items-center gap-2">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                          {clientName}
                        </Link>
                        {p.aiGenerated && (
                          <span
                            title={t("AI агент яратган", "Created by the AI agent")}
                            className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-white rounded px-1.5 py-0.5"
                          >
                            🤖 AI
                          </span>
                        )}
                      </div>
                      {p.name && (
                        <div className="text-xs text-muted-foreground">{p.name}</div>
                      )}
                    </td>
                  ),
                  phone: (
                    <td key="phone" className="tabular-nums">
                      {clientPhone ? <PhoneLink phone={clientPhone} /> : "—"}
                    </td>
                  ),
                  address: (
                    <td key="address" className="dt-muted">
                      {clientAddress || "—"}
                    </td>
                  ),
                  rooms: (
                    <td key="rooms" className="text-center">
                      {p.calculations.length}
                    </td>
                  ),
                  slabL: (
                    <td key="slabL" className="text-right tabular-nums dt-muted">
                      {formatNumber(totalLength, 2)} m
                    </td>
                  ),
                  area: (
                    <td key="area" className="text-right tabular-nums">
                      {formatNumber(totalArea, 2)} m²
                    </td>
                  ),
                  weight: (
                    <td key="weight" className="text-right tabular-nums dt-muted">
                      {formatNumber(totalArea * 180, 0)} <span className="text-xs">кг</span>
                    </td>
                  ),
                  subtotal: (
                    <td key="subtotal" className="text-right tabular-nums dt-accent">
                      {formatNumber(totalSum, 0)}
                    </td>
                  ),
                  status: (
                    <td key="status">
                      <StatusPill status={p.status} order={order} />
                    </td>
                  ),
                  updated: (
                    <td key="updated" className="dt-muted">
                      {formatDate(p.updatedAt)}
                    </td>
                  ),
                  operator: (
                    <td key="operator">
                      {p.aiGenerated ? (
                        <span
                          title={t("AI агент яратган", "Created by the AI agent")}
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-white rounded px-1.5 py-0.5"
                        >
                          🤖 AI
                        </span>
                      ) : (
                        p.createdBy?.name ?? "—"
                      )}
                    </td>
                  ),
                };
                return (
                  <tr
                    key={p.id}
                    className={"transition-colors " + (isChecked ? "dt-selected" : "")}
                  >
                    {canDelete && (
                      <td>
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
                    {visibleColumns.map((c) => cells[c.key])}
                    {canDelete && (
                      <td>
                        <button
                          type="button"
                          title={t("Лойиҳани ўчириш", "Delete project")}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRowErrorMsg(null);
                            setToDelete(p);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {data && (
            <TablePager
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              pageSize={data.pageSize}
              onPage={setPage}
            />
          )}
          </>
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

      {/* Single-row delete confirmation modal */}
      {toDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setToDelete(null)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              Лойиҳани ўчириш<span className="lang-en font-normal"> · Delete project</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Лойиҳа ва (агар бўлса) унинг буюртмаси ўчирилади.",
                "The project and its order (if any) will be permanently deleted.",
              )}
            </p>
            {rowErrorMsg && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
                {rowErrorMsg}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setToDelete(null)}
                disabled={deleteOneMutation.isPending}
              >
                {t("Бекор қилиш", "Cancel")}
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={deleteOneMutation.isPending}
                onClick={() => deleteOneMutation.mutate(toDelete.id)}
              >
                {deleteOneMutation.isPending ? (
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
