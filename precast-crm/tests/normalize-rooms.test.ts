import { describe, it, expect } from "vitest";
import {
  normalizeRoomForBlender,
  validateRoomsForBlender,
} from "../src/lib/blender-bridge/normalize-rooms";

describe("normalizeRoomForBlender — protocol v2 (resolved pattern + pitches)", () => {
  it("forwards the CRM's resolved pattern verbatim", () => {
    // The CRM auto-picked GB after the remainder-bump (5.1m / 0.58 →
    // 8 pitches + R=0.46 → bump to 9 + GB). The addon must render
    // exactly what the CRM billed: 9 pitches as GB.
    const row = {
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0.1,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: null,  // operator chose AUTO
      pattern: "GB",          // resolved (post-auto-pick + bump)
      patternAuto: "GB",
      pitches: 9,             // CRM's committed pitch count
    };

    const out = normalizeRoomForBlender(row);
    expect(out.pattern).toBe("GB");
    expect(out.pitches).toBe(9);
  });

  it("forwards explicit operator overrides as-is", () => {
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
      pitches: 8,
    };

    const out = normalizeRoomForBlender(row);
    expect(out.pattern).toBe("BGB");
    expect(out.pitches).toBe(8);
  });

  it("preserves the resolved pitch count separately from inner_length", () => {
    // pitches is NOT a function of inner_length alone — correction and
    // the auto-pick bump can both shift it. The addon must trust the
    // CRM's value, not re-derive.
    const row = {
      name: "Wide Room",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0.1,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: null,
      pattern: "GB",
      patternAuto: "GB",
      pitches: 9,  // 8 pitches naturally + 1 bump
    };

    const out = normalizeRoomForBlender(row);
    expect(out.inner_length).toBe(5);
    expect(out.correction).toBe(0.1);
    expect(out.pitches).toBe(9);
  });
});

describe("validateRoomsForBlender — protocol v2 rejects invalid pitches", () => {
  it("rejects rooms without pitches", () => {
    const out = normalizeRoomForBlender({
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: "GB",
      pattern: "GB",
      // pitches missing
    });
    const err = validateRoomsForBlender([out]);
    expect(err).toMatch(/pitches/);
  });

  it("rejects rooms with non-positive pitches", () => {
    const out = normalizeRoomForBlender({
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: "GB",
      pattern: "GB",
      pitches: 0,
    });
    const err = validateRoomsForBlender([out]);
    expect(err).toMatch(/pitches/);
  });

  it("accepts a fully-formed v2 room", () => {
    const out = normalizeRoomForBlender({
      name: "Room 1",
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0.1,
      extraBeams: 0,
      forceStartBeam: false,
      patternOverride: null,
      pattern: "GB",
      patternAuto: "GB",
      pitches: 9,
    });
    const err = validateRoomsForBlender([out]);
    expect(err).toBe(null);
  });
});
