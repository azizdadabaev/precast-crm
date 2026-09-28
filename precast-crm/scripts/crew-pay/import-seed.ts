// One-time import of the Donabay workbook into the CRM crew-pay tables.
//   npx tsx scripts/crew-pay/import-seed.ts <seed.json> <golden.json>
//   npx tsx scripts/crew-pay/import-seed.ts --grant-only
// Refuses to run if any crew table has rows. Inside ONE transaction it inserts
// the seed, recomputes with the CRM engine and compares every Weekly Pay row and
// ledger balance with <golden.json> (made by reference_engine.py on the SAME
// seed); any difference throws and rolls the import back. Then it grants
// crewpay.manage to OWNER users (idempotent).
import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { loadCrewState, toDbDate } from "../../src/lib/crew-pay/service";
import { balanceAt, weeklyPay } from "../../src/lib/crew-pay/engine";
import type { Seed } from "../../tests/crew-pay-seed";

type FullSeed = Seed & {
  workers: Array<Seed["workers"][number] & { phone?: string | null; notes?: string | null }>;
  daily_log: Array<Seed["daily_log"][number] & { notes?: string | null }>;
  cash_ledger: Array<Seed["cash_ledger"][number] & { reason?: string | null; given_by?: string | null; signed?: boolean; method?: string }>;
};
const SETTING = { break_allowance_pct: "BREAK_ALLOWANCE", debt_cap_pct: "DEBT_CAP", reject_alarm_pct: "REJECT_ALARM" } as const;
const TYPE = { advance: "ADVANCE", weekly_pay: "WEEKLY_PAY", correction: "CORRECTION" } as const;
const METHOD = { cash: "CASH", card: "CARD", offset: "OFFSET", other: "OTHER" } as const;

async function grant() {
  const owners = await prisma.user.findMany({ where: { role: UserRole.OWNER }, select: { id: true, name: true, permissions: true } });
  for (const u of owners) {
    if (u.permissions.includes("crewpay.manage")) { console.log(`✓ ${u.name} already has crewpay.manage`); continue; }
    await prisma.user.update({ where: { id: u.id }, data: { permissions: { push: "crewpay.manage" } }, select: { id: true } });
    console.log(`+ granted crewpay.manage to ${u.name}`);
  }
}

async function main() {
  if (process.argv.includes("--grant-only")) return grant();
  const [seedPath, goldenPath] = process.argv.slice(2);
  if (!seedPath || !goldenPath) throw new Error("usage: import-seed.ts <seed.json> <golden.json>");
  const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as FullSeed;
  const golden = JSON.parse(readFileSync(goldenPath, "utf-8"));

  const counts = await Promise.all([prisma.crewWorker.count(), prisma.crewDay.count(), prisma.crewLedgerEntry.count(), prisma.crewRate.count()]);
  if (counts.some((c) => c > 0)) throw new Error(`crew tables are not empty (${counts.join("/")}) — refusing to import twice`);

  await prisma.$transaction(async (tx) => {
    for (const s of seed.settings) {
      await tx.crewSetting.create({ data: { key: SETTING[s.key as keyof typeof SETTING], value: s.value, effectiveFrom: toDbDate(s.effective_from) } });
    }
    for (const r of seed.pay_rates) await tx.crewRate.create({ data: { effectiveFrom: toDbDate(r.effective_from), ratePerBlock: r.rate_per_block } });
    const idOf: Record<string, string> = {};
    for (const w of seed.workers) {
      const row = await tx.crewWorker.create({ data: {
        code: w.code, name: w.name, status: w.status === "left" ? "LEFT" : "ACTIVE", joinedOn: toDbDate(w.joined_on),
        leftOn: w.left_on ? toDbDate(w.left_on) : null, phone: w.phone ?? null, notes: w.notes ?? null } });
      idOf[w.code] = row.id;
    }
    for (const d of seed.daily_log) {
      const day = await tx.crewDay.create({ data: { workDate: toDbDate(d.date), moulded: d.moulded, broken: d.broken ?? 0, notes: d.notes ?? null } });
      const att = Object.entries(d.attendance).filter(([, v]) => v).map(([code, v]) => ({ dayId: day.id, workerId: idOf[code], halfDays: v === 1 ? 2 : 1 }));
      if (att.length) await tx.crewAttendance.createMany({ data: att });
    }
    for (const e of [...seed.cash_ledger].sort((a, b) => a.seq - b.seq)) {
      await tx.crewLedgerEntry.create({ data: {
        entryDate: toDbDate(e.date), workerId: idOf[e.worker], type: TYPE[e.type as keyof typeof TYPE], amount: e.amount,
        method: METHOD[(e.method ?? "cash") as keyof typeof METHOD], reason: e.reason ?? null, signed: e.signed ?? false,
        givenByName: e.given_by ?? null } });
    }

    // Golden gate: the CRM must reproduce the workbook engine to the so'm.
    const s = await loadCrewState(tx);
    const codeOf = Object.fromEntries(Object.entries(idOf).map(([c, id]) => [id, c]));
    const diffs: string[] = [];
    for (const [ws, rows] of Object.entries(golden.weekly_pay) as [string, Array<Record<string, number | string>>][]) {
      const mine = weeklyPay(s.input, s.weeks, ws);
      for (const g of rows) {
        const m = mine.find((r) => codeOf[r.workerId] === g.worker)!;
        const pairs: [string, number | string, number | string][] = [
          ["earned", m.earned, g.earned], ["brought_forward", m.broughtForward, g.brought_forward], ["advances", m.advances, g.advances],
          ["corrections", m.corrections, g.corrections], ["due", m.due, g.due], ["to_pay", m.toPay, g.to_pay], ["paid", m.paid, g.paid],
          ["still_to_pay", m.stillToPay, g.still_to_pay], ["carried_forward", m.carriedForward, g.carried_forward],
          ["status", m.status.toLowerCase(), g.status]];
        for (const [k, a, b] of pairs) if (a !== b) diffs.push(`${ws} ${g.worker} ${k}: crm=${a} golden=${b}`);
      }
    }
    const bySeq = [...s.input.ledger].sort((a, b) => a.seq - b.seq);
    bySeq.forEach((e, i) => {
      const want = golden.ledger_balance_after[String(i + 1)];
      const got = balanceAt(s.input, s.weeks, e.workerId, e.date);
      if (got !== want) diffs.push(`ledger #${i + 1}: crm=${got} golden=${want}`);
    });
    if (diffs.length) throw new Error(`golden mismatch — import rolled back:\n${diffs.join("\n")}`);
    console.log(`golden OK: ${Object.keys(golden.weekly_pay).length} weeks, ${bySeq.length} ledger rows`);
  }, { timeout: 120_000 });

  await grant();
  console.log("import complete");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
