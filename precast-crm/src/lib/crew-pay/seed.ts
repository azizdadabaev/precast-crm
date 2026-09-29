/**
 * The Donabay workbook seed (pack format), as written by scripts/crew-pay/extract-donabay.py and
 * read by the one-time import and the golden tests. Lives in src/ rather than tests/ because the
 * Docker build context leaves tests/ out, and the import script's type-check runs in that build.
 */
export interface Seed {
  settings: Array<{ key: string; value: number; effective_from: string }>;
  pay_rates: Array<{ effective_from: string; rate_per_block: number }>;
  workers: Array<{ code: string; name: string; status: string; joined_on: string; left_on: string | null }>;
  daily_log: Array<{ date: string; moulded: number | null; broken: number | null; attendance: Record<string, number | null> }>;
  cash_ledger: Array<{ seq: number; date: string; worker: string; type: string; amount: number }>;
}
