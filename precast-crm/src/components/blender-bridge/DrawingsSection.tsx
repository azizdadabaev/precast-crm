"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface DrawingRow {
  id: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  createdAt: string;
  deliveredAt: string | null;
  errorMessage: string | null;
  pdfStorageKey: string | null;
  pdfSizeBytes: number | null;
  pageCount: number | null;
  renderMs: number | null;
  createdBy: { name: string } | null;
}

type Props =
  | { orderId: string; projectId?: never }
  | { projectId: string; orderId?: never };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DrawingsSection({ orderId, projectId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const queryParam = orderId ? `orderId=${orderId}` : `projectId=${projectId}`;

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/drawings/request/${id}/delete`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["drawings", queryParam] });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  const { data: drawings = [], isLoading } = useQuery<DrawingRow[]>({
    queryKey: ["drawings", queryParam],
    queryFn: () => api(`/api/drawings/list?${queryParam}`),
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows) return false;
      return rows.some((r) => r.status === "PENDING") ? 3000 : false;
    },
  });

  if (isLoading) return null;
  if (drawings.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 border-b flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-baseline justify-between gap-2 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Чизмалар<span className="lang-en"> · Drawings</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {drawings.length}{" "}
            {t(
              drawings.length === 1 ? "сўров" : "сўров",
              drawings.length === 1 ? "request" : "requests",
            )}
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ml-2 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul className="divide-y">
          {drawings.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                {d.status === "PENDING" && (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
                )}
                {d.status === "DELIVERED" && (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                )}
                {d.status === "FAILED" && (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={[
                        "text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5",
                        d.status === "PENDING"
                          ? "bg-amber-100 text-amber-800"
                          : d.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800",
                      ].join(" ")}
                    >
                      {d.status === "PENDING"
                        ? t("Кутилмоқда", "Pending")
                        : d.status === "DELIVERED"
                          ? t("Тайёр", "Ready")
                          : t("Хато", "Failed")}
                    </span>

                    {d.status === "DELIVERED" && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {d.pageCount != null && `${d.pageCount} pp`}
                        {d.pageCount != null && d.pdfSizeBytes != null && " · "}
                        {d.pdfSizeBytes != null && formatBytes(d.pdfSizeBytes)}
                      </span>
                    )}

                    {d.status === "FAILED" && d.errorMessage && (
                      <span className="text-xs text-destructive truncate max-w-xs">
                        {d.errorMessage}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatDate(d.createdAt)}
                    {d.createdBy && <> · {d.createdBy.name}</>}
                    {d.status === "DELIVERED" && d.deliveredAt && (
                      <> · {t("тайёр", "ready")} {formatDate(d.deliveredAt)}</>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {confirmDelete === d.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting === d.id}
                      onClick={() => handleDelete(d.id)}
                      className="gap-1.5"
                    >
                      {deleting === d.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                      {t("Ўчириш", "Delete")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleting === d.id}
                      onClick={() => setConfirmDelete(null)}
                    >
                      {t("Бекор", "Cancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(d.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title={t("Ўчириш", "Delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}

                {d.status === "DELIVERED" && d.pdfStorageKey && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <a href={`/api/drawings/request/${d.id}/pdf`} download>
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </a>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
