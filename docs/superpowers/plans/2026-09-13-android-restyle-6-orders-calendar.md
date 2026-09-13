# Android Restyle — Phase 6: Orders capacity calendar (Рўйхат / Жадвал) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Orders tab a Рўйхат / Жадвал switch whose Жадвал view is the web's capacity calendar (month grid, four load tiers from the server's thresholds, navy day sheet with that day's orders), share the day filter with the list, add the Excel-backup export, and reuse the grid as the calculator's delivery-date picker.

**Architecture:** One screen, one ViewModel. `OrdersListViewModel` already owns `query/status/payment/day`; it gains a `view` (persisted), a cursor month, a per-month capacity cache and the day sheet's order list. A new `CapacityRepository` (in `:core:data`) fetches `/api/orders/capacity` for the visible 42-day grid and caches by `YearMonth` for the session. The grid and day sheet are new composables in `:feature:orders/calendar/`, built from the design system (four new colour tokens, two glyphs, a `TierTag`). The calculator's place-order sheet opens the same grid read-only. No web change.

**Tech Stack:** Kotlin 2.4.10, Compose BOM 2026.08.00, Material3 1.4.0, Hilt, Retrofit + kotlinx.serialization, DataStore, Roborazzi 1.73.0 / Robolectric 4.16.1.

**Spec:** `docs/superpowers/specs/2026-09-12-android-orders-calendar-design.md` (§1 job, §2 shell, §3 list chip, §4 card/cell/data/behaviour/day sheet, §5 export, §6 tiers, §7 calculator grid, §8 edge rules, §9 acceptance), argued from the owner's brief `docs/android/restyle-prototype/ORDERS_TAB_BUILD_BRIEF.md` and the web `precast-crm/src/components/orders/CapacityCalendar.tsx` + `src/app/api/orders/capacity/route.ts`. The restyle design `docs/superpowers/specs/2026-09-10-android-restyle-design.md` and the design system v1.1 govern everything not said here.

## Global Constraints

