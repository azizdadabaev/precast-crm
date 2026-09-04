// Export deterministic engine vectors so the Kotlin port (Android
// :core:calc) can assert bit-for-bit parity. Run: npm run golden:calc
//
// Cases: the numbered tests in BLENDER_CALC_SPEC.md, one per pattern
// branch of autoPickPattern, start-beam promotions, manual extras,
// correction, extras-only mode, and a bearing sweep. Add a case here
// whenever a rule changes; the Android suite fails until it is ported.

import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  type SlabInput,
  type SlabResult,
  type PriceConfig,
} from "../src/services/calculation-engine";

export interface GoldenCase { name: string; input: SlabInput; result: SlabResult }
export interface GoldenFile { version: 1; pricing: PriceConfig; cases: GoldenCase[] }

const inputs: Array<{ name: string; input: SlabInput }> = [
  // BLENDER_CALC_SPEC.md verification tests (Tests 1–5)
  { name: "spec-test-1 plain GB", input: { inner_width: 4.0, inner_length: 5.8 } },
  { name: "spec-test-2 BGB small remainder", input: { inner_width: 4.0, inner_length: 5.95 } },
  { name: "spec-test-3 GBG medium remainder", input: { inner_width: 4.0, inner_length: 6.2 } },
  { name: "spec-test-4 large remainder bumps pitches", input: { inner_width: 4.0, inner_length: 6.7 } },
  { name: "spec-test-5 correction", input: { inner_width: 4.0, inner_length: 5.8, correction: 0.15 } },
  // Pattern overrides
  { name: "override GB on GBG geometry", input: { inner_width: 4.2, inner_length: 6.2, pattern: "GB" } },
  { name: "override BGB on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "BGB" } },
  { name: "override GBG on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "GBG" } },
  // Start-beam promotions
  { name: "force_start_beam on GBG", input: { inner_width: 3.6, inner_length: 6.2, force_start_beam: true } },
  { name: "force_start_beam on GB", input: { inner_width: 3.6, inner_length: 5.8, force_start_beam: true } },
  { name: "force_start_beam on BGB no-op", input: { inner_width: 3.6, inner_length: 5.95, force_start_beam: true } },
  // Manual extras
  { name: "GB + 2 extra beams", input: { inner_width: 5.0, inner_length: 5.8, extra_beams: 2 } },
  { name: "GBG + 1 extra consumed by start promotion", input: { inner_width: 5.0, inner_length: 6.2, extra_beams: 1 } },
  // Bearing sweep (tier boundaries)
  { name: "bearing 0.10 tier 4.30", input: { inner_width: 4.1, inner_length: 5.0, bearing: 0.10 } },
  { name: "bearing 0.15 tier 4.30 boundary", input: { inner_width: 4.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 5.30", input: { inner_width: 5.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 6.30", input: { inner_width: 6.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 7.30", input: { inner_width: 7.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 8.30", input: { inner_width: 8.0, inner_length: 5.0 } },
  { name: "beyond last tier clamps", input: { inner_width: 9.0, inner_length: 5.0 } },
  { name: "bearing 0.20", input: { inner_width: 4.0, inner_length: 5.0, bearing: 0.20 } },
  // Extras-only mode
  { name: "extras-only 3 beams 4.5m", input: { inner_width: 4.2, inner_length: 0, extra_beams: 3 } },
  { name: "extras-only 1 beam 6.0m", input: { inner_width: 5.7, inner_length: 0, extra_beams: 1 } },
  // Rounding edge cases
  { name: "half-away rounding length", input: { inner_width: 3.335, inner_length: 4.6455 } },
  { name: "tiny room", input: { inner_width: 1.0, inner_length: 1.0 } },
  { name: "long room many pitches", input: { inner_width: 4.0, inner_length: 12.0 } },
];

export const GOLDEN_CASES = inputs;

export function buildGolden(): GoldenFile {
  return {
    version: 1,
    pricing: DEFAULT_PRICE_CONFIG,
    cases: inputs.map((c) => ({
      name: c.name,
      input: c.input,
      result: calculateSlab(c.input, DEFAULT_PRICE_CONFIG),
    })),
  };
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/export-calc-golden.ts");
if (invokedDirectly) {
  const out = path.resolve(__dirname, "../../docs/api/calc-golden.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildGolden(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
