"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * SendToBlenderButton — fire-and-forget action button rendered on the
 * order detail and saved-project detail pages.
 *
 * Lifecycle:
 *   idle      → click → sending (POST /api/drawings/request)
 *   sending   → 200 ok  → submitted (auto-resets to idle after 3s)
 *              → 503 BLENDER_OFFLINE → failed with specific message
 *              → other error        → failed with generic message
 *
 * There is no polling. The PDF appears in the Drawings section of the
 * order/project page once Blender delivers it. The user refreshes or
 * navigates away and back.
 *
 * Visibility is the caller's responsibility — guard with
 * `can(user, "blender.bridge")` before rendering.
 */

type Props = {
  orderId?: string;
  projectId?: string;
  label?: string;
  className?: string;
};

type State = "idle" | "sending" | "submitted" | "failed";

export function SendToBlenderButton({
  orderId,
  projectId,
  label,
  className,
}: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  async function send() {
    setError(null);
    setState("sending");

    try {
      const res = await fetch("/api/drawings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, projectId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as {
          error?: string;
          code?: string;
        };

        if (body.code === "BLENDER_OFFLINE") {
          setError(
            t(
              "Blender ulanmagan — eganing kompyuterida Blender ochiq va addon yoqilgan bo'lishi kerak",
              "Blender is not connected — make sure Blender is open on the owner's PC with the addon enabled",
            ),
          );
        } else {
          setError(
            body.error ?? t("Yuborib bo'lmadi", "Failed to send to Blender"),
          );
        }
        setState("failed");
        return;
      }

      // Kick the Drawings section to refetch immediately — without this,
      // the section's refetchInterval only wakes up when its cached data
      // already shows a PENDING row, so the new request would be invisible
      // until the next page reload. Invalidating the matching query key
      // makes the freshly-created PENDING row appear, which then triggers
      // the section's 3s poll until DELIVERED.
      const queryParam = orderId ? `orderId=${orderId}` : `projectId=${projectId}`;
      qc.invalidateQueries({ queryKey: ["drawings", queryParam] });

      setState("submitted");
      resetRef.current = setTimeout(() => setState("idle"), 3000);
    } catch {
      setError(t("Tarmoq xatosi · Network error", "Network error"));
      setState("failed");
    }
  }

  function reset() {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    setError(null);
    setState("idle");
  }

  const busy = state === "sending";
  const fallbackLabel = orderId
    ? t("Blender га юбориш", "Send to Blender")
    : t("Blender га юбориш", "Send project to Blender");

  return (
    <div className={"flex flex-col items-end gap-1 " + (className ?? "")}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || state === "submitted"}
        onClick={state === "failed" ? reset : send}
        className="gap-2"
      >
        {state === "idle" && <Boxes className="h-4 w-4" />}
        {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "submitted" && (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {state === "failed" && <XCircle className="h-4 w-4 text-destructive" />}

        <span>
          {state === "idle" && (label || fallbackLabel)}
          {state === "sending" && t("Yuborilmoqda…", "Sending…")}
          {state === "submitted" && t("Yuborildi ✓", "Submitted ✓")}
          {state === "failed" && t("Qayta urinish", "Retry")}
        </span>
      </Button>

      {state === "submitted" && (
        <p className="text-[11px] text-muted-foreground max-w-xs text-right leading-snug">
          {t(
            "PDF buyurtma sahifasida tayyor bo'lganda paydo bo'ladi",
            "PDF will appear on the order page when ready",
          )}
        </p>
      )}

      {state === "failed" && error && (
        <p className="text-[11px] text-destructive max-w-xs text-right leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
