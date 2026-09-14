# Android — Restyle phase 7: the Бош dashboard (design 6a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Бош tab as the owner's design 6a — every web dashboard metric on the phone, from `GET /api/dashboard`, with the phase-1 chrome (outbox, account, refresh) kept.

**Architecture:** `HomeSummary` grows to the fields §2 of the spec renders (mapper from the real payload, money as `Money`); three small design-system pieces (delta badge, bar sparkline, donut) join `KpiCard`; `HomeScreen` becomes one `LazyColumn` of seven sections plus the kept sheets; a 60 s resumed-only ticker refreshes; two hand-offs reach the Orders tab (calendar on today; list) through a one-shot store beside the persisted `OrdersViewStore`.

**Tech Stack:** Kotlin / Jetpack Compose / Hilt / kotlinx.serialization (existing); Roborazzi + Robolectric for frames; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-14-android-dashboard-design.md` — the authority; conflicts inside this plan resolve against it.

## Global Constraints

- All UI strings Uzbek Cyrillic, copied from the web components the spec cites (bilingual «· Booked / · Collected / · AOV» suffixes kept on the rail labels; Latin only there and in «ETALON», «UZS»).
- Money never `Double`/`Long` outside `:core:calc`; every dashboard number decodes through `BigDecimalSerializer` to `Money`/`BigDecimal`. The only client-side arithmetic: the AOV sparkline division and the donut percentage, both `BigDecimal` HALF_UP (spec §3).
- Tokens only (`EtalonColors`/`EtalonType`/`EtalonShapes`/`EtalonSpace`/`EtalonIcons`); no hex, no dp magic outside them; hit targets ≥ 48 dp; light only; thin-space thousands, tabular mono figures, decimal comma.
- Nothing is recomputed that the API already gives; no new metric, status, copy or colour.
- Owner rulings 2026-09-14: no Ой | Ҳафта pill; donut counts only; no server change in this phase.
- Every existing test stays green; existing baselines outside `feature/home` do not move; the `home_*` frames are re-recorded on purpose (the screen is rebuilt) — each listed in the report.
- Builds in the FOREGROUND, one Gradle run at a time; never push; never `git stash`; never production.
- Keep: outbox bell + badge + sheet (rejected orders, reopen-in-calculator gate), account sheet, pull-to-refresh, the no-access state.

## Rulings

- **R1** The Ой | Ҳафта pill is not drawn; the rail kicker reads «МОЛИЯВИЙ ҲОЛАТ · ЖОРИЙ ОЙ».
- **R2** The phase-1 today-rows list leaves Home (the tile → calendar day sheet). `TodayDelivery` stays in the model for the tile's DISPATCHED/DELIVERED count.
- **R3** Prototype hexes → `warning` (amber) and `lavenderBg` (track). No new colour.
- **R4** Card headers on 390 dp: «Тушган пул» (top clients), rail labels keep the bilingual form.
- **R5** No-access line = the web's verbatim `dashboard/page.tsx:69` string.
- **R6** The calendar hand-off is a one-shot `OrdersOpenDayStore` (`fun interface` + in-memory Hilt singleton in `:feature:orders`, consumed once by `OrdersListViewModel` on start: `setView(CALENDAR)` + `selectDay(day)`); Home writes it then switches tab. No route argument (the `Orders` key is a data object shared by the tab).
- **R7** The 60 s ticker is a `LaunchedEffect` keyed on lifecycle RESUMED in `HomeRoute`, calling `vm.refresh()`; the ViewModel stays testable with a plain `refresh()`; the ticker itself is covered by a Robolectric test on the route with a fake clock only if cheap — else the VM test covers "refresh keeps the last payload on failure" and the ticker is reviewed by eye.

## File map

- `core/network/.../dto/DashboardDto.kt` (+ fields), `core/data/.../mapper/DashboardMappers.kt`, `core/model/.../Dashboard.kt`, tests beside them.
- `core/designsystem/.../components/DeltaBadge.kt`, `BarSparkline.kt` (extracted from `KpiCard`'s bars if identical; else new), `Donut.kt`, `SegmentBar.kt` (7-segment) and `StackedBar.kt` (3-share); `DashboardScreenshotTest.kt` in the design-system tests for `ds_delta_badge_light`, `ds_donut_light`, `ds_sparkline_light`.
- `feature/home/.../HomeScreen.kt` (rebuilt sections), `HomeViewModel.kt` (`HomeTiles` → the spec's fields; `HomeUiState` unchanged in its outbox half), `HomeSections.kt` (new: hero, rail, grid, donut card, top clients, recent), `strings.xml`, `HomeScreenshotTest.kt` (+ frames), `HomeViewModelTest.kt`.
- `feature/orders/.../list/OrdersListViewModel.kt` (`OrdersOpenDayStore` + consumption), `OrdersListViewModelTest.kt`.
- `app/.../nav/EtalonNavHost.kt` (Home hand-offs), `app/.../di` (the store binding if the module lives there).

---

### Task 1: Model + wire + mapper — everything §2 renders

**Files:** `DashboardDto.kt`, `DashboardMappers.kt`, `Dashboard.kt`, `DashboardMappersTest.kt` (+ a recorded JSON fixture from the LOCAL dev server's `/api/dashboard`, PII-free: seeded names only).

**Interfaces — produces:**
```kotlin
data class Trend(val deltaPct: BigDecimal, val direction: TrendDirection, val polarity: TrendPolarity)
enum class TrendPolarity { POSITIVE, NEGATIVE }
data class PeriodMoney(val total: Money, val count: Int, val trend: Trend?)      // this-month
data class AllTimeMoney(val total: Money, val count: Int)
data class Aov(val thisMonth: Money, val allTime: Money, val trend: Trend?)
data class MonthBooked(val month: String, val booked: Money)
data class MonthOrders(val month: String, val count: Int)
data class LoadedVolume(val monthKey: String, val blocks: Int, val beamCount: Int, val beamMeters: BigDecimal, val area: BigDecimal, val orderCount: Int)
data class TopCustomer(val id: String, val name: String, val totalCollected: Money, val orderCount: Int)
// RecentOrder gains: clientPhone: String, clientAddress: String?, totalArea: BigDecimal, paymentState: PaymentState
// HomeSummary gains: booked: PeriodMoney, bookedAllTime: AllTimeMoney, collected: PeriodMoney (replaces collectedThisMonth/collectedTrend),
//   collectedAllTime: AllTimeMoney, aov: Aov, receivablesTrend: Trend?, activeCustomers: Int, bookedByMonth: List<MonthBooked>,
//   ordersByMonth: List<MonthOrders>, currentMonthKey: String, loadedThisMonth: LoadedVolume?, topCustomers: List<TopCustomer>
```
- [ ] Read `src/lib/dashboard-data.ts` for the ACTUAL field names (the spec warns `types.ts` lags: `recentOrders` carries `scheduledAt`, `status`, `remaining` on the wire); record one payload from the local server as the fixture.
- [ ] Failing tests: every new field decoded; money never `Double` (assert types); `loadedVolumeByMonth` without the current month → `loadedThisMonth == null`; `recentOrders` null address; unknown `polarity` → `POSITIVE` with a KDoc why (up = good by default is the web's default too).
- [ ] Implement; `:core:network:testDebugUnitTest :core:data:testDebugUnitTest :core:model:testDebugUnitTest` green; commit `Feat(android) · dashboard model carries every metric the Бош tab renders`.

### Task 2: Design-system pieces — delta badge, sparkline, donut, segment bar, stacked bar

**Files:** the five component files, `DashboardScreenshotTest.kt`, `DeltaBadgeTest.kt`, `DonutTest.kt`.

**Interfaces — produces:**
```kotlin
@Composable fun DeltaBadge(trend: Trend?, modifier: Modifier = Modifier)          // null → nothing; flat → «→ 0%» ink3/lavenderBg
@Composable fun BarSparkline(values: List<BigDecimal>, modifier: Modifier = Modifier, bars: Int = 8) // last bar indigo
@Composable fun Donut(paid: Int, partial: Int, awaiting: Int, size: Dp = 92.dp, centre: @Composable () -> Unit)
@Composable fun SegmentBar(filled: Int, total: Int, segments: Int = 7, modifier: Modifier = Modifier)
@Composable fun StackedBar(shares: List<Pair<Int, Color>>, modifier: Modifier = Modifier)
fun donutPercent(paid: Int, total: Int): Int   // HALF_UP; total 0 → 0
fun trendColors(trend: Trend): Pair<Color, Color>  // (fg, bg) per polarity × direction
```
- [ ] Failing tests: `trendColors` 4 combinations + flat; `donutPercent` (317/353 = 90, 1/3 = 33, 2/3 = 67, 0/0 = 0); sparkline with all zeros draws 8 stubs (bounds assertion); baselines `ds_delta_badge_light` (5 badges in a row), `ds_sparkline_light`, `ds_donut_light`.
- [ ] Implement with tokens only; `:core:designsystem:testDebugUnitTest recordRoborazziDebug --tests "*Dashboard*"` then `verifyRoborazziDebug` for the module (no other frame moves); commit `Feat(designsystem) · delta badge, bar sparkline, donut, segment and stacked bars`.

### Task 3: Home — hero, financial rail, operational grid (top half) + ViewModel fields

**Files:** `HomeViewModel.kt` (`HomeTiles` replaced by the spec's fields), `HomeScreen.kt`, `HomeSections.kt`, `strings.xml`, `HomeScreenshotTest.kt`, `HomeViewModelTest.kt`.
- [ ] Strings (verbatim from the web): `home_kicker_receivables` «ҚАРЗДОРЛИК · ҲОЗИРГИ ҲОЛАТ», `home_receivables_note` «Ой бўйича бўлинмайди · бугунги қолдиқ», `home_orders_badge` «%1$s буюртма», `home_paid`/`home_partial`/`home_awaiting` «Тўланган»/«Қисман»/«Кутилмоқда», `home_kicker_financial` «МОЛИЯВИЙ ҲОЛАТ · ЖОРИЙ ОЙ», `home_booked` «Буюртма қилинган · Booked», `home_collected` «Тушган пул · Collected», `home_aov` «Ўртача буюртма · AOV», `home_this_month_orders` «%1$s та буюртма · ушбу ой», `home_this_month_payments` «%1$s та тўлов · ушбу ой», `home_all_time` «Бошланғичдан: %1$s UZS · %2$s та», `home_all_time_aov` «Бошланғичдан: %1$s UZS», `home_aov_formula` «Ҳисоб: буюртма қилинган ÷ буюртмалар сони», `home_kicker_ops` «ОПЕРАЦИОН ҲОЛАТ», `home_active_clients` «Фаол мижозлар», `home_active_caption` «%1$s тўланган · %2$s қисман · %3$s кутилмоқда», `home_today_deliveries` «Бугунги етказишлар», `home_today_planned` «%1$s м² режалаштирилган», `home_discrepancies` «Очиқ тафовутлар», `home_under_control` «Назоратда», `home_attention` «Диққат», `home_discrepancy_sum` «%1$s UZS тафовут», `home_loaded` «Юкланган ҳажм · %1$s», `home_loaded_blocks_unit` «блок», `home_loaded_beams` «%1$s м балка», `home_loaded_caption` «%1$s та буюртма · %2$s та балка», `home_loaded_none` «Бу ой юк йўқ`. Remove the phase-1 strings the rebuild orphans (grep-proven).
- [ ] Sections: `ReceivablesHero`, `FinancialRail` (LazyRow, 228 dp cards, 16 dp edge inset, `contentPadding`), `OperationalGrid` (2×2; each card `Modifier.clickable` ≥ 48 dp; taps: `onOpenClients`, `onOpenCalendarToday`); today's segment fill = count of `today` rows with status DISPATCHED or DELIVERED.
- [ ] Tests: VM maps `HomeSummary` → state fields; AOV sparkline series HALF_UP; a failed refresh keeps the last payload; frames `home_light` (top half visible), `home_font13`, `home_w360`, `home_empty_month_light`; `home_no_access_light` re-recorded (chrome + the one card).
- [ ] Commit `Feat(home) · receivables hero, financial rail and the operational grid`.

