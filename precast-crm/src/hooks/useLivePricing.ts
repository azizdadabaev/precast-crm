"use client";

// Live pricing config hook — fetches the owner-editable tier table from
// /api/pricing and returns a PriceConfig that callers can hand to
// calculateSlab / recomputeRow. Falls back to DEFAULT_PRICE_CONFIG until
// the fetch resolves so the calculator never blocks on a network round
// trip; the brief flash of default prices on first paint is acceptable
// because the server-side compute on Save/Place is always authoritative.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  DEFAULT_PRICE_CONFIG,
  M2_PRICE_TIERS,
  EXTRA_BEAM_PRICE_TIERS,
  type PriceConfig,
} from "@/services/calculation-engine";

interface PricingResponse {
  m2PriceTiers: Array<{ max_beam_length: number; price: number }>;
  extraBeamPriceTiers: Array<{ max_beam_length: number; price: number }>;
  blockUnitPrice: number;
}

export function useLivePricing(): PriceConfig {
  const { data } = useQuery<PricingResponse>({
    queryKey: ["pricing"],
    queryFn: () => api("/api/pricing"),
    // Pricing rarely changes during a session; keep the cache warm
    // across all components that look at it. Window-focus refetch is
    // off — we don't want the calc to flicker when the operator
    // alt-tabs.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return useMemo<PriceConfig>(() => {
    if (!data) return DEFAULT_PRICE_CONFIG;
    return {
      m2_price_tiers: M2_PRICE_TIERS.map((t, i) => ({
        max_beam_length: t.max_beam_length,
        price: data.m2PriceTiers[i]?.price ?? t.price,
      })),
      extra_beam_price_tiers: EXTRA_BEAM_PRICE_TIERS.map((t, i) => ({
        max_beam_length: t.max_beam_length,
        price: data.extraBeamPriceTiers[i]?.price ?? t.price,
      })),
      block_unit_price: data.blockUnitPrice,
    };
  }, [data]);
}
