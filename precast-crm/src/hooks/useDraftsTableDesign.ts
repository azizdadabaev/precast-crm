"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  DEFAULT_DRAFTS_TABLE_DESIGN,
  type DraftsTableDesignConfig,
} from "@/lib/drafts-table-design";

/**
 * Layout + palette for the saved-drafts table. Mirrors useTableDesign: cached
 * for the session, never throws — the drafts table must still render if the
 * settings API is down, so a failure falls back to the defaults.
 */
export function useDraftsTableDesign(): DraftsTableDesignConfig {
  const { data } = useQuery<DraftsTableDesignConfig>({
    queryKey: ["drafts-table-design"],
    queryFn: () => api<DraftsTableDesignConfig>("/api/settings/drafts-table-design"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? DEFAULT_DRAFTS_TABLE_DESIGN;
}
