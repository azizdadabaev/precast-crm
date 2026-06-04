"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  hydrateCalculatorAnon,
  scopeCalculatorPersistToUser,
  setCalculatorPersistKeyForUser,
} from "./calculator";
import { decodePrefillParam } from "@/sandbox/tapered-beam-block/calculator-bridge";
import { TaperedPrefillSchema } from "@/lib/validation";

interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Drives the calculator store's one-time hydration on app mount.
 *
 * Why a hook and not auto-hydration:
 *   - SSR safety: the persist middleware runs `skipHydration: true`, so
 *     nothing reads localStorage during server render.
 *   - Per-user keying: factory PCs are shared. Each operator should see
 *     their own draft. We resolve the user via /api/auth/me, then point
 *     the persist storage at `calculator-draft-${userId}` and rehydrate
 *     from there.
 *   - Legacy migration: on first hit, copy from `calc:autosave:v1` (the
 *     pre-Zustand autosave) into the per-user slot, then delete the old
 *     keys.
 *
 * Returns `hydrated = true` once whichever path (per-user or anon) has
 * settled. Callers gate the calculator UI on this so the operator never
 * briefly sees an empty calculator before their draft loads.
 */
export function useHydrateCalculator(): { hydrated: boolean } {
  const [hydrated, setHydrated] = useState(false);

  // /api/auth/me resolves the user id we key the per-user slot under.
  // Failures (401, network) fall through to anon. We don't retry — the
  // user can refresh if /me transiently fails; meanwhile anon still
  // gives them a working calculator.
  const meQuery = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/api/auth/me");
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    let cancelled = false;
    if (meQuery.isLoading) return;
    (async () => {
      const userId = meQuery.data?.id ?? null;
      // A sandbox handoff (?prefill=…) REPLACES the draft, so don't load the
      // persisted draft — rehydrating it would race with and clobber the
      // prefill (Strict Mode double-invokes this effect; a discarded
      // invocation's async rehydrate can land after the page's loadFrom). Only
      // skip for a VALID prefill so a malformed payload still falls back to the
      // draft. The page's mount effect applies the prefill rows.
      const prefillRaw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("prefill")
          : null;
      const hasValidPrefill = prefillRaw
        ? TaperedPrefillSchema.safeParse(decodePrefillParam(prefillRaw)).success
        : false;

      if (hasValidPrefill) {
        if (userId) setCalculatorPersistKeyForUser(userId); // point key, don't rehydrate
      } else if (userId) {
        await scopeCalculatorPersistToUser(userId);
      } else {
        await hydrateCalculatorAnon();
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [meQuery.isLoading, meQuery.data]);

  return { hydrated };
}