- **The brief's §2.3 and the design §4 are the acceptance test**; the prototype's turn-4 frame (`Etalon Mobile v2.dc.html`, 4a) is not on this machine — cell geometry is the brief's and gets re-checked when the export arrives (ruling R9). The reviewer opens the baselines beside the brief's numbers.
- Light only; new screenshot tests record `_light` and `_font13` (plus `_w360` where named).
- No raw hex outside `EtalonColors.kt` (`NoRawHexTest`); no `MaterialTheme.*`, `LocalEtalonColors`, Material `Icons.*`, `DatePicker` on the rebuilt paths; every size a named `private val` reading a token or a spec-named number.
- 48 dp touch targets (cells are 56 dp tall; ‹ › are 48 dp slots; the chip's × is a 48 dp slot).
- Numbers per D8: `formatArea` for m², `formatCountBare` for counts, `formatMoney` bare for the day's money line, thin space U+202F; `Money`/`BigDecimal` end to end — `totalArea` is `BigDecimal` on the wire and in the model; the ONLY float is the bar ratio inside the draw code (`(totalArea / heavy).toFloat().coerceIn(0f, 1f)`), never stored.
- Uzbek Cyrillic strings, module-prefixed (`orders_*`, `calendar_*`, `ds_tier_*`), no cross-module name collision.
- Thresholds come from the server; `CapacityThresholds.DEFAULT` (300/450/600) is used only when the response omits them.
- Every existing capability kept: search/status/payment/day filters, facets, paging, pull-to-refresh, the Material day-picker fallback in Рўйхат, «+ Янги», the calculator's place-order flow incl. the past-date bound.
- IME rule R13: no new text field is added; nothing to pad.
- Nav-pill clearance: every new bottom edge uses `navPillContentPadding`/`navPillPadding`.
- Verification, from `android/` with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`: `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks` (`--rerun-tasks` mandatory). Record with `:feature:<module>:recordRoborazziDebug --rerun-tasks` and look at every PNG. Never run a Gradle build while capturing on the emulator.
- **Never `git stash`.** Emulator captures go to the plan's workspace `captures/`, never the worktree root. The debug build targets the LOCAL dev server only; never place orders or export against production.

## Rulings

- **R1 — One ViewModel.** The calendar is a second view of `OrdersListViewModel`, not a sibling VM: `day` is shared by construction, and switching views cannot lose state.
- **R2 — Tokens.** `EtalonColors` gains `warning #F0A868`, `warningBg #FDF1E6`, `heavy #C2622D`, `heavyBg #F8E6DC`; Available = `green/greenBg`, Overbooked = `red/redBg`. No other hex anywhere.
- **R3 — Thresholds.** `CapacityThresholds` decodes from the response; `DEFAULT` only when absent; the legend prints the decoded values.
- **R4 — Export.** `GET /api/orders/export` is streamed to `cache/exports/orders-backup-<stamp>.xlsx` and shared through the existing `FileProvider` (`${packageName}.fileprovider`, `file_paths.xml` gains `cache/exports/`); the button is drawn only with `order.exportBackup`; never queued (not idempotent).
- **R5 — Fallback picker stays.** Рўйхат keeps its Material day picker as the offline/empty-cache path; the chip «12 сен ×» is the visible filter either way.
- **R6 — The day sheet respects the shared filters** (`query/status/payment`) so it never disagrees with Рўйхат filtered to the same day.
- **R7 — Selection outside the cursor month** stays selected (the chip shows it) but is not drawn.
- **R8 — Tier labels** «мавжуд / ўртача / юқори / тўлиб кетган» live in the design system (`ds_tier_available/moderate/heavy/overbooked`).
- **R9 — Prototype check deferred.** Cell geometry per the brief (h 56, r 10, 12/600 · 9/700 · 9.5/600 · 3 dp bar). When the export lands, Task 7 (or a follow-up) compares and re-records if the designer's numbers differ.
- **R10 — Grid range = web's.** Monday-first; start = first of month − ((dow+6)%7); end = start + 41 (6 weeks); request `from=start&to=end` as `YYYY-MM-DD` (the route's `z.coerce.date()` parses it; the server buckets in Asia/Tashkent as the list does).
- **R11 — Persisted view.** `OrdersView { LIST, CALENDAR }` in a new `OrdersPrefs` (`:core:datastore`), restored on open; default LIST.

---

## File map

**Android core**: `core/designsystem` (`EtalonColors.kt` +4 tokens; `icon/EtalonIcons.kt` + `ic_lu_chevron_left.xml`, `ic_lu_download.xml`; `components/TierTag.kt` new; strings `ds_tier_*`; `NoRawHexTest` unchanged), `core/model` (`Capacity.kt` new: `CapacityTier`, `tierFor`, `CapacityThresholds`, `CapacityDay`, `CapacityMonth`, `gridRange(YearMonth)`), `core/network` (`dto/CapacityDto.kt`; `EtalonApi.capacity(from, to)`, `EtalonApi.exportBackup(): ResponseBody` `@Streaming`), `core/data` (`CapacityRepository.kt` new; `ExportRepository.kt` new; mappers), `core/datastore` (`OrdersPrefs.kt` new), `core/testing` (`FakeEtalonApi` + test-local fakes widened).

**Feature orders**: `list/OrdersListViewModel.kt` (+ view, cursor, capacity, day sheet, export), `list/OrdersListScreen.kt` (segment, subtitle, header action, chip, calendar host), `calendar/CapacityCalendarCard.kt`, `calendar/DayCell.kt`, `calendar/DaySheet.kt`, `calendar/CalendarLegend.kt` (new), strings, `CalendarScreenshotTest.kt` (new), `OrdersListScreenshotTest.kt` (+ chip frame), `OrdersListViewModelTest.kt` (+ cases), `CapacityRepositoryTest.kt`, `CapacityModelTest.kt`.

**Feature calculator**: `PlaceOrderSheet.kt` (date row opens `DateGridSheet`), `calendar/DateGridSheet.kt` (new, thin wrapper over the card in read-only mode — the card lives in `:core:designsystem`? NO: the card stays in `:feature:orders`; to share it with the calculator, Task 4 puts `CapacityCalendarCard` + `DayCell` + `CalendarLegend` in **`:core:ui`** (which both features depend on) — see Task 4), `CalculatorSheetsScreenshotTest` (+ frame).

