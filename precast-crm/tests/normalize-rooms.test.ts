import { describe, it, expect } from "vitest";
import { normalizeRoomForBlender } from "../src/lib/blender-bridge/normalize-rooms";

describe("normalizeRoomForBlender — patternOverride handling", () => {
  it("emits null pattern when patternOverride is null (operator chose AUTO)", () => {
    // This is the exact bug that caused the addon to under-count beams
    // on a Room 1 with correction=0.1: CRM was forwarding the resolved
    // pattern ("GB" after remainder-bump from 8 → 9 pitches) instead of
    // null. The addon then treated "GB" as an explicit override, skipped
    // the bump, and rendered 8 beam rows instead of 9.
    const row = {
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0.1,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: null,
      pattern: "GB",         // resolved (post-auto-pick + bump)
      patternAuto: "GB",
    };

    const out = normalizeRoomForBlender(row);
    expect(out.pattern).toBe(null);
  });

  it("emits explicit pattern when patternOverride is set", () => {
    const row = {
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: "BGB",
      pattern: "BGB",
    };

    const out = normalizeRoomForBlender(row);
    expect(out.pattern).toBe("BGB");
  });

  it("falls back to raw.pattern only when patternOverride column is missing (legacy)", () => {
    // Pre-feature rows / non-Prisma shapes that don't carry the
    // `patternOverride` column at all — the resolved pattern is the
    // best we can do.
    const row = {
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0,
      extraBeams: 0,
      forceStartBeam: false,
      pattern: "GBG",
    };

    const out = normalizeRoomForBlender(row);
    expect(out.pattern).toBe("GBG");
  });
});
