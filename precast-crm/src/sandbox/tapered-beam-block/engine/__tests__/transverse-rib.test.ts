import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";
import {
  TRANSVERSE_RIB_WARNING_PREFIX,
  addTransverseRibWarning,
} from "../validation";

describe("transverse distribution rib warning (§14)", () => {
  it("does not fire when no row's inner width exceeds 4.20 m", () => {
    // width1=3.5, width2=4.0 over 5 m: peak inner width is 4.0 → beam = 4.30 m,
    // well under the 4.50 m trigger.
    const r = computeTaper({ width1: 3.5, width2: 4.0, length: 5 });
    const triggered = r.warnings.some((w) =>
      w.startsWith(TRANSVERSE_RIB_WARNING_PREFIX),
    );
    expect(triggered).toBe(false);
  });

  it("fires when any row's inner width exceeds 4.20 m (beam member > 4.50 m)", () => {
    // width1=4.0, width2=4.5 over 5 m → some rows clear 4.20 m.
    const r = computeTaper({ width1: 4.0, width2: 4.5, length: 5 });
    const triggered = r.warnings.some((w) =>
      w.startsWith(TRANSVERSE_RIB_WARNING_PREFIX),
    );
    expect(triggered).toBe(true);
  });

  it("warning text contains the bilingual prefix and the construction-code reference", () => {
    const r = computeTaper({ width1: 4.0, width2: 4.5, length: 5 });
    const ribWarning = r.warnings.find((w) =>
      w.startsWith(TRANSVERSE_RIB_WARNING_PREFIX),
    );
    expect(ribWarning).toBeDefined();
    expect(ribWarning).toMatch(/D\.M\. 09\/01\/1996/);
    expect(ribWarning).toMatch(/EN 15037/);
    expect(ribWarning).toMatch(/transverse distribution ribs/);
  });

  it("isolated helper: fires when ANY row exceeds threshold (boundary 4.20 m)", () => {
    expect(addTransverseRibWarning([4.0, 4.1, 4.15])).toBeNull();
    expect(addTransverseRibWarning([4.0, 4.21])).not.toBeNull();
    expect(addTransverseRibWarning([4.0, 4.0, 4.0, 4.5])).not.toBeNull();
    // Negative widths (narrowing taper) — the absolute value is what matters.
    expect(addTransverseRibWarning([-4.0, -4.5])).not.toBeNull();
  });

  it("does not fire on rectangular routing (which short-circuits before warnings)", () => {
    // Same-width input is refused by the rectangular routing guard;
    // the rib warning should NOT appear because the engine returned
    // a stub before the per-row math ran.
    const r = computeTaper({ width1: 5.0, width2: 5.0, length: 5 });
    const triggered = r.warnings.some((w) =>
      w.startsWith(TRANSVERSE_RIB_WARNING_PREFIX),
    );
    expect(triggered).toBe(false);
  });
});
