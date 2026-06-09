// Agent-only slab pattern policy (confirmed with the owner 2026-06-09).
//
// The agent must never AUTO-quote Г-Б-Г (GBG): that pattern's closing block row
// (sitting half on the ring beam, half on the wall) is hard to explain to a
// customer, whereas Г-Б (start beam → close with a filler block) and Б-Г-Б
// (closing beam) match how a client pictures the layout. So when the engine's
// auto-pick would land on GBG, round the slab UP to the next full pitch and use
// Г-Б instead. Г-Б / Б-Г-Б that auto-pick naturally are left untouched, and an
// EXPLICIT pattern (operator/customer asked for it) is always respected.
//
// SCOPE: this is applied ONLY on the agent's quote + draft paths (get_quote and
// the conversation draft). The operator calculator and createOrder's recompute
// are untouched — operators keep manual pattern control. The round-up is encoded
// as a length CORRECTION, so the customer's inner_length stays exactly as given
// and EVERY recompute (quote → draft → order) reproduces the same Г-Б result.

import { calculateSlab, PITCH, round3, type SlabInput } from '@/services/calculation-engine';

/**
 * If auto-pick would choose Г-Б-Г, return the input rounded up to the next full
 * pitch as Г-Б (via a correction; inner_length unchanged). Otherwise return the
 * input unchanged. Pure + deterministic so the quote and the persisted draft
 * agree without threading state between them.
 */
export function applyAgentPatternPolicy(input: SlabInput): SlabInput {
  if (input.pattern) return input; // explicit override — respect it
  let dry;
  try {
    dry = calculateSlab(input);
  } catch {
    return input; // invalid dims surface in the caller's escalation; don't mask
  }
  if (dry.pattern_auto !== 'GBG') return input; // GB / BGB auto-picks: leave as-is

  // GBG band is 0.20 < R ≤ 0.45 with pitches = floor(eff/PITCH). Round up to
  // (pitches+1) full pitches as GB; fold the bump into any existing correction.
  const delta = round3((dry.pitches + 1) * PITCH - dry.effective_length);
  return {
    ...input,
    correction: round3((input.correction ?? 0) + delta),
    pattern: 'GB',
  };
}
