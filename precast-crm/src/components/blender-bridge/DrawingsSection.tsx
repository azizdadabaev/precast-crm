"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
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
  const queryParam = orderId ? `orderId=${orderId}` : `projectId=${projectId}`;

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
      <div className="px-4 py-3 border-b flex items-baseline justify-between">
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

            {d.status === "DELIVERED" && d.pdfStorageKey && (
              <Button variant="outline" size="sm" asChild className="gap-1.5 shrink-0">
                <a
                  href={`/api/drawings/request/${d.id}/pdf`}
                  download
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
