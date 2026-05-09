"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  hydrateCalculatorAnon,
  scopeCalculatorPersistToUser,
} from "./calculator";

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
      if (userId) {
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
