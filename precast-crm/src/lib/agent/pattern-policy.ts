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
 * Normalize a room to the agent's pattern rule:
 *   pitches = roundUp(inner_length / PITCH), built as Г-Б.
 * i.e. the slab ALWAYS covers the room and is NEVER Г-Б-Г. This holds no matter
 * how the pattern was chosen — auto-pick OR an explicit `pattern` the model
 * passed (an explicit Г-Б uses floor() pitches in the engine and would
 * UNDER-COVER, which is the bug this fixes). The round-up is encoded as a length
 * correction so inner_length stays the customer's value and every recompute
 * (quote → draft → order) reproduces it. Pure + deterministic.
 *
 * The ONE exception is a naturally-chosen Б-Г-Б (owner's decision: keep it) —
 * its closing beam already extends the slab, and it's an intuitive layout.
 */
export function applyAgentPatternPolicy(input: SlabInput): SlabInput {
  let dry;
  try {
    dry = calculateSlab(input);
  } catch {
    return input; // invalid dims surface in the caller's escalation; don't mask
  }
  if (dry.pattern === 'BGB') return input; // keep Б-Г-Б

  // A Г-Б that already covers the room (auto-pick at R=0, or at R>0.45 where the
  // engine itself rounded up) is correct as-is. For Г-Б the slab span along the
  // length axis is pitches × PITCH (no pattern extension).
  const covers = dry.pitches * PITCH + 1e-9 >= input.inner_length;
  if (dry.pattern === 'GB' && covers) return input;

  // Г-Б-Г, or a Г-Б that under-covers → round UP to Г-Б at the next full pitch.
  // (R > 0 here, so ceil(eff/PITCH) === floor(eff/PITCH) + 1 === dry.pitches + 1.)
  const delta = round3((dry.pitches + 1) * PITCH - dry.effective_length);
  return {
    ...input,
    correction: round3((input.correction ?? 0) + delta),
    pattern: 'GB',
  };
}
