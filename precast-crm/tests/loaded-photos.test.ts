import { describe, it, expect } from "vitest";
import { canAddLoadedPhoto, botTruckPhotoAction } from "@/lib/loaded-photos";

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

describe("botTruckPhotoAction", () => {
  it("flips a not-yet-loaded single-truck order to LOADED", () => {
    expect(botTruckPhotoAction("PLACED", false)).toBe("transition");
    expect(botTruckPhotoAction("IN_PRODUCTION", false)).toBe("transition");
  });

  it("just attaches to an order that is already loaded or beyond", () => {
    expect(botTruckPhotoAction("LOADED", false)).toBe("attach");
    expect(botTruckPhotoAction("DISPATCHED", false)).toBe("attach");
    expect(botTruckPhotoAction("DELIVERED", false)).toBe("attach");
  });

  it("attaches (no status flip) for a split order — operator links it in the CRM", () => {
    // Split order set up (shipment rows exist) but order still PLACED.
    expect(botTruckPhotoAction("PLACED", true)).toBe("attach");
    expect(botTruckPhotoAction("IN_PRODUCTION", true)).toBe("attach");
    expect(botTruckPhotoAction("LOADED", true)).toBe("attach");
    expect(botTruckPhotoAction("DISPATCHED", true)).toBe("attach");
  });

  it("refuses on terminal / draft statuses", () => {
    expect(botTruckPhotoAction("CANCELED", false)).toBeNull();
    expect(botTruckPhotoAction("CANCELED", true)).toBeNull();
    expect(botTruckPhotoAction("DRAFT", false)).toBeNull();
  });
});