### Task 4: Home — payment donut, top clients, recent orders; hand-offs; 60 s refresh; skeleton

**Files:** `HomeSections.kt`, `HomeScreen.kt`, `HomeViewModel.kt`, `OrdersListViewModel.kt` (+ `OrdersOpenDayStore`), `EtalonNavHost.kt`, `strings.xml`, tests.
- [ ] Strings: `home_payment_state` «Тўлов ҳолати», `home_orders_count` «%1$s та буюртма», `home_paid_pct_caption` «тўланган», `home_top_clients` «Энг тўрти мижозлар», `home_top_clients_unit` «Тушган пул», `home_top_empty` «Ҳали тушум йўқ», `home_recent` (kept), `home_recent_all` «Барчаси →», `home_no_access_dashboard` «Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.».
- [ ] `OrdersOpenDayStore` (R6): `fun interface OrdersOpenDayStore { fun take(): LocalDate?; fun set(d: LocalDate) }`-shaped singleton; `OrdersListViewModel` consumes on init → `setView(CALENDAR)` + `selectDay(d)`; test: a stored day opens the calendar on that day exactly once.
- [ ] Nav: `HomeRoute(onOpenClients, onOpenCalendarToday, onOpenOrdersList, …)`; `EtalonNavHost` wires `switchTab(Clients)`, store + `switchTab(Orders)`, `switchTab(Orders)` after `viewStore.set(LIST)`.
- [ ] Skeleton mirroring `DashboardSkeleton.tsx` blocks (hero, rail, grid, three cards) while `loading && summary == null`; frame `home_skeleton_light`.
- [ ] 60 s resumed-only ticker (R7).
- [ ] Frames: `home_light` re-recorded scrolled to the bottom half? — NO: one screen frame per state is enough; add `home_bottom_light` captured after `performScrollToIndex(last)`.
- [ ] Commit `Feat(home) · payment donut, top clients, recent orders; calendar and list hand-offs; auto-refresh`.

