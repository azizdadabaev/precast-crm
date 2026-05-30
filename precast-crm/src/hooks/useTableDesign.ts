"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { DEFAULT_TABLE_DESIGN, type TableDesignConfig } from "@/lib/table-design-config";

/**
 * Fetches the table design config from the server and caches it for
 * the session. Falls back to DEFAULT_TABLE_DESIGN on error so the
 * share card always renders consistently even if the API is down.
 *
 * staleTime: 5 min — the config changes infrequently and we don't
 * need to re-fetch on every page navigation.
 */
export function useTableDesign(): TableDesignConfig {
  const { data } = useQuery<TableDesignConfig>({
    queryKey: ["table-design"],
    queryFn: () => api<TableDesignConfig>("/api/settings/table-design"),
    staleTime: 5 * 60 * 1000,
    // Never throw — always fall back to defaults
    retry: false,
  });
  return data ?? DEFAULT_TABLE_DESIGN;
}
