// Which date a confirmed payment is counted on.
//
// Historically the dashboard bucketed cash by `confirmedAt`, which is stamped
// at the moment the row is entered. Money the customer handed over in July but
// which nobody remembered to enter until August was therefore counted as
// AUGUST revenue. On prod that is 22 payments worth 147 133 111 UZS sitting in
// a later month than the order they belong to.
//
// `paidOn` is the fix: an optional record of when the customer actually paid.
// NULL on every historical row and on any payment entered without it, in which
// case the old behaviour applies exactly — no existing figure moves.

/** The subset of a Payment this module needs. */
export interface AttributablePayment {
  paidOn?: Date | null;
  confirmedAt?: Date | null;
}

/**
 * The date a payment counts on: `paidOn` when the operator recorded one,
 * otherwise `confirmedAt`.
 *
 * Returns null when neither exists — an unconfirmed payment is not revenue and
 * must not be forced into a month.
 */
export function attributionDate(p: AttributablePayment): Date | null {
  return p.paidOn ?? p.confirmedAt ?? null;
}

/** How far back a payment may be backdated. */
export const MAX_BACKDATE_DAYS = 120;

export type PaidOnRejection = 'invalid' | 'future' | 'too-old';

export interface PaidOnResult {
  ok: boolean;
  value?: Date | null;
  reason?: PaidOnRejection;
}

/**
 * Validate an operator-supplied paid-on date against `now`.
 *
 * Three rules, each protecting a real figure:
 *  - a FUTURE date would book cash into a month that has not happened, and
 *    would make a closed month change later;
 *  - a date more than MAX_BACKDATE_DAYS old is far likelier a typo (a wrong
 *    year, say) than a genuine four-month-late entry, and would silently
 *    rewrite a long-closed month;
 *  - an unparseable value must be refused rather than coerced, because
 *    `new Date('nonsense')` is an Invalid Date that poisons every comparison
 *    it touches.
 *
 * Absent input is legitimate and yields `{ ok: true, value: null }` — the
 * field is optional and its absence means "count it the old way".
 *
 * Same-day is always allowed, which is the overwhelmingly common case.
 */
export function validatePaidOn(input: unknown, now: Date): PaidOnResult {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: null };
  }
  if (typeof input !== 'string' && !(input instanceof Date)) {
    return { ok: false, reason: 'invalid' };
  }

  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: 'invalid' };

  // Compare on LOCAL calendar days, not instants: a date-only value arrives as
  // midnight, and an operator entering "today" must never trip the future
  // check because of a few hours' clock difference.
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((dayOf(now) - dayOf(d)) / dayMs);

  if (diffDays < 0) return { ok: false, reason: 'future' };
  if (diffDays > MAX_BACKDATE_DAYS) return { ok: false, reason: 'too-old' };
  return { ok: true, value: d };
}

/** Uzbek message for each rejection, for the API to return verbatim. */
export const PAID_ON_ERRORS: Record<PaidOnRejection, string> = {
  invalid: 'Тўлов санаси нотўғри · invalid payment date',
  future: 'Тўлов санаси келажакда бўлиши мумкин эмас · payment date cannot be in the future',
  'too-old': `Тўлов санаси ${MAX_BACKDATE_DAYS} кундан эски бўлмаслиги керак · payment date is too far in the past`,
};
