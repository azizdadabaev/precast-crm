import { describe, it, expect } from "vitest";
import { parseQueueStatus, queueCounts, queueStamp, QUEUE_DEFAULT } from "../src/lib/gazoblok-payments-queue";

describe("parseQueueStatus", () => {
  it("defaults a missing status to the pending tab", () => {
    expect(QUEUE_DEFAULT).toBe("PENDING_CONFIRMATION");
    expect(parseQueueStatus(null)).toBe("PENDING_CONFIRMATION");
  });

  it("accepts each known tab", () => {
    expect(parseQueueStatus("CONFIRMED")).toBe("CONFIRMED");
    expect(parseQueueStatus("REJECTED")).toBe("REJECTED");
    expect(parseQueueStatus("PENDING_CONFIRMATION")).toBe("PENDING_CONFIRMATION");
  });

  it("returns null for unknown values so the route answers 400", () => {
    expect(parseQueueStatus("DROP")).toBeNull();
    expect(parseQueueStatus("")).toBeNull();
    expect(parseQueueStatus("confirmed")).toBeNull();
  });
});

describe("queueCounts", () => {
  it("zero-fills the tabs missing from the groupBy", () => {
    expect(queueCounts([{ status: "CONFIRMED", _count: { _all: 3 } }])).toEqual({
      pending: 0,
      confirmed: 3,
      rejected: 0,
    });
  });

  it("reads all three tabs", () => {
    expect(
      queueCounts([
        { status: "PENDING_CONFIRMATION", _count: { _all: 2 } },
        { status: "REJECTED", _count: { _all: 1 } },
        { status: "CONFIRMED", _count: { _all: 7 } },
      ]),
    ).toEqual({ pending: 2, confirmed: 7, rejected: 1 });
  });
});

describe("queueStamp", () => {
  it("formats as дд.мм.йййй сс:дд in local time", () => {
    expect(queueStamp(new Date(2026, 0, 5, 9, 7))).toBe("05.01.2026 09:07");
    expect(queueStamp(new Date(2026, 10, 30, 23, 59).toISOString())).toBe("30.11.2026 23:59");
  });
});
