# Android — Orders tab: Рўйхат / Жадвал capacity calendar (design 4a)

Status: DRAFT written from the owner's brief (`docs/android/restyle-prototype/ORDERS_TAB_BUILD_BRIEF.md`, 2026-09-12) and the web implementation. The prototype revision that carries turn 4 (`Etalon Mobile v2.dc.html`) is not on this machine yet; the cell geometry in §4 is the brief's and must be checked against the export before the plan's screenshot fixtures are frozen. Owner decisions taken 2026-09-12: this is its own phase, run AFTER the phase-3 restyle closes and BEFORE phase 5 (logistics); §7 (the calculator's date picker) is IN scope.

This document extends `docs/superpowers/specs/2026-09-10-android-restyle-design.md` (the restyle design) and inherits its global rules: Uzbek Cyrillic UI, tokens only, light only, 48 dp targets, `Money` over `BigDecimal`, thin-space numbers, the nav-pill clearance, every screen judged on the emulator against its capture.

---

## 1. Job

Two people use this tab:

| Job | Who | About to do |
|---|---|---|
| Plan | the owner / the office, at the desk or on the phone | see how loaded each delivery day is before promising a date; find the day with room |
| Find | any operator | find an order by number / client / phone / address, or see what ships on a given day |

The web already answers both (`src/components/orders/CapacityCalendar.tsx` + the orders list). The phone ports them: the same numbers, the same thresholds, the same day filter, on one screen with a Рўйхат / Жадвал switch.

## 2. Screen shell

One screen, `OrdersListRoute`, gains a navy `SegmentedControl(fill = true)` under the subtitle: **Рўйхат** | **Жадвал**. The chosen view persists per operator (DataStore) and is restored on the next open.

- Title «Буюртмалар». Subtitle: list → «N буюртма · X м²» (as today); calendar → «Жойлаштириш жадвали · кун сиғими м²».
- Header action: list → «+ Янги» (compact primary, opens the calculator; `calculator.use` gate as today); calendar → the export icon button (`EtalonIcons.Download`, 40 dp circle) — visible only when the operator holds `order.exportBackup` (the permission `src/app/api/orders/export/route.ts` checks); otherwise the slot is empty.
- Shared state: `query`, `status`, `payment`, `day` already live in `OrdersListViewModel` (`OrdersListUiState`). The calendar reads and writes the same `day`; switching views never resets any of them (acceptance §9).

## 3. Рўйхат (list)

As built in phase 2 (`2b-orders.png`), plus:

- When `day != null`, a dismissible chip «12 сен ×» sits above the list (under the status chips), and the list is filtered to that scheduled day (`GET /api/orders?day=YYYY-MM-DD`, already wired). Tapping × clears `day` for both views. This replaces the Material day-picker entry point; the picker stays only as the fallback when the calendar view is unavailable (offline with an empty cache — §8).
- Nothing else changes.

## 4. Жадвал (capacity calendar)

### 4.1 Card

White card, radius `xl` (16), hairline, `cardMargin` sides.