**App**: `nav/EtalonNavHost.kt` (Orders entry gains `canExport = me.can(PERM_ORDER_EXPORT_BACKUP)`), `app/src/main/res/xml/file_paths.xml` (+ `cache/exports`).

---

### Task 1: Design system — tier tokens, two glyphs, `TierTag`, tier model

**Files:**
- Modify: `core/designsystem/.../theme/EtalonColors.kt` (+4 tokens, R2), `core/designsystem/.../icon/EtalonIcons.kt` (+`ChevronLeft`, `Download`), `core/designsystem/src/main/res/values/strings.xml` (+`ds_tier_available` «мавжуд», `ds_tier_moderate` «ўртача», `ds_tier_heavy` «юқори», `ds_tier_overbooked` «тўлиб кетган»).
- Create: `core/designsystem/src/main/res/drawable/ic_lu_chevron_left.xml`, `ic_lu_download.xml` (Lucide `chevron-left`, `download`, same 24 dp/2 px stroke conventions as the existing `ic_lu_*`), `core/designsystem/.../components/TierTag.kt`, `core/model/.../Capacity.kt`.
- Test: `core/model/src/test/.../CapacityModelTest.kt`, `core/designsystem/src/test/.../TierTagScreenshotTest.kt` (`ds_tier_tags_light`: the four tags on light and on navy), `KeptComponentsScreenshotTest`/token sheet if a token sample frame exists (add the four swatches; say which frame moved).

**Interfaces (produces):**
```kotlin
// core/model Capacity.kt
enum class CapacityTier { AVAILABLE, MODERATE, HEAVY, OVERBOOKED }
data class CapacityThresholds(val low: BigDecimal, val moderate: BigDecimal, val heavy: BigDecimal) {
    companion object { val DEFAULT = CapacityThresholds(BigDecimal(300), BigDecimal(450), BigDecimal(600)) }
}
fun tierFor(totalArea: BigDecimal, t: CapacityThresholds): CapacityTier   // ≤ low, ≤ moderate, ≤ heavy, else — the web's tierFor
data class CapacityDay(val date: LocalDate, val totalArea: BigDecimal, val totalOrders: Int, val totalBlocks: Int)
data class CapacityMonth(val month: YearMonth, val range: ClosedRange<LocalDate>, val days: Map<LocalDate, CapacityDay>, val thresholds: CapacityThresholds) {
    fun day(d: LocalDate): CapacityDay = days[d] ?: CapacityDay(d, BigDecimal.ZERO, 0, 0)
    val totalOrders: Int; val totalArea: BigDecimal   // over the CURSOR month's days only (not leading/trailing)
}
fun gridRange(month: YearMonth): ClosedRange<LocalDate>   // R10: Monday-first start, 42 days
// designsystem
@Composable fun TierTag(tier: CapacityTier, onDark: Boolean = false, modifier: Modifier = Modifier)   // StatusTag geometry; palette per R2: fill = tierBg (light) / tier at 0.18 alpha (navy), text = tier colour
fun CapacityTier.color(): Color; fun CapacityTier.bg(): Color   // in designsystem, mapping to the tokens
```

- [ ] **Step 1: Failing tests** — `CapacityModelTest`: `tierFor(0)=AVAILABLE`, `(300)=AVAILABLE`, `(301)=MODERATE`, `(450)=MODERATE`, `(451)=HEAVY`, `(600)=HEAVY`, `(601)=OVERBOOKED` with DEFAULT; the web's four samples `[0, low+1, moderate+1, heavy+1]`; custom thresholds 200/300/400 recolour `350` from MODERATE to HEAVY; `gridRange(YearMonth.of(2026, 9))` = 2026-08-31..2026-10-11 (Sep 1 2026 is a Tuesday → dow offset 1 → start Aug 31; +41 → Oct 11), `gridRange(2026-06)` = 2026-06-01..2026-07-12 (June 1 is a Monday), `gridRange(2026-11)` = 2026-10-26..2026-12-06; `CapacityMonth.totalOrders/totalArea` count only the cursor month's days. `TierTagScreenshotTest` frame.
- [ ] **Step 2: Implement** per the interfaces. Tokens named exactly `warning`, `warningBg`, `heavy`, `heavyBg` with a KDoc line each naming the tier. Glyphs via the existing Lucide XML convention (licence already in assets).
- [ ] **Step 3: Verify** with `--rerun-tasks`; only the named frames move.
- [ ] **Step 4: Commit** — `Feat(designsystem) · capacity tier tokens, tags and glyphs; tier model`

