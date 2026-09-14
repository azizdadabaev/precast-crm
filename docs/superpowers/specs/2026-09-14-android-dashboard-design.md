# Android — Бош tab: the dashboard (design 6a)

Source: the owner's `DASHBOARD_BUILD_BRIEF.md` (pasted 2026-09-14; the original file and the 6a
prototype frames are not on disk — the labels below are taken from the web components the brief
names, which is what the brief itself instructs). Owner decisions taken on 2026-09-14:
**dashboard before the readiness slice**; **the API is not extended — the Ҳафта period and the
donut's per-state sums are hidden in v1**; the pasted brief is reference, the repo's own strings
are the authority.

## 1. Job

One vertically scrolling screen that shows every metric of the web dashboard for a 390 dp phone,
restructured, not reinvented: no new metrics, no new formulas, every number from
`GET /api/dashboard` exactly as the web renders it. The acceptance test is literal — every value
on the phone equals the web dashboard for the same account at the same moment, current month,
order-date basis.

What the tab already does and KEEPS: the app-bar chrome (brand mark, outbox bell with its badge,
account avatar), the outbox sheet with its rejected-order rows and «Калькуляторда очиш», the
account sheet, pull-to-refresh, the withheld-permission state. What it LOSES: the phase-1
«Бугунги етказиш» rows list — the brief's tile taps into the Orders calendar on today, whose day
sheet already lists that day's orders (owner may reverse: R-list below).

## 2. Screen (top → bottom), page background, 16 dp margins, 100 dp bottom padding under the pill

1. **App bar** — unchanged chrome: `BrandMark` («ETALON», gradient tile 34 dp), the `uz-UZ` long
   date line under it (`formatLongDate`, weekday + day + month + year, as today's Home already
   draws), bell + avatar on the right. The brief's Ой | Ҳафта pill is **not drawn** (owner: API is
   monthly-only; a pill with one option is noise). The financial section's kicker names the period
   instead: «МОЛИЯВИЙ ҲОЛАТ · ЖОРИЙ ОЙ».
2. **Receivables hero** — `NavySheet`-styled card (navy, radius `sheet` 22): kicker
   «ҚАРЗДОРЛИК · ҲОЗИРГИ ҲОЛАТ» (`onDarkMuted`, letter-spaced), red badge «N буюртма» on the right
   (`outstandingReceivables.orderCount`, `redBg`/`red` on dark → the existing `debtOnDark`
   treatment), amount `amountLg` 30/800 in mono + small «UZS», helper line the web's own
   «Ой бўйича бўлинмайди · бугунги қолдиқ» (`FinancialKPIs.tsx:272`), then a three-cell strip
   (navy2, radius `md`): Тўланган (green) · Қисман (`warning`) · Кутилмоқда (red) with the counts
   from `ordersByPaymentState.paid / partial / awaiting`.
3. **Financial rail** — section kicker «МОЛИЯВИЙ ҲОЛАТ · ЖОРИЙ ОЙ»; a horizontal `LazyRow`,
   16 dp edge inset, cards 228 dp wide, radius `lg` 16, white, hairline border:
   - «Буюртма қилинган · Booked» — `bookedThisMonth.total`, delta badge from `.trend`, sparkline
     = last 8 of `bookedByMonth[].booked`, lines «N та буюртма · ушбу ой» and
     «Бошланғичдан: X UZS · M та» (`bookedAllTime`).
   - «Тушган пул · Collected» — `collectedThisMonth.total`, `.trend`, last 8 of
     `collectedByMonth[].collected`, lines «N та тўлов · ушбу ой», «Бошланғичдан: X UZS · M та».
   - «Ўртача буюртма · AOV» — `averageOrderValue.thisMonth`, `.trend`, sparkline = last 8 of
     `bookedByMonth[i].booked ÷ ordersByMonth[i].count` (0 when the count is 0; the brief's own
     formula, computed in `BigDecimal` with `RoundingMode.HALF_UP` to whole UZS to match the
     web's `Math.round`), lines «Ҳисоб: буюртма қилинган ÷ буюртмалар сони»
     (`FinancialKPIs.tsx:248`) and «Бошланғичдан: X UZS».
   The delta badge follows `TrendIndicator.tsx`: arrow ↑ / ↓ / → with `deltaPct` and «%»;
   colour by `polarity` × `direction` (positive-up and negative-down = `green`/`greenBg`;
   positive-down and negative-up = `red`/`redBg`; `flat` = `ink3` on `lavenderBg`, arrow →, no
   sign flashing — the phase-1 `TrendDirection` rule stands). `trend == null` → no badge.
   Sparkline: 8 bars, height ∝ value / max of the 8, the last bar `indigo`, the others `lavender`;
   all-zero series draws 8 floor stubs (2 dp) so the card does not jump.
4. **Operational grid** — kicker «ОПЕРАЦИОН ҲОЛАТ»; 2×2, gap 10 dp, cards radius `lg`, white:
   - «Фаол мижозлар» — `activeCustomers.count` 24/700; stacked bar green / `warning` / track
     (`lavenderBg`) in the proportions paid : partial : awaiting of `ordersByPaymentState`;
     caption «P тўланган · Q қисман · R кутилмоқда». Tap → Clients tab.
   - «Бугунги етказишлар» — `todayDeliveries.count`; a 7-segment bar (filled = count of today's
     orders whose status is DISPATCHED or DELIVERED, of `count`; all seven filled when count = 0
     reads as empty, not full); caption «A м² режалаштирилган» (`totalArea`, decimal comma).
     Tap → Orders tab, Жадвал view, today selected (the day sheet).
   - «Очиқ тафовутлар» — `openDiscrepancies.count`; chip `StatusTag`-styled «Назоратда»
     (green) when 0, «Диққат» (red) otherwise; caption «X UZS тафовут» (`totalAmount`).
   - «Юкланган ҳажм · {ой}» — the current month's `loadedVolumeByMonth` row (matched by
     `monthKeys[currentMonthIdx]`; month label = the short Uzbek month name): `blocks` 24/700 +
     «блок», row «beamMeters м балка | area м²» (one decimal, comma), caption
     «orderCount та буюртма · beamCount та балка» (`OperationalKPIs.tsx:173`). No row for the
     month → «Бу ой юк йўқ» in place of the figures.
