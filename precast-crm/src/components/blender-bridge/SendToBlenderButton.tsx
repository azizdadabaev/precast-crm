"use client";

import { useEffect, useRef, useState } from "react";
import { Boxes, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * SendToBlenderButton — owner-only action button rendered on the
 * order detail and saved-project detail pages.
 *
 * Lifecycle:
 *   idle      → click → sending (POST /api/drawings/request)
 *   sending   → got id → polling (GET /api/drawings/request/[id])
 *   polling   → status=DELIVERED → delivered (auto-resets after 3s)
 *              → status=FAILED   → failed (clears error after click)
 *              → 30s timeout     → failed with "Blender offline"
 *
 * Visibility is the caller's responsibility — guard with
 * `can(user, "blender.bridge")` before rendering so non-owners
 * never see the button.
 */

type Props = {
  orderId?: string;
  projectId?: string;
  label?: string;
  className?: string;
};

type State = "idle" | "sending" | "polling" | "delivered" | "failed";

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_TICKS = 30; // 30s total — Blender ack should arrive in seconds

export function SendToBlenderButton({
  orderId,
  projectId,
  label,
  className,
}: Props) {
  const t = useT();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  // Track active intervals/timeouts so unmount + state transitions
  // cancel cleanly. Without this, switching pages mid-poll leaks the
  // timer + can call setState on an unmounted component.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (resetRef.current) clearTimeout(resetRef.current);
  }, []);

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
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ??
            t("Юбориб бўлмади", "Failed to send to Blender"),
        );
      }

      const { id } = (await res.json()) as { id: string };
      setState("polling");

      // Poll the single-request endpoint until terminal status or
      // timeout. Each tick is a GET; on network blip we just keep
      // polling — the timeout is the upper bound.
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks++;
        try {
          const r = await fetch(`/api/drawings/request/${id}`, {
            cache: "no-store",
          });
          if (!r.ok) {
            // 404 = row vanished (unlikely); other = network — keep going
            if (ticks >= POLL_MAX_TICKS) {
              stopPoll();
              setError(
                t(
                  "Жавоб йўқ — Blender очиқми ва аддон ишлаяптими?",
                  "Timed out — is Blender open with the addon connected?",
                ),
              );
              setState("failed");
            }
            return;
          }
          const data = (await r.json()) as {
            status: "PENDING" | "DELIVERED" | "FAILED";
            errorMessage: string | null;
          };
          if (data.status === "DELIVERED") {
            stopPoll();
            setState("delivered");
            resetRef.current = setTimeout(() => setState("idle"), 3000);
          } else if (data.status === "FAILED") {
            stopPoll();
            setError(
              data.errorMessage ||
                t(
                  "Blender хатолик қайтарди",
                  "Blender returned an error",
                ),
            );
            setState("failed");
          } else if (ticks >= POLL_MAX_TICKS) {
            stopPoll();
            setError(
              t(
                "Жавоб йўқ — Blender очиқми ва аддон ишлаяптими?",
                "Timed out — is Blender open with the addon connected?",
              ),
            );
            setState("failed");
          }
        } catch {
          if (ticks >= POLL_MAX_TICKS) {
            stopPoll();
            setError(
              t("Тармоқ хатоси · Network error", "Network error"),
            );
            setState("failed");
          }
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("failed");
    }
  }

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function reset() {
    stopPoll();
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    setError(null);
    setState("idle");
  }

  const busy = state === "sending" || state === "polling";
  const fallbackLabel = orderId
    ? t("Blender'га юбориш", "Send to Blender")
    : t("Blender'га юбориш", "Send project to Blender");

  return (
    <div className={"flex flex-col items-end gap-1 " + (className ?? "")}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || state === "delivered"}
        onClick={state === "failed" ? reset : send}
        title={
          state === "failed" && error
            ? error
            : state === "polling"
              ? t(
                  "Blender очиқ бўлсин — қабул кутилмоқда",
                  "Make sure Blender is open with the precast addon",
                )
              : undefined
        }
        className="gap-2"
      >
        {state === "idle" && <Boxes className="h-4 w-4" />}
        {state === "sending" && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {state === "polling" && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {state === "delivered" && (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {state === "failed" && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}

        <span>
          {state === "idle" && (label || fallbackLabel)}
          {state === "sending" && t("Юборилмоқда…", "Sending…")}
          {state === "polling" && t("Кутилмоқда…", "Waiting for Blender…")}
          {state === "delivered" && t("Юборилди ✓", "Sent ✓")}
          {state === "failed" && t("Қайта уриниш", "Retry")}
        </span>
      </Button>

      {state === "failed" && error && (
        <p className="text-[11px] text-destructive max-w-xs text-right leading-snug">
          {error}
        </p>
      )}
      {state === "polling" && (
        <p className="text-[11px] text-muted-foreground max-w-xs text-right leading-snug">
          {t(
            "Blender'нинг очиқ ва аддон уланганлигини текшириб кўринг…",
            "Make sure Blender is open with the precast addon connected…",
          )}
        </p>
      )}
    </div>
  );
}
