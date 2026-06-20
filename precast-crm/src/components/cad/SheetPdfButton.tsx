"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { Bi, useT } from "@/lib/i18n";
import { slabRowsToSheetPayload } from "@/lib/cad/sheet/rooms-to-payload";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

/**
 * SheetPdfButton — generates and opens the CAD "drawing sheet" PDF for the
 * rooms currently in the calculator (Phase 7).
 *
 * Owner-only, gated by the same `blender.bridge` permission as the Blender
 * drawing flow. The check mirrors the calculator's existing client-side
 * permission pattern (the ["me"] query exposing `permissions`); when the
 * caller lacks the gate the component renders nothing.
 *
 * On success the PDF blob is opened in a new tab; on failure the route's
 * `{ error }` message is surfaced inline beneath the button.
 */

type Props = {
  rows: SlabRow[];
  className?: string;
};

export function SheetPdfButton({ rows, className }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canRender = me?.permissions?.includes("blender.bridge") ?? false;

  if (!canRender) return null;

  const payload = slabRowsToSheetPayload(rows);
  const disabled = busy || payload.length === 0;

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/drawings/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rooms: payload }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("Чизма яратилмади", "Failed to generate drawing"));
        return;
      }

      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      setError(t("Тармоқ хатоси", "Network error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"flex flex-col items-start gap-1 " + (className ?? "")}>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={generate}
        className="gap-2"
        title={
          payload.length === 0
            ? t("Аввал хона қўшинг", "Add a room first")
            : undefined
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        <span>
          {busy ? (
            t("Яратилмоқда…", "Generating…")
          ) : (
            <Bi uz="Чизма (PDF)" en="Drawing (PDF)" enClassName="font-normal opacity-90" />
          )}
        </span>
      </Button>

      {error && (
        <p className="text-[11px] text-destructive max-w-xs leading-snug">{error}</p>
      )}
    </div>
  );
}
