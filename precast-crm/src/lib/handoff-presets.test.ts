import { describe, it, expect } from "vitest";
import { isPresetConfigured, configuredPresets, type HandoffPresetConfig } from "./handoff-presets";

/**
 * The admin screen (/handoff) shows a per-preset "not configured" state and the
 * dispatcher silently SKIPS anything unconfigured. Both read the same rule, so
 * pin it down: a preset that looks configured in the UI must be one the
 * dispatcher will actually send, and vice versa.
 */

const FULL: HandoffPresetConfig = {
  LOCATION: { lat: 40.9983, lng: 71.6726 },
  VIDEOS: { fileIds: ["vid-1"] },
  PHOTOS: { fileIds: ["pho-1", "pho-2"] },
  PRICELIST: { fileId: "doc-1" },
};

describe("isPresetConfigured", () => {
  it("accepts a fully configured preset set", () => {
    expect(isPresetConfigured(FULL, "LOCATION")).toBe(true);
    expect(isPresetConfigured(FULL, "VIDEOS")).toBe(true);
    expect(isPresetConfigured(FULL, "PHOTOS")).toBe(true);
    expect(isPresetConfigured(FULL, "PRICELIST")).toBe(true);
  });

  it("treats an empty config as nothing configured", () => {
    expect(isPresetConfigured({}, "LOCATION")).toBe(false);
    expect(isPresetConfigured({}, "VIDEOS")).toBe(false);
    expect(isPresetConfigured({}, "PHOTOS")).toBe(false);
    expect(isPresetConfigured({}, "PRICELIST")).toBe(false);
  });

  it("rejects an empty media list — a caption alone sends nothing", () => {
    expect(isPresetConfigured({ VIDEOS: { fileIds: [], caption: "Монтаж" } }, "VIDEOS")).toBe(false);
    expect(isPresetConfigured({ PHOTOS: { fileIds: [], caption: "Расмлар" } }, "PHOTOS")).toBe(false);
  });

  it("rejects lat/lng 0,0 only when it is not a real number", () => {
    // 0,0 is a legal coordinate, so it must count as configured…
    expect(isPresetConfigured({ LOCATION: { lat: 0, lng: 0 } }, "LOCATION")).toBe(true);
    // …but NaN (a half-typed coordinate that slipped through) must not.
    expect(isPresetConfigured({ LOCATION: { lat: Number.NaN, lng: 71.6 } }, "LOCATION")).toBe(false);
  });
});

describe("configuredPresets", () => {
  it("drops the requested presets the owner has not set up yet", () => {
    const partial: HandoffPresetConfig = { LOCATION: { lat: 41, lng: 69 } };
    expect(configuredPresets(partial, ["LOCATION", "VIDEOS", "PRICELIST"])).toEqual(["LOCATION"]);
  });

  it("ignores unknown preset keys", () => {
    expect(configuredPresets(FULL, ["LOCATION", "COFFEE"])).toEqual(["LOCATION"]);
  });
});
