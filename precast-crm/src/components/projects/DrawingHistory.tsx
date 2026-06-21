"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Bi, useT } from "@/lib/i18n";

interface DrawingVersion {
  id: string;
  label: string | null;
  roomsJson: Array<{ name: string | null; subtotal: number }>;
  createdAt: string;
}

/**
 * Append-only floor-plan version timeline for a project. Versions are captured
 * automatically on each Save (before the prior calculations are overwritten),
 * so a quote is never silently lost on an edit. Restore re-applies a version
 * (the current state is snapshotted first, so it's reversible).
 */
export function DrawingHistory({ projectId }: { projectId: string }) {
  const t = useT();
  const qc = useQueryClient();

  const { data: versions = [], isLoading } = useQuery<DrawingVersion[]>({
    queryKey: ["drawing-versions", projectId],
    queryFn: () => api(`/api/projects/${projectId}/drawing-versions`),
  });

  const restore = useMutation({
    mutationFn: (vid: string) =>
      api(`/api/projects/${projectId}/drawing-versions/${vid}/restore`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drawing-versions", projectId] });
      qc.invalidateQueries({ queryKey: ["projects-all"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  if (isLoading || versions.length === 0) return null;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <History className="h-4 w-4" />
        <Bi uz="Чизма тарихи" en="Drawing history" />
        <span className="text-xs font-normal text-muted-foreground">({versions.length})</span>
      </div>
      <ul className="divide-y text-sm">
        {versions.map((v) => {
          const rooms = Array.isArray(v.roomsJson) ? v.roomsJson : [];
          const total = rooms.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
          return (
            <li key={v.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate text-slate-700">
                  {v.label && (
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[11px]">{v.label}</span>
                  )}
                  {new Date(v.createdAt).toLocaleString()}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {rooms.length} {t("хона", "rooms")} · {total.toLocaleString()} UZS
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={restore.isPending}
                onClick={() => {
                  if (window.confirm(t("Бу версияни тиклаш?", "Restore this version?"))) {
                    restore.mutate(v.id);
                  }
                }}
              >
                {restore.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">
                  <Bi uz="Тиклаш" en="Restore" />
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