### Task 5: Web-parity walk + captures

- [ ] With the local dev server and the seeded owner: open the web dashboard (current month, order basis) and the phone side by side; a table in the report of every figure (hero, three rail cards + their two lines, four grid tiles, donut %, top 5 sums, four recent orders) phone vs web — all equal or the difference explained by a phone-side bug fixed in this task. Taps: Фаол мижозлар → Clients; Бугунги етказишлар → Жадвал on today with the day sheet; № → detail; Барчаси → Рўйхат.
- [ ] Captures `captures/dashboard-*.png` (top, bottom, no-access as the seeded driver, three-button nav once). Commit only if code changed: `Fix(home) · dashboard parity walk`.

### Task 6: Close — orphans, lint, standard command

- [ ] Orphaned strings/components from the rebuild removed (grep-proven; `NoLegacyApiTest` and `NoRawHexTest` green); the standard command with `--rerun-tasks`; web `npx tsc --noEmit && npx vitest run` untouched but run once (no web change expected).
- [ ] Commit `Chore(home) · dashboard phase close`.

## Carried for later slices
- Weekly buckets + per-state sums on `/api/dashboard` (server, additive) → the Ҳафта pill and donut sums.
- HeroChart / date-basis toggle / RegionRanking as a second screen if the owner asks.
- The DRIVER role's empty Home (open owner decision).

## Self-review
- Spec coverage: §2.1 (T3 app bar unchanged + kicker), §2.2–2.4 (T3), §2.5–2.7 (T4), §2.8 (T4), §3 data (T1, T3 AOV, T4 ticker/skeleton), §4 nav (T4), §6 edge rules (T3/T4 frames), §7 acceptance (T1–T5).
- Type consistency: `Trend(deltaPct, direction, polarity)` (T1) consumed by `DeltaBadge` (T2) and the rail (T3); `LoadedVolume` (T1) by the grid (T3); `TopCustomer`/`RecentOrder` fields (T1) by T4; `OrdersOpenDayStore` (T4) consumed in the same task.
- Placeholders: none — labels, fields, frames and commit messages are named; the two "decide" points (ticker test depth R7; bottom frame) are ruled in place.
