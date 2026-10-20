# Overpayments and refunds — design

Owner request 2026-10-20 (order 2026-08-0024: paid 10 001 000, edited down to
9 094 400, shown as «Тўланган» with no warning). Approved in chat ("let's go").

## Why

When a client has paid more than the order now costs, the company owes them money.
The CRM had no notion of that: the edit saved silently, the order read «Тўланган»,
the dashboard counted the extra as revenue and receivables clamped it to zero.
Prod scan (478 orders): 3 real overpayments (906 600, 370 400, 124 480), 2
rounding-sized (50, 48,72), and one CANCELED order still holding 21 500 000.

## Rules

- **Refund due** = confirmed − (total − write-off) for a live order;
  = everything confirmed for a CANCELED order. Shown/alerted only when
  ≥ 1 000 UZS, so a round-number payment (4 500 000 for 4 499 950) stays quiet.
- **Owner decision:** the money is given back. No carry-over credit to a next order.

## What it does

1. **Warn before it happens** — order edit (web calculator «Таҳрирни сақлаш»,
   Android «Таҳрирлаш») answers 409 `OVERPAY_CONFIRM_REQUIRED` with the amount
   when the edit would raise the refund due to ≥ 1 000; the UI asks
   «Мижоз N UZS ортиқча тўлаган бўлади — қайтариш керак. Давом этасизми?» and
   re-sends with `confirmOverpay: true`. Same shape as the existing phone-change
   409. Never blocks for good.
2. **Show it on the order** — «Қолди» reads «Ортиқча · қайтариш керак N UZS» in
   the warning tone instead of «Тўланган». Payment rows that are refunds read
   «Қайтарилди» with a minus.
3. **Notify the owners** — a bell notification (`PAYMENT_OVERPAID`) to every
   user holding `payment.confirm` when an order *becomes* due a refund (edit,
   payment confirmation, cancel). Transitions only — no back-fill spam.
4. **Record the refund** — «Қайтариш» on the order (permission `payment.confirm`):
   amount (pre-filled with the due, cannot exceed it), method, date given back,
   note. Stored as a CONFIRMED `Payment` with a **negative amount**, so every
   existing sum (confirmedPaid, revenue by day, ledger) nets it out on the day
   the money went back without touching those queries. Event `PAYMENT_REFUNDED`.
5. **Find them later** — orders list payment filter «Қайтариш керак».
6. **Cancel** — the cancel dialog says how much the client has paid, so the
   refund is not forgotten; the order then shows the refund due like any other.

## Out of scope (builder's calls noted)

- Payment confirmation with an upward adjustment is not pre-warned (rare,
  owner-only); it still notifies and shows.
- Refunds are recorded on the web; Android shows the due, the refund rows,
  the bell, and handles the edit 409.
- Historical rows are not changed; the 3 real + 1 canceled case show up the
  moment this deploys, for the owner to record what was actually given back.
