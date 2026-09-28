import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Final review #2/#4: the service's own wiring (not just the pure rules) is
// tested with an in-memory Prisma double — no database needed.
const h = vi.hoisted(() => {
  const created: Array<Record<string, unknown>> = [];
  const calls: { txOptions?: unknown } = {};
  const worker = { id: "w1", code: "W01", name: "Ali", status: "ACTIVE", joinedOn: new Date("2026-08-31T00:00:00Z"), leftOn: null, phone: null, notes: null };
  const tx = {
    crewWorker: { findMany: async () => [worker] },
    crewDay: { findMany: async () => [] },
    crewLedgerEntry: {
      findMany: async (args?: { where?: { clientKey?: unknown } }) =>
        args?.where?.clientKey ? [{ clientKey: "already-paid-key" }] : [],
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: `e${created.length}` }; },
    },
    crewRate: { findMany: async () => [{ effectiveFrom: new Date("2026-08-31T00:00:00Z"), ratePerBlock: 500 }] },
    crewSetting: { findMany: async () => [] },
    crewPayWeek: { findMany: async () => [] },
  };
  return { created, calls, tx };
});

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown, opts?: unknown) => { h.calls.txOptions = opts; return fn(h.tx); },
  },
}));

import { payWorkers } from "./service";

describe("payWorkers (service wiring)", () => {
  beforeEach(() => {
    h.created.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T07:00:00Z")); // Monday 12:00 in Tashkent
  });
  afterEach(() => vi.useRealTimers());

  it("pays last week dated its Sunday, skips an already-used key, and runs Serializable", async () => {
    const r = await payWorkers({ id: "u1" }, "2026-09-21", {
      payments: [
        { workerId: "w1", amount: 100000, method: "CASH", clientKey: "already-paid-key" },
        { workerId: "w1", amount: 250000, method: "CASH", clientKey: "fresh-key-0001" },
      ],
    });
    expect(r).toEqual({ created: 1 });
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ type: "WEEKLY_PAY", amount: 250000, clientKey: "fresh-key-0001" });
    expect((h.created[0].entryDate as Date).toISOString().slice(0, 10)).toBe("2026-09-27");
    expect((h.created[0].payWeekStart as Date).toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(h.calls.txOptions).toMatchObject({ isolationLevel: "Serializable" });
  });
});