5. **«Тўлов ҳолати» card** — header right «N та буюртма» (paid + partial + awaiting); a 92 dp
   donut drawn with `Canvas` arcs: green paid, `warning` partial, `lavenderBg` awaiting; centre
   «NN%» (paid ÷ total, whole percent, HALF_UP) over «тўланган» (`PaymentDonut.tsx:76`); legend
   rows label · count. **Counts only** — the payload carries no per-state sums (owner ruling:
   hidden, not approximated). Total 0 → a full track ring and «0%».
6. **«Энг тўрти мижозлар» card** — header right «Тушган пул» (the web's «Тушган пул · Collected»
   shortened to its Uzbek half on 390 dp); top 5 of `topCustomers` by `totalCollected`: `Avatar`,
   name (one line, ellipsis), sum right-aligned mono, an indigo bar proportional to the top
   value, «N та буюртма». Empty → «Ҳали тушум йўқ».
7. **«Сўнгги буюртмалар» card** — header right «Барчаси →» → Orders tab, Рўйхат; the 4 latest of
   `recentOrders`: `Avatar`, client name, second line «№ (indigo, tappable → order detail) ·
   A м² · address» (address elided, hidden when null), amount right, payment tag via the existing
   `StatusTag(PaymentState)` (Тўланган / Қисман / Кутилмоқда). Empty → the existing
   «Ҳали буюртма йўқ».
8. **No-access state** — when the operator holds neither `dashboard.viewBasic` nor
   `dashboard.view`: sections 2–7 are replaced by one card with the web's own line
   «Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.» (`dashboard/page.tsx:69`); the
   app bar, bell, outbox and account sheets stay (they are local reads). No error affordance.

## 3. Data

- `HomeSummary` (`core/model/Dashboard.kt`) grows to carry what §2 renders, mirroring
  `DashboardData` names: `booked` (this month total, orderCount, trend; all-time total,
  orderCount), `collected` (this month total, paymentCount, trend; all-time), `aov` (thisMonth,
  allTime, trend), `receivablesTrend`, `activeCustomers`, `bookedByMonth`, `ordersByMonth`,
  `loadedThisMonth?`, `topCustomers`, and `RecentOrder` gains `clientPhone`, `clientAddress?`,
  `totalArea`, `paymentState`. The mapper reads the ACTUAL payload (`src/lib/dashboard-data.ts`),
  not only `types.ts`; every money-shaped number decodes to `Money` via `BigDecimal` — never a
  `Double` — the phase-1d rule. `Trend` gains `polarity`.
- Nothing is recomputed on the phone except the two things the brief itself prescribes: the AOV
  sparkline division and the donut's percentage. Both in `BigDecimal`, HALF_UP, tested against
  the web's fixtures (`src/lib/dashboard-metrics.test.ts` values).
