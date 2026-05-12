"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { useT } from "@/lib/i18n";
import type { AuthUser } from "@/lib/auth";

/**
 * BlenderStatusIndicator — a small persistent indicator that shows
 * whether the ws-bridge service currently has a Blender client
 * attached. Polls /api/drawings/status every 5 seconds.
 *
 * Owner-only (gated by `blender.bridge`). Renders nothing for users
 * without that permission, so it's safe to mount in the shared
 * sidebar footer.
 */

type Status = "connected" | "offline" | "checking";

const POLL_INTERVAL_MS = 5_000;

export function BlenderStatusIndicator({
  user,
  collapsed = false,
}: {
  user: AuthUser;
  collapsed?: boolean;
}) {
  const t = useT();
  const [status, setStatus] = useState<Status>("checking");

  // Gate by permission so we never start the polling loop for
  // non-owner roles. This MUST run before the effect short-circuits;
  // useEffect with the early-return pattern still gives us the same
  // behavior with React's rules-of-hooks consistency.
  const allowed = can(user, "blender.bridge");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/drawings/status", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (alive) setStatus("offline");
          return;
        }
        const data = (await res.json()) as { blenderConnected: boolean };
        if (alive) setStatus(data.blenderConnected ? "connected" : "offline");
      } catch {
        if (alive) setStatus("offline");
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [allowed]);

  if (!allowed) return null;

  const labelMap: Record<Status, string> = {
    connected: t("Blender уланган", "Blender connected"),
    offline: t("Blender оффлайн", "Blender offline"),
    checking: t("Текширилмоқда…", "Checking…"),
  };

  const dotCls = cn(
    "h-1.5 w-1.5 rounded-full shrink-0",
    status === "connected" && "bg-success",
    status === "offline" && "bg-destructive/70",
    status === "checking" && "bg-warning animate-pulse",
  );

  if (collapsed) {
    return (
      <div
        title={labelMap[status]}
        className="flex items-center justify-center py-1"
      >
        <div className="relative">
          <Boxes className="h-3.5 w-3.5 text-text-tertiary" />
          <span className={cn(dotCls, "absolute -right-0.5 -bottom-0.5")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-text-tertiary">
      <Boxes className="h-3.5 w-3.5 shrink-0" />
      <span className={dotCls} />
      <span className="truncate">{labelMap[status]}</span>
    </div>
  );
}