- Month header row: ‹ (48 dp slot) · «Сентябрь 2026» `titleSm` centred, under it «N буюртма · X м²» `meta` (N and X summed over the visible month's days, CANCELED excluded because the endpoint excludes them) · ›.
- Weekday row: «Ду Се Чо Па Жу Ша Як» `labelSm` `ink3`, Monday first.
- 7-column grid of only the rows the month needs (**owner ruling R16, 2026-09-13: five rows are enough**) — never a row made entirely of next-month days; a month that genuinely spans six Monday-first weeks (August 2026, May 2027) keeps its sixth row so no day is dropped. Leading days of the previous month and the trailing days that complete the last drawn row stay, greyed. The fetch range remains the web's 42 days.
- Legend row: four pills (10×3 dp swatch + label `captionLight`): «≤300 м²», «≤450», «≤600», «>600 тўлиб кетган» — the numbers are the SERVER's thresholds, formatted with `formatArea`-style grouping, never literals.

### 4.2 Day cell (h 56, radius `md` 10, 2 dp gap)

- Top row: day number `label` 12/600 (`ink`; today 800 `indigo`) left, `totalOrders` 9/700 `ink3` right (omitted when 0).
- Middle: «{totalArea} м²» 9.5/600 in the tier colour (omitted when 0).
- Bottom: 3 dp load bar, width = `min(totalArea / heavy, 1)` of the cell, tier colour, on a `surfaceBorder` track.
- Ground by tier: empty → `surface` + hairline, no bar; Available (≤ low) → `greenBg`; Moderate (≤ moderate) → `warningBg`; Heavy (≤ heavy) → `heavyBg`; Overbooked (> heavy) → `redBg`. Text/bar: `green` / `warning` / `heavy` / `red`.
- Adjacent-month days: 35 % alpha, not tappable, still coloured (the web colours them).
- Today: 1 dp `indigo` ring. Selected: `navy` fill, `onDark` text, bar track `navy2`.
- Touch: the whole cell is the target. Height 56 dp; width follows the column — seven columns inside the card's margins give ~40 dp at 360 dp and ~48 at 411 dp. **Documented exception to the 48-dp rule** (ruling R15, 2026-09-13): a month grid cannot yield 48-dp-wide cells on a 360-dp phone without dropping the card's padding; Material's own date picker uses 40-dp cells for the same reason. The 56-dp height keeps the target's area above 48 × 40; a test pins 56 × ≥ 40.

**New colour tokens** (the only additions to `EtalonColors`; the hex lint allows them there): `warning = #F0A868`, `warningBg = #FDF1E6`, `heavy = #C2622D`, `heavyBg = #F8E6DC`. Available and Overbooked reuse `green/greenBg` and `red/redBg`. Named after the brief's tiers so a future designer maps them without a table.

### 4.3 Data

- `GET /api/orders/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ days: [{ date, totalArea, totalOrders, totalBlocks }], thresholds: { low, moderate, heavy } }`. Request the VISIBLE GRID range (first leading day → last trailing day), exactly as the web (`CapacityCalendar.tsx:87-104`). Missing dates = zeros. Thresholds default to 300/450/600 only when the server omits them (old server); never hard-coded otherwise.
- `totalArea` is a decimal (two places on the wire); it is a MEASURE, not money — `BigDecimal` through `formatArea`; the bar ratio is the one place it becomes a float, in the draw code only.
- Cache per month for the session (in-memory in the ViewModel keyed by `YearMonth`); month switch from cache < 300 ms; skeleton cells (page-coloured blocks in the grid geometry) on the first load of a month; the last-fetched month survives process death via `SavedStateHandle` only as the cursor month, not the data.
- Offline: the cached months stay usable; an uncached month shows the `ErrorBanner` with retry and an empty grid (no zeros invented).

### 4.4 Behaviour

- ‹ › and a horizontal swipe move the cursor month; the selected day persists only if it falls inside the shown month (otherwise it stays selected but not drawn — the chip in Рўйхат still shows it).
- Default selected day on first open of the calendar view: today if the cursor month is the current month, else none. Re-entry restores the last selection from the shared `day`.
- Tap a day → sets the shared `day` and grows the **Day sheet** under the grid (the grid does not move; the sheet animates its height below it).

### 4.5 Day sheet (navy, radius `sheet` 22, `cardMargin`)

- Line 1: «9 сен 2026 · Чоршанба» `label` `onDarkMuted` (day-of-week from the app's own Uzbek table).
- Line 2 left: «230 м²» hero (`amountLg` figure + `label` «м²»), tier tag beside it (`StatusTag` neutral geometry, tier palette: «мавжуд / ўртача / юқори / тўлиб кетган»); right: «3 буюртма · 1 216 ғишт» `meta` and the money line «39 110 840» (`rowAmount`, bare per D8) = Σ of the day's orders' `totalPrice` (from the list call below; `Money`).
- 5 dp capacity bar: ratio `min(totalArea / heavy, 1)`, tier colour on `navy2`.
- Then the day's orders: `GET /api/orders?day=YYYY-MM-DD` (the existing list call with the shared filters `query`/`status`/`payment` ALSO applied, so the sheet and Рўйхат agree), rendered as the phase-2 `OrderRow` (navy variant) — tap → order detail. Paginate only if the API pages (a day rarely exceeds 50).
- Empty: «Бу кунга буюртма йўқ. Сиғим бўш — 600 м²» (`heavy` from the server).
- The sheet clears the nav pill (`navPillContentPadding`).
- **R18 (2026-09-14): the sheet never states a load the server has not sent.** While the month behind the selected day has not landed — offline, in flight, failed — or the day lies outside the loaded grid (R14, the planner paged away), the hero is «—» with no tier tag and no bar, the empty line drops «Сиғим бўш — …», and the right-hand column counts the rows the ORDERS call returned. `CapacityThresholds.DEFAULT` is a fallback for a server that omits thresholds (R3), never something the sheet may print: «0,00 м² · мавжуд · Сиғим бўш — 600 м²» over a failed fetch is the app inventing the factory's capacity. The count and the ғишт also come from the loaded rows whenever `query`/`status`/`payment` is set, so they describe the same set as the money line beside them; the hero stays the day's own capacity, which is what it is labelled as.

## 5. Export (calendar header)

Tap → `GET /api/orders/export` (streams `orders-backup-<stamp>.xlsx`, `Content-Disposition: attachment`) → the file is written to the app's cache via the existing `FileProvider` (the quote-PNG share path) → the system share sheet. A spinner replaces the icon while downloading; failure → `ErrorBanner` «Экспорт қилиб бўлмади» with retry. Never built on the client. The route is gated by `order.exportBackup`; Android shows the button only with that permission.

## 6. Tiers and labels (one source)

`CapacityTier { AVAILABLE, MODERATE, HEAVY, OVERBOOKED }` + `tierFor(totalArea, thresholds)` in `:core:model`, mirroring the web's `tierFor` (≤ low, ≤ moderate, ≤ heavy, else) — unit-tested against the web's four sample values (`0`, `low+1`, `moderate+1`, `heavy+1`). Labels: «мавжуд», «ўртача», «юқори», «тўлиб кетган» (design-system strings, module-prefixed `ds_tier_*`). Colours per §4.2.

## 7. Calculator: delivery-date picker on the same grid

In the place-order sheet (`PlaceOrderSheet`, «Етказиб бериш санаси»), the date row opens the SAME calendar grid in a white `ModalBottomSheet` (read-only tiers, no day sheet, one tap picks and closes). The picked date's tier tag is drawn beside the field value («20 сен 2026 · ўртача»). Past days are not selectable (as the current picker). The Material `DatePickerDialog` there is retired; the Orders list's fallback picker (§3) stays.

**R17 (2026-09-13): the date grid never blocks placing an order.** The load figures are a planning aid. When the capacity call fails or has not answered, the in-range future days stay tappable as plain dates (no figures, no bar, no tag afterwards), and an error banner with retry above the grid says the load figures are unavailable. Opening the grid re-fetches its month (a cached month may be a whole session stale); ‹ › use the cache. Offline placement and queueing therefore work exactly as before the grid existed.

## 8. Failure and edge rules

- Capacity fetch fails: banner + retry; the grid keeps the last good month if cached, else empty cells (no bars, no zeros written into cells).
- **R18 (2026-09-14) extends that to the day sheet**: the cells' rule is the sheet's rule. No month behind the day (or a day outside the loaded grid) means «—» for the hero, no tag, no bar, no «Сиғим бўш — …» — see §4.5. And a refresh that fails **over figures already on screen** says so rather than stopping in silence: «Янгилаб бўлмади» with a retry above the cached month in Жадвал, «Янгилаб бўлмади · сиғим эски маълумот» in the calculator's picker. Over a month with nothing cached the failure is the capacity resource's own `Error` and is reported once, not twice — and it costs one round trip, never a failed `refresh` followed by an `observe` that rediscovers it.
- Threshold change on the server: the next fetch recolours everything; nothing is cached across sessions.
- Day with orders but `totalArea = 0` (beams-only): cell shows the count, no bar, `surface` ground; the sheet shows «0 м²» and the orders.
- `totalArea` ≥ 1 000 m² in a cell: `formatArea` groups («1 216 м²»); the cell width at 360 dp holds five digits + unit at 9.5 sp — verify at font 1.3 (ellipsis never; drop the unit first).
- Font scale 1.3: cells stay h 56; the day number and count may share a line only if both fit, else the count moves under the number (the m² line is the one that yields).
- **The unit yields per GRID, not per cell** (ruling, 2026-09-14): the grid measures the widest figure it is about to draw and every cell obeys that one answer, so a week can never print «525» beside «96 м²». When the unit goes, the legend's own «≤300 м²» carries the scale. The legend reserves its second line from the widest thresholds it could ever be given, so a four-digit factory's first load does not grow the card (frames: `calendar_w360_font13`, `calendar_wide_thresholds_light`).
- Adjacent-month tap: no-op (not a month switch — the web does not switch either).

## 9. Acceptance (the plan's tests)

- September-2026 dev data reproduces the web: 12 Sep = 5 / 685 м² / Overbooked; 8 Sep = 7 / 525 / Heavy; 2 Sep = 5 / 204 / Available — asserted through the ViewModel against a recorded capacity payload AND on the emulator against the local dev server.
- Server thresholds changed in a fixture → the same payload recolours (unit test on `tierFor` + a screenshot with 200/300/400).
- Switching Рўйхат ↔ Жадвал keeps `query`, `status`, `payment`, `day` (ViewModel test).
- Month switch from cache < 300 ms (a test that the second fetch of a month does not hit the API); skeleton frame on first load.
- No layout jump when the day sheet appears: the grid's bounds are identical before/after selection (Compose bounds assertion).
- Baselines: `calendar_light` (September fixture, 12th selected, sheet with three orders), `calendar_empty_day_light`, `calendar_skeleton_light`, `calendar_font13`, `calendar_w360_light`, `orders_day_chip_light` (Рўйхат with «12 сен ×»), `place_order_date_grid_light` (§7), `ds_tier_tags_light`; light only.
- Emulator captures for the owner: the calendar on dev data, the day sheet, the chip in Рўйхат, the export share sheet, the calculator's date grid — each beside the prototype's 4a frame.

## 10. Not in this phase

- The web calendar's own defects seen in the owner's screenshot (English month header «September 2026», English legend) — server/web work.
- A per-order "move to another day" gesture — not in the brief.
- Dark mode (D6).