---

### Task 2: Wire — capacity endpoint, export stream, persisted view

**Files:**
- Modify: `core/network/.../EtalonApi.kt` (+`capacity`, +`exportBackup`), `core/testing/.../FakeEtalonApi.kt` + every test-local `EtalonApi` fake (grep `override suspend fun clients(`), `app/src/main/res/xml/file_paths.xml` (+`<cache-path name="exports" path="exports/"/>`).
- Create: `core/network/.../dto/CapacityDto.kt`, `core/data/.../CapacityRepository.kt`, `core/data/.../ExportRepository.kt`, `core/datastore/.../OrdersPrefs.kt` (+ Hilt provision like `SessionPrefs`), tests: `CapacityApiTest` (decode with/without `thresholds`, `totalArea` as a JSON number `285.4` → `BigDecimal("285.4")`), `CapacityRepositoryTest` (grid range sent as `YYYY-MM-DD`; zero-filled days; second call for the same month does NOT hit the API; a failed month is not cached; `clearCache()` on sign-out like `OrdersRepository`), `ExportRepositoryTest` (stream written to `cache/exports/orders-backup-<stamp>.xlsx`, returns the `File`; error surfaces as `Result.failure`), `OrdersPrefsTest` (default LIST; round-trip).

**Interfaces (produces):**
```kotlin
@GET("/api/orders/capacity") suspend fun capacity(@Query("from") from: String, @Query("to") to: String): CapacityDto
@Streaming @GET("/api/orders/export") suspend fun exportBackup(): ResponseBody
@Serializable data class CapacityDayDto(val date: String, @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal, val totalOrders: Int, val totalBlocks: Int)
@Serializable data class CapacityThresholdsDto(@Serializable(with = BigDecimalSerializer::class) val low: BigDecimal, …moderate, …heavy)
@Serializable data class CapacityDto(val days: List<CapacityDayDto> = emptyList(), val thresholds: CapacityThresholdsDto? = null)
class CapacityRepository @Inject constructor(private val api: EtalonApi) {
    fun observe(month: YearMonth): Flow<Resource<CapacityMonth>>   // emits Loading (no cache) → Success; cached months emit Success immediately
    suspend fun refresh(month: YearMonth): Result<Unit>            // forces a fetch (pull-to-refresh)
    fun clearCache()
}
class ExportRepository @Inject constructor(private val api: EtalonApi, @ApplicationContext ctx: Context) { suspend fun downloadBackup(): Result<File> }
enum class OrdersView { LIST, CALENDAR }
class OrdersPrefs { val ordersView: Flow<OrdersView>; suspend fun setOrdersView(v: OrdersView) }
```
- [ ] Steps: failing tests → DTO/model/repos/prefs → module tests → standard command (no baseline moves) → commit `Feat(android) · capacity, export stream and the persisted orders view on the wire`.

---

### Task 3: ViewModel — view, cursor month, capacity cache, day sheet, export

**Files:** `feature/orders/.../list/OrdersListViewModel.kt` (+ constructor seams `CapacitySource`, `ExportSource`, `OrdersViewStore` in the existing `OrdersSource` idiom; `HiltOrdersListViewModel` wires the repos), `OrdersListViewModelTest.kt` (+ cases), `feature/orders` test fakes.

