import { describe, it, expect } from "vitest";
import { countsFrom } from "./payment-counts";
describe("countsFrom", () => {
  it("zero-fills the three tabs", () => {
    expect(countsFrom([{ status: "PENDING_CONFIRMATION", _count: { _all: 3 } }, { status: "REJECTED", _count: { _all: 1 } }]))
      .toEqual({ pending: 3, confirmed: 0, rejected: 1 });
  });
});