- Refresh: pull-to-refresh (kept) and an auto-refresh every 60 s while the tab is RESUMED (the
  web's `refetchInterval`); a failed refresh keeps the last good payload and shows the
  `ErrorBanner` with «Қайта уриниш». First load → a skeleton mirroring `DashboardSkeleton.tsx`
  blocks (hero, rail, grid, three cards).
- Formatting: thin-space thousands, tabular mono figures, «UZS» as the small suffix
  (`MoneyText`), decimal comma for м² and %; short month names from the existing formatter.

## 4. Navigation

- Фаол мижозлар → the Clients tab. Бугунги етказишлар → Orders tab with `OrdersView.CALENDAR`
  and today selected (the persisted `OrdersViewStore` set to CALENDAR plus a one-shot
  `OrdersOpenDayStore` the Orders ViewModel consumes on start, opening the day sheet as a tapped
  cell does). № → order detail. Барчаси →
  Orders tab, `OrdersView.LIST`.
- The Home route gains those three hand-offs; the shell wires them beside the existing ones.

## 5. Tokens (all existing; nothing new)

`navy`/`navy2`/`onDark`/`onDarkMuted`/`debtOnDark`/`paidOnDark` (hero), `indigo`/`lavender`
(sparkline, top-client bars), `green`/`greenBg`, `red`/`redBg`, `warning`/`warningBg` (partial —
the prototype's `#F0A868` maps here), `lavenderBg` (donut track, bar track — the prototype's
`#E2E0EC`), `ink`/`ink2`/`ink3`, `surface`/`surfaceBorder`, `page`. Radii `sheet` 22 / `lg` 16 /
`md` 12. Type: `amountLg` 30/800 (hero amount), `kpi` 24/700 (grid figures) and `headline` 22/800 (rail values), `labelSm`
kickers, mono for every figure. Targets ≥ 48 dp on every tappable card/row.

## 6. Failure and edge rules

- 403 → §2.8. Network failure on first load → `ErrorBanner` over the skeleton; on refresh → the
  banner over the last good payload. Offline → the last payload with the banner; nothing queues.
- Very large numbers (≥ 1 000 000 000 UZS): the hero amount shrinks one step (`MoneyOverflow`
  rule already in `MoneyText`) rather than wrapping; rail values ellipsize never — they scale.
- Long client names: one line, ellipsis; the sum keeps its width.
- Empty month (no orders, no payments): rail cards show 0 with no badge; sparklines draw stubs;
  the grid shows 0 / «Бу ой юк йўқ»; the donut draws its track ring.
- The DRIVER role sees §2.8 (open owner decision, unchanged by this phase).

## 7. Acceptance (the plan's tests)

- `DashboardMappersTest`: every new field decoded from a recorded `/api/dashboard` JSON; money
  never `Double`; a missing `loadedVolumeByMonth` row → null; `recentOrders` with a null address.
- `TrendBadgeTest`: the 4 polarity × direction colourings + flat + null.
- `AovSparklineTest` / `DonutPercentTest`: HALF_UP against web fixture values; zero count → 0.
- `HomeViewModelTest`: 60 s ticker fires only while resumed; a failed refresh keeps the payload.
- Screenshot baselines: `home_light`, `home_font13`, `home_w360`, `home_skeleton_light`,
  `home_no_access_light`, `home_empty_month_light`, `ds_delta_badge_light`, `ds_donut_light`,
  `ds_sparkline_light`.
- Emulator: every figure compared against the LOCAL web dashboard for the seeded owner (same
  account, current month, order basis) — a table in the report; taps land where §4 says.

## 8. Not in this phase

The 12-month HeroChart and month picker; the order/delivery date-basis toggle; RegionRanking;
`/api/dashboard/monthly-revenue`; `weekCapacity` and `cashOnTheRoad` (in the payload, not shown);
the Ҳафта period; per-state money sums. A weekly endpoint and per-state sums are additive server
work for a later slice.

## R — rulings the executor made from the brief (owner may reverse)

- R1 The Ой | Ҳафта pill is not drawn at all in v1 (one-option pill = noise); the kicker names the
  period.
- R2 The phase-1 today-rows list leaves Home; the tile's tap reaches the same list one tap away
  in the calendar's day sheet.
- R3 Prototype hexes map to tokens (`warning`, `lavenderBg`); no new colour.
- R4 «Тушган пул · Collected» is shortened to «Тушган пул» as a card header on 390 dp; the rail
  labels keep the bilingual suffixes as the brief requires.
- R5 The no-access text is the web's verbatim line even though `viewBasic` holders also pass —
  copy parity over precision, as the brief says «copy those strings verbatim».
