import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeWeeks, weeklyPay, balanceAt } from "../src/lib/crew-pay/engine";
import { seedToEngineInput, type Seed } from "./crew-pay-seed";

const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/crew-pay/${f}`, "utf-8"));

for (const [seedFile, goldenFile] of [["seed.json", "golden.json"], ["seed-cap50.json", "golden-cap50.json"], ["seed-allow3.json", "golden-allow3.json"]]) {
  describe(`golden parity with the workbook engine (${seedFile})`, () => {
    const seed = load(seedFile) as Seed;
    const golden = load(goldenFile);
    const input = seedToEngineInput(seed);
    const weeks = computeWeeks(input);

    it("matches every week", () => {
      expect([...weeks.keys()]).toEqual(golden.weeks.map((w: { week_start: string }) => w.week_start));
      for (const g of golden.weeks) {
        const w = weeks.get(g.week_start)!;
        expect({ moulded: w.moulded, broken: w.broken, good: w.good, paid_blocks: w.paidBlocks, pot: w.pot,
                 crew_days: w.crewDays, days: w.days, shares: w.shares, share_drift: w.shareDrift })
          .toEqual({ moulded: g.moulded, broken: g.broken, good: g.good, paid_blocks: g.paid_blocks, pot: g.pot,
                     crew_days: g.crew_days, days: g.days, shares: g.shares, share_drift: g.share_drift });
      }
    });

    it("matches every Weekly Pay row", () => {
      for (const [ws, rows] of Object.entries(golden.weekly_pay) as [string, Array<Record<string, unknown>>][]) {
        const mine = weeklyPay(input, weeks, ws);
        expect(mine.map((r) => ({
          worker: r.code, name: r.name, days: r.days, earned: r.earned, brought_forward: r.broughtForward,
          advances: r.advances, corrections: r.corrections, due: r.due, to_pay: r.toPay, paid: r.paid,
          still_to_pay: r.stillToPay, carried_forward: r.carriedForward, status: r.status.toLowerCase(),
        }))).toEqual(rows);
      }
    });

    it("matches every ledger balance-after", () => {
      for (const e of input.ledger) {
        expect(balanceAt(input, weeks, e.workerId, e.date)).toBe(golden.ledger_balance_after[String(e.seq)]);
      }
    });
  });
}

describe("pack acceptance: week of 2026-09-21", () => {
  it("has the PRD §8 numbers", () => {
    const input = seedToEngineInput(load("seed.json"));
    const weeks = computeWeeks(input);
    const w = weeks.get("2026-09-21")!;
    expect(w.pot).toBe(4452500);
    expect(w.crewDays).toBe(20);
    const rows = Object.fromEntries(weeklyPay(input, weeks, "2026-09-21").map((r) => [r.name, r]));
    expect(rows.Davlatbek.status).toBe("SETTLED");
    expect(rows.Xusanboy.carriedForward).toBe(-1686875);
    expect(rows.Oybek.carriedForward).toBe(-99000);
    expect(rows.Nomonjon.carriedForward).toBe(-99000);
  });
});