**Interfaces (produces):**
```kotlin
// added to OrdersListUiState
val view: OrdersView = OrdersView.LIST
val cursorMonth: YearMonth            // defaults to the current month (TASHKENT)
val capacity: Resource<CapacityMonth>? // null until the calendar view is first shown
val daySheet: DaySheetState?          // null when no day is selected
val exporting: Boolean = false
val exportFile: File? = null          // consumed by the screen → share sheet → consumeExport()
val exportError: String? = null
val canExport: Boolean = false        // from the route
data class DaySheetState(val day: LocalDate, val capacity: CapacityDay, val tier: CapacityTier, val heavy: BigDecimal, val orders: Resource<List<OrderSummary>>, val moneyTotal: Money)
// intents
fun setView(v: OrdersView)            // persists via OrdersPrefs; entering CALENDAR first time: cursor = today's month, day = today if null and today in month
fun prevMonth(); fun nextMonth()
fun selectDay(d: LocalDate?)          // sets the SHARED day; null clears (the chip's ×)
fun refreshCalendar()                 // pull-to-refresh in calendar view
fun exportBackup(); fun consumeExport(); fun dismissExportError()
```
- `daySheet.orders` = `source.list(OrdersFilter(q, status, payment, day = selected, sort asc))` (R6) — the SAME repository call Рўйхат uses for a day filter; `moneyTotal` = Σ `totalPrice` (`Money`).
- Default selection (spec §4.4): on the first `setView(CALENDAR)` with `day == null`, select today when today ∈ cursor month.
- `prevMonth/nextMonth` keep `day` (R7).

- [ ] **Step 1: Failing tests** — persisted view restored on init (fake store returns CALENDAR → state.view CALENDAR); `setView(CALENDAR)` selects today when today is in the month and leaves `day` alone when already set; `nextMonth` twice then `prevMonth` → cursor +1, `day` unchanged; the second visit to a month does not call the API (fake counts calls); `selectDay(null)` clears the chip and the day sheet; `daySheet.moneyTotal` sums three orders' `totalPrice`; `daySheet.orders` uses the current `query/status/payment` (assert the filter passed to the fake); `exportBackup` → `exporting` true → `exportFile` set → `consumeExport()` clears; failure → `exportError` Uzbek; thresholds from the fake payload recolour (`tier` on a 350 m² day flips when the fake sends 200/300/400).
- [ ] **Step 2: Implement.** No UI. `canExport` is a constructor parameter (from the route), not a permission read in the VM (mirror how `onNewOrder` is gated in the nav host).
- [ ] **Step 3: Verify**; no baseline moves. **Step 4: Commit** — `Feat(android) · the orders view model learns the calendar: view, month, capacity, day sheet, export`.

---

### Task 4: Calendar card, day cell, legend, day sheet (shared in `:core:ui`)

**Files:**
- Create in `core/ui/.../calendar/`: `CapacityCalendarCard.kt`, `DayCell.kt`, `CalendarLegend.kt`, `CalendarSkeleton.kt`; strings in `core/ui` (`calendar_weekday_mo..su` «Ду Се Чо Па Жу Ша Як», `calendar_month_summary` «%1$s буюртма · %2$s», `calendar_legend_le` «≤%1$s», `calendar_legend_gt` «>%1$s тўлиб кетган», `calendar_prev` «Олдинги ой», `calendar_next` «Кейинги ой», `calendar_today_cd` «Бугун», `calendar_day_cd` «%1$s, %2$s буюртма, %3$s»).
- Create in `feature/orders/.../calendar/`: `DaySheet.kt`; strings `orders_day_sheet_summary` «%1$s буюртма · %2$s ғишт», `orders_day_sheet_empty` «Бу кунга буюртма йўқ. Сиғим бўш — %1$s».
- Test: `core/ui/src/test/.../CalendarScreenshotTest.kt` (`calendar_light` — a September-2026 fixture with the acceptance days 2/8/12 plus a spread, 12th selected, thresholds 300/450/600; `calendar_font13`; `calendar_w360_light`; `calendar_skeleton_light`; `calendar_custom_thresholds_light` — same days with 200/300/400 → different colours), `feature/orders/src/test/.../DaySheetScreenshotTest.kt` (`day_sheet_light` three orders, `day_sheet_empty_light`), plus a bounds test: selecting a day does not move the card's `boundsInRoot` (no layout jump).

