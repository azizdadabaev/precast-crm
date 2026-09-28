import type { EngineInput, LedgerType, SettingKey } from "../src/lib/crew-pay/engine";

export interface Seed {
  settings: Array<{ key: string; value: number; effective_from: string }>;
  pay_rates: Array<{ effective_from: string; rate_per_block: number }>;
  workers: Array<{ code: string; name: string; status: string; joined_on: string; left_on: string | null }>;
  daily_log: Array<{ date: string; moulded: number | null; broken: number | null; attendance: Record<string, number | null> }>;
  cash_ledger: Array<{ seq: number; date: string; worker: string; type: string; amount: number }>;
}

const SETTING: Record<string, SettingKey> = {
  break_allowance_pct: "BREAK_ALLOWANCE", debt_cap_pct: "DEBT_CAP", reject_alarm_pct: "REJECT_ALARM",
};
const TYPE: Record<string, LedgerType> = { advance: "ADVANCE", weekly_pay: "WEEKLY_PAY", correction: "CORRECTION" };

/** Seed JSON (pack format) → engine input, with worker ids = codes. */
export function seedToEngineInput(seed: Seed): EngineInput {
  return {
    workers: seed.workers.map((w) => ({
      id: w.code, code: w.code, name: w.name, status: w.status === "left" ? "LEFT" : "ACTIVE",
      joinedOn: w.joined_on, leftOn: w.left_on,
    })),
    days: seed.daily_log.map((d) => ({
      date: d.date, moulded: d.moulded, broken: d.broken ?? 0,
      attendance: Object.fromEntries(Object.entries(d.attendance).filter(([, v]) => v)) as Record<string, number>,
    })),
    ledger: seed.cash_ledger.map((e) => ({
      id: String(e.seq), seq: e.seq, date: e.date, workerId: e.worker, type: TYPE[e.type], amount: e.amount,
    })),
    rates: seed.pay_rates.map((r) => ({ effectiveFrom: r.effective_from, ratePerBlock: r.rate_per_block })),
    settings: seed.settings.map((s) => ({ key: SETTING[s.key], value: s.value, effectiveFrom: s.effective_from })),
  };
}
