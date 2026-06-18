import { describe, it, expect } from "vitest";
import { canAddLoadedPhoto } from "@/lib/loaded-photos";

describe("canAddLoadedPhoto", () => {
  it("allows adding once the order is loaded or beyond", () => {
    expect(canAddLoadedPhoto("LOADED")).toBe(true);
    expect(canAddLoadedPhoto("DISPATCHED")).toBe(true);
    expect(canAddLoadedPhoto("DELIVERED")).toBe(true);
  });
  it("rejects before loading and when canceled", () => {
    expect(canAddLoadedPhoto("PLACED")).toBe(false);
    expect(canAddLoadedPhoto("IN_PRODUCTION")).toBe(false);
    expect(canAddLoadedPhoto("CANCELED")).toBe(false);
    expect(canAddLoadedPhoto("DRAFT")).toBe(false);
  });
});