**Composition (spec §4.1–4.2, §4.5):**
```kotlin
@Composable fun CapacityCalendarCard(
    month: YearMonth, capacity: Resource<CapacityMonth>?, selected: LocalDate?, today: LocalDate,
    onPrev: () -> Unit, onNext: () -> Unit, onSelect: (LocalDate) -> Unit,
    readOnly: Boolean = false,        // §7: calculator mode — no today/selection semantics change, but past days not tappable
    minSelectable: LocalDate? = null, // §7: today
    modifier: Modifier = Modifier,
)
```
- Card: `surface`, `EtalonShapes.xl`, hairline, `padding(EtalonSpace.cardPadV/H)`. Header row: `EtalonIconButton(ChevronLeft)` · centred `formatMonthYear(month)` `titleSm` + under it `calendar_month_summary` `meta` (`formatCountBare(totalOrders)`, `formatArea(totalArea)`) · `EtalonIconButton(ChevronRight)`. Weekday row `labelSm` `ink3`. Grid: `Column` of 6 `Row`s (or 5 when the 6th row is entirely trailing days — the web draws 6 always; draw 6 for stability), each cell `weight(1f)`, `CELL_H = 56.dp`, gap `2.dp` (`CELL_GAP`), `EtalonShapes.md`.
- `DayCell(day: CapacityDay, tier: CapacityTier?, inMonth: Boolean, isToday: Boolean, isSelected: Boolean, heavy: BigDecimal, enabled: Boolean, onClick)`: ground per tier (`surface` + hairline when `totalArea == 0`; `tier.bg()` else; `navy` when selected); top row: day number `label` (`ink`; today `indigo` + 800 weight; selected `onDark`) + count `captionLight`-sized 9/700 `ink3` (hidden when 0); middle `formatArea(totalArea)` at 9.5/600 in `tier.color()` (hidden when 0; `onDark` when selected); bottom 3 dp bar: `(totalArea / heavy).toFloat().coerceIn(0f,1f)` of the width, `tier.color()` on `surfaceBorder` (track `navy2` when selected); today ring 1 dp `indigo`; `alpha(0.35f)` + not clickable when `!inMonth`; `Role.Button`, content description `calendar_day_cd`. Swipe: a horizontal drag threshold on the grid → `onPrev/onNext`.
- `CalendarLegend(thresholds)`: four items — 10×3 dp swatch (`tier.color()`, `pill`) + `captionLight` `ink2` text «≤300 м²», «≤450», «≤600», «>600 тўлиб кетган» via the strings (numbers `formatDecimal(x, 0)`).
- `CalendarSkeleton()`: the same grid geometry with `page`-coloured blocks.
- `DaySheet(state: DaySheetState, now: Instant, onOpenOrder)`: `NavySheet(title = «{d} {mon} {yyyy} · {weekday}» via `formatLongDate` + the app's weekday table (add `formatWeekday(LocalDate)` to `Formatters.kt` with a test: «Душанба … Якшанба»), fillsToBottom = false)`; row: hero `amountLg` figure «230» + `label` «м²» + `TierTag(tier, onDark = true)`; right column `meta` `onDarkMuted` «3 буюртма · 1 216 ғишт» and `rowAmount` `onDark` `formatMoney(moneyTotal)`; 5 dp bar (`tier.color()` on `navy2`, ratio as the cell); then `OrderRow`s (navy, `debt`/`paidLabel` as the Orders list draws them) from `state.orders`, or `orders_day_sheet_empty` `onDarkMuted` with `formatArea(heavy)`; `ErrorBanner` on failure; loading → three `OrderRow` skeleton rows (reuse the Orders list's).

- [ ] **Step 1: Failing screenshot + bounds tests** (fixtures in a `CalendarFixtures.kt` shared by Tasks 4–6: September 2026 with 2 Sep = 5 / 204,00; 8 Sep = 7 / 525,00; 12 Sep = 5 / 685,00; plus 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17, 19, 21 as the owner's web screenshot shows — the brief's acceptance days are exact, the rest illustrative).
- [ ] **Step 2: Implement** per the composition. `:core:ui` must not depend on `:feature:*`; `OrderRow` is in `:core:designsystem` — fine.
- [ ] **Step 3: Record, LOOK** beside the brief's §2.3 numbers; **Step 4: Verify**; **Step 5: Commit** — `Feat(android) · capacity calendar card, day cells, legend and the navy day sheet`.

---

### Task 5: Orders screen — the Рўйхат / Жадвал switch, chip, header action, export share

**Files:** `feature/orders/.../list/OrdersListScreen.kt`, `OrdersListRoute` (+`canExport`), `app/.../nav/EtalonNavHost.kt` (`canExport = me.can("order.exportBackup")` — add `PERM_ORDER_EXPORT_BACKUP` beside the other literals), strings (`orders_view_list` «Рўйхат», `orders_view_calendar` «Жадвал», `orders_subtitle_calendar` «Жойлаштириш жадвали · кун сиғими м²», `orders_export_cd` «Excel захираси», `orders_export_failed` «Экспорт қилиб бўлмади», `orders_day_chip_cd` «%1$s кун фильтрини олиб ташлаш»), `OrdersListScreenshotTest.kt` (+`orders_calendar_light` — the whole screen in calendar view with the fixture and the day sheet; `orders_day_chip_light` — list view with «12 сен ×»; `orders_calendar_font13`), `OrdersListViewModelTest` untouched.

**Composition (spec §2–§3):**
- Under the subtitle: `SegmentedControl(items = [Рўйхат, Жадвал], fill = true, onNavy = false)` in `padding(horizontal = cardMargin)`; subtitle text switches with the view; header action: LIST → the existing «+ Янги»; CALENDAR → `EtalonIconButton(EtalonIcons.Download, orders_export_cd)` when `canExport` (spinner while `exporting` — `EtalonIconButton` has no loading; draw a 20 dp indigo `CircularProgressIndicator` in its slot).
- LIST: unchanged, plus the chip row when `day != null`: an `EtalonFilterChip(selected = true, text = formatShortDate(day))` with a trailing `X` glyph in a 48 dp slot → `selectDay(null)`; the Material picker stays behind the existing filter button (R5).
- CALENDAR: `LazyColumn(contentPadding = navPillContentPadding(cardMargin, sm, cardMargin))`: banners → `CapacityCalendarCard(...)` (skeleton while `capacity` is `Loading` without data; `ErrorBanner` + retry on failure with an empty grid) → `DaySheet` when `daySheet != null` (animated height via `AnimatedVisibility` expand/shrink; the card above must not move — the bounds test from Task 4 repeats here at screen level).
- Export: `LaunchedEffect(exportFile)` → `Intent.createChooser(ACTION_SEND, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", FileProvider uri)` → `consumeExport()`; `exportError` → `ErrorBanner`.
- Pull-to-refresh in CALENDAR → `refreshCalendar()`.

- [ ] Steps: strings → failing frames → screen → record/look → standard command → **emulator** (LOCAL dev server): `captures/calendar-emulator.png` (September 2026 dev data — the acceptance: 12 Sep 5 / 685 м² Overbooked, 8 Sep 7 / 525 Heavy, 2 Sep 5 / 204 Available), `calendar-day-sheet-emulator.png` (12 Sep tapped), `orders-day-chip-emulator.png` (switch to Рўйхат: chip «12 сен ×», list filtered), `export-share-emulator.png` (the share sheet with the xlsx — only if the signed-in dev user holds `order.exportBackup`; else the empty slot, say so), three-button-nav check → commit `Feat(android) · Orders tab: Рўйхат / Жадвал switch, capacity calendar, day chip, Excel backup share`.

---

### Task 6: Calculator — the delivery-date grid

**Files:** `feature/calculator/.../PlaceOrderSheet.kt` (the «Етказиб бериш санаси» row opens `DateGridSheet`; the value shows «20 сен 2026 · ўртача» = date + `TierTag(tier)` beside it), `feature/calculator/.../calendar/DateGridSheet.kt` (new: white `ModalBottomSheet` (`sheetTop`, navy .55 scrim, `skipPartiallyExpanded`) holding `CapacityCalendarCard(readOnly = true, minSelectable = today, onSelect = { pick; dismiss })` + a `SecondaryButton(«Бекор қилиш»)`), `CalculatorViewModel` (+ `capacity: Resource<CapacityMonth>?`, `dateCursor: YearMonth`, `prevDateMonth/nextDateMonth`, `scheduledTier: CapacityTier?` derived from `scheduledAt` + the cached month; a `CapacitySource` seam), strings (`calc_place_date_grid_title` «Етказиб бериш кунини танланг»), `CalculatorSheetsScreenshotTest` (+`place_order_date_grid_light`; `place_order_light` moves only if the date row now shows a tag — the fixture has a date → yes, it gains «· ўртача» — say so), `CalculatorViewModelTest` (+ tier derivation; cache shared per month).

- Retire the Material `DatePickerDialog` in `PlaceOrderSheet` (and its Uzbek title/headline strings if now unused — grep; the ORDERS list keeps its own).
- Past days: not selectable (`enabled = false`, 35 % alpha like adjacent-month days); today selectable.
- [ ] Steps as Task 5 → emulator `captures/calc-date-grid-emulator.png` (the grid open from the place-order sheet, a day tapped, the tag beside the field) → commit `Feat(android) · the calculator picks the delivery date on the capacity grid`.

---

### Task 7: Close the phase — sweep, verification, owner captures, prototype check

- [ ] Orphans: the calculator's retired date-picker strings; any `DatePicker` import left in `:feature:calculator`; `OrdersPrefs` unused keys; stale KDocs naming the Material picker on the place-order sheet.
- [ ] **Prototype check (R9):** if `Etalon Mobile v2.dc.html` (turn 4) or a standalone export with the calendar is now under `C:\Users\aziz\Downloads\`, render it (Playwright on a local `http.server`) and compare cell geometry/typography with `calendar_light`; re-record on a documented difference; if absent, say so and list what to compare later.
- [ ] Standard command with `--rerun-tasks`; web tests untouched (`npm test` still green — no web change in this phase).
- [ ] Emulator walk with captures to the workspace `captures/final-*.png`: calendar (dev September), day sheet, chip in Рўйхат, export share sheet, calculator date grid; each beside the brief's §2.3 and the owner's web screenshot; three-button navigation check on the calendar view.
- [ ] Commit any sweep: `Chore(android) · calendar phase residuals`.

---

## Carried for phase 5 (logistics) and the readiness slice
- `PhotoCapture` Material `Icons.*` (needs an X glyph — `EtalonIcons.X` exists now: swap it in phase 5).
- `ds_account_sheet_light` needs a Roborazzi harness in `:app` (readiness).
- App locale for the M3 pickers' month header (readiness) — after Task 6 only the ORDERS list's fallback picker remains on Material.
- The web's own calendar prints English («September 2026», AVAILABLE/…) — web work, not this phase.

## Self-review
- Spec coverage: §2 shell (T5), §3 chip (T5), §4.1–4.2 card/cell (T4), §4.3 data + cache (T2/T3), §4.4 behaviour (T3/T5), §4.5 day sheet (T4/T5), §5 export (T2/T3/T5), §6 tiers (T1), §7 calculator (T6), §8 edge rules (T3 tests + T4 fixtures: zero-area day, ≥1 000 m², adjacent-month tap no-op), §9 acceptance (T5 emulator + T3/T4 tests).
- Type consistency: `CapacityMonth`/`CapacityDay`/`CapacityThresholds`/`tierFor` (T1) used by T2 mappers, T3 state, T4 composables, T6 tier derivation; `OrdersView` (T2) used by T3/T5; `DaySheetState` (T3) used by T4's `DaySheet` and T5; `CapacityCalendarCard(readOnly, minSelectable)` (T4) used by T6.
