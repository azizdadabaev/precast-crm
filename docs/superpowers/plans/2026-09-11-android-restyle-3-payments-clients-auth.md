# Android Restyle — Phase 3: Payments, Clients, Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the remaining non-logistics, non-calculator screens — Payments (confirm queue with its confirm/reject sheets), Record payment, Discrepancies, Clients, Client detail, Client edit, Login, Change PIN — so each matches its prototype capture or its §5.2 mapping, and unify the nav-pill clearance so no screen is ever covered by the pill again.

**Architecture:** Every screen is recomposed from the phase-1 components (`NavySheet`, `OrderRow`, `SegmentedControl`, `SearchField`, `FormCard`/`FormField`, `DetailPanel`, `ConfirmSheet`, `EtalonToast`, buttons, tags) exactly as Home, Orders and Order detail were in phase 2. One design-system task lands first: an inset-aware nav-pill clearance that replaces the three ad-hoc mechanisms phase 2 left behind, plus the small component additions the phase-1/2 reviews carried (`OrderRow.trailing`, `SegmentedControl(fill)`, `TonalButton`, compact-button geometry, `BrandMark`, «Лойиҳа», grouped keypad echo). One additive web change supplies per-client totals and the payment-tab counts the captures show.

**Tech Stack:** Kotlin 2.4.10, Compose BOM 2026.08.00, Material3 1.4.0, Navigation 3, Hilt, Retrofit + kotlinx.serialization, Room, Roborazzi 1.73.0 / Robolectric 4.16.1; web: Next.js 14, Prisma, vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` (§4 shell, §5.1 Payments/Clients per spec §3.5/§3.6, §5.2 mapping table for Login, ChangePin, ClientDetail, ClientEdit, RecordPayment, Discrepancies, §7 numbers, §8 testing) argued from `docs/superpowers/specs/2026-09-10-etalon-mobile-design-system-v1.1.md` §2, §3.5, §3.6. **Visual oracles:** `docs/android/restyle-prototype/2b-payments.png`, `2b-clients.png`; for the §5.2 screens the oracle is the mapping row plus the phase-2 screens' idiom (Home/Orders/Detail baselines).

## Global Constraints

- **The capture (or the §5.2 row) is the acceptance test.** Payments and Clients are compared with their captures element by element; the six mapped screens are compared with the mapping row and with the phase-2 idiom (same header pattern, same cards, same rows, same sheets). The reviewer opens the images.
- Light only (D6): new screenshot tests record `_light` and `_font13` only; existing `*_dark.png` of a rebuilt screen are deleted with its test rewrite.
- No raw hex outside `EtalonColors.kt` (`NoRawHexTest`); no `MaterialTheme.colorScheme/typography`, `LocalEtalonColors`, `EtalonType.mono*`, `StatusStripeCard`, `SectionLabel`, `StatusChip`/`PaymentStatusChip`/`DiscrepancyStatusChip`, Material `Icons.*`, `OutlinedTextField` with default colours, `FilledTonalButton`, `RadioButton`, `PrimaryTabRow` in any file this plan touches. Text inputs are `OutlinedTextField` with `EtalonTextFieldDefaults.colors()` (added in Task 2) inside a `FormField`, or `BasicTextField` styled by tokens.
- 48 dp touch targets on every control.
- Numbers per D8: `formatMoney` bare in rows and metas, `MoneyHeroText`/`amountLg` on heroes, `formatArea`, thin space U+202F. `Money` end to end; no `Double`/`Long`/`Float` on a money path.
- Uzbek Cyrillic strings; the wordmark «ETALON» is the one Latin exception (ruling R4 of phase 2).
- Gaps and paddings from `EtalonSpace` tokens; a bare dp literal in a screen is a finding unless it is a spec-named size.
- No new dependency. Server changes additive and backward-compatible; `cd precast-crm && npx tsc --noEmit && npx vitest run` green.
- **Every existing capability kept** on every screen (listed per task); permission gates, offline banners, dedup flows, the receipts retry, the forced-PIN path.
- Verification, from `android/` with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`: `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks` (`--rerun-tasks` mandatory). Record with `:feature:<module>:recordRoborazziDebug --rerun-tasks` and look at every PNG.
- **Never `git stash`.** Emulator captures go to the plan's workspace `captures/` folder, never the worktree root.
- Nav pill clearance: after Task 2, every screen hosted in the shell uses `Modifier.navPillPadding()` / `StickyActionBar(clearNavPill = true)`; the `underNav` token and the `Box(padding(bottom = underNav))` lifts are gone.

## Rulings

- **R1 — Server fields.** `GET /api/clients?page=…` rows gain `totalBooked` (sum of `totalPrice` over the client's orders with `status NOT IN (CANCELED, DRAFT)`, whole UZS, bare number) and the route accepts `sortBy=totalBooked` (computed server-side over the filtered set, then paginated). `GET /api/payments?status=…` (the queue) gains `counts: { pending, confirmed, rejected }` over the same non-status filter. Both additive.
- **R2 — Nav-pill clearance is inset-aware.** The shell provides `LocalNavPillInset` (= `navigationBars` bottom inset + 12 + 60 + 12 dp, i.e. the pill's band plus its margin); `Modifier.navPillPadding()` reads it; `StickyActionBar(clearNavPill = true)` adds it once. `EtalonSpace.underNav`/`underStickyBar` are deleted after every caller migrates (phase-2 screens included, in Task 2).
- **R3 — Payments sheets keep their inputs.** The design-system `ConfirmSheet` (hero + two tiles + Dark/Inverse buttons) is the shape for *confirmations with nothing to type*: the record-payment summary and the reject confirmation. The approve sheet (editable amount, adjustment note, discrepancy action, receipts) stays a white `ModalBottomSheet` restyled with tokens; the approve tap then opens the navy `ConfirmSheet` as its final gate.
- **R4 — Clients list keeps search.** The capture draws no search field, but phone-first lookup is the screen's job; the `SearchField` sits under the subtitle exactly as on Orders. The «Мижоз қўшиш» sticky bar stays (`client.create`).
- **R5 — Client detail is a `DetailPanel` variant.** Caption «Мижоз», headline the name, no status tag, `clientName` slot carries the phone (dial on `onCall`), address line, no tiles, totals «Буюртмалар N · Жами <sum> · Қарз —» where Қарз is omitted (the client API carries no remaining). The edit pencil is a new `actions` slot on `DetailPanel`. The orders below are `OrderRow`s (light) with `debt = null, paidLabel = null`.
- **R6 — Login keeps the PIN pad.** §5.2 says FormCard (phone, PIN); the app signs in with a login name and a 4-digit PIN entered on a pad with auto-submit. Keep that flow: `BrandMark` + «Кириш» + FormCard(login name) + four PIN dots + the pad restyled to tokens (64 dp keys, `surface`/hairline/`md`, digits `titleSm`). No system keyboard for the PIN.
- **R7 — Tab counts.** Payments' segmented switch shows the three counts from R1; while counts are unknown (older server) the labels show without numbers.
- **R8 — Toasts.** «{amount} тасдиқланди» / «Тўлов рад этилди» / «Тафовут ҳал қилинди» via `EtalonToast`, driven by a `toast: String?` field on the ViewModel state cleared after 2 600 ms by the screen.
- **R9 — Discrepancies entry.** Stays behind the Home avatar sheet (phase 2 R3); this phase adds a second door: a «Тафовутлар N» tonal pill in the Payments header when `discrepancy.view` and N > 0 (N from the discrepancies list's open count, fetched by the queue ViewModel through the existing repository).

---

## File map

**Web (`precast-crm/`)**: `src/app/api/clients/route.ts`, `src/lib/client-totals.ts` (+test), `src/app/api/payments/route.ts` (read first; add `counts`), `src/lib/payment-counts.ts` (+test).

**Android core**: `core/network` (`ClientRowDto.totalBooked`, `clients(sortBy)`, `PaymentsPageDto.counts`), `core/model` (`ClientSummary.totalBooked: Money`, `PaymentCounts`), `core/data` (mappers, `ClientsRepository` sort param, `PaymentsRepository` counts), `core/designsystem`: `NavPill.kt` (new: `LocalNavPillInset`, `navPillPadding`, `navPillInsetOf()`), `StickyActionBar.kt` (`clearNavPill`), `EtalonDimens.kt` (delete `underNav`, `underStickyBar`), `OrderRow.kt` (`trailing`), `SegmentedControl.kt` (`fill`), `EtalonButtons.kt` (`TonalButton`, compact geometry), `BrandMark.kt` (new), `EtalonTextField.kt` (new: `EtalonTextFieldDefaults.colors()`), `StatusChip.kt` strings («Лойиҳа»), `NumericKeypadSheet.kt` (grouped echo), `EtalonIcons` (+`Eye`? no — «Кўриб чиқиш» is text).

**Android app**: `nav/EtalonNavHost.kt` (provide `LocalNavPillInset`; Payments entry gains `onOpenDiscrepancies`), phase-2 screens' clearance migration (`HomeScreen`, `OrdersListScreen`, `OrderDetailScreen`, `CalculatorScreen`, `ClientsScreen`, and the nine lifted logistics/payments screens).

**Features**: `feature/payments` (`queue/ConfirmQueueScreen.kt`, `queue/ConfirmSheet.kt` → `queue/ApproveSheet.kt` + `queue/RejectSheet.kt`, `queue/ConfirmQueueViewModel.kt` (toast, counts, discrepancy count), `record/RecordPaymentScreen.kt`, `discrepancies/DiscrepanciesScreen.kt`, `DiscrepanciesViewModel.kt` (toast), strings, `PaymentScreenshotTest.kt` rewritten), `feature/clients` (`list/ClientsScreen.kt`, `detail/ClientDetailScreen.kt`, `edit/ClientEditScreen.kt`, `ClientsViewModel.kt` (sort), strings, screenshot tests), `feature/auth` (`LoginScreen.kt`, `PinPad.kt`, `ChangePinScreen.kt`, strings, `LoginScreenshotTest.kt` rewritten, `ChangePinScreenshotTest.kt` new).

---

### Task 1: Server — client totals and sort, payment-tab counts

**Files:**
- Create: `precast-crm/src/lib/client-totals.ts`, `precast-crm/src/lib/client-totals.test.ts`, `precast-crm/src/lib/payment-counts.ts`, `precast-crm/src/lib/payment-counts.test.ts`
- Modify: `precast-crm/src/app/api/clients/route.ts`, `precast-crm/src/app/api/payments/route.ts`

**Interfaces:**
- Produces: `GET /api/clients?page=…` rows carry `totalBooked: number` (whole UZS); `sortBy=totalBooked` accepted (`sortDir` honoured, default `desc`). `GET /api/payments?…` envelope carries `counts: { pending: number, confirmed: number, rejected: number }` computed with every filter except `status`.

- [ ] **Step 1: Failing tests**

`client-totals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { attachTotals, sortByTotal } from "./client-totals";

describe("client totals", () => {
  it("attaches a whole-UZS total per client, zero when the client has no live orders", () => {
    const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const groups = [{ clientId: "a", _sum: { totalPrice: "12345678.90" } }];
    expect(attachTotals(rows, groups)).toEqual([
      { id: "a", name: "A", totalBooked: 12345679 },
      { id: "b", name: "B", totalBooked: 0 },
    ]);
  });
  it("sorts ids by total desc, ties by name asc", () => {
    const ids = sortByTotal(
      [{ id: "a", name: "Zed", totalBooked: 5 }, { id: "b", name: "Alpha", totalBooked: 5 }, { id: "c", name: "Mid", totalBooked: 9 }],
      "desc",
    ).map((r) => r.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
});
```
`payment-counts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { countsFrom } from "./payment-counts";
describe("countsFrom", () => {
  it("zero-fills the three tabs", () => {
    expect(countsFrom([{ status: "PENDING_CONFIRMATION", _count: { _all: 3 } }, { status: "REJECTED", _count: { _all: 1 } }]))
      .toEqual({ pending: 3, confirmed: 0, rejected: 1 });
  });
});
```

- [ ] **Step 2: Run — fail on missing modules**

- [ ] **Step 3: Helpers**

`client-totals.ts`:
```ts
type Group = { clientId: string; _sum: { totalPrice: unknown } };
export function attachTotals<T extends { id: string }>(rows: T[], groups: Group[]): Array<T & { totalBooked: number }> {
  const byId = new Map(groups.map((g) => [g.clientId, Math.round(Number(g._sum.totalPrice ?? 0))]));
  return rows.map((r) => ({ ...r, totalBooked: byId.get(r.id) ?? 0 }));
}
export function sortByTotal<T extends { name: string; totalBooked: number }>(rows: T[], dir: "asc" | "desc"): T[] {
  const s = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => (a.totalBooked - b.totalBooked) * s || a.name.localeCompare(b.name));
}
```
`payment-counts.ts`:
```ts
type Group = { status: string; _count: { _all: number } };
export function countsFrom(groups: Group[]) {
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { pending: n("PENDING_CONFIRMATION"), confirmed: n("CONFIRMED"), rejected: n("REJECTED") };
}
```

- [ ] **Step 4: Clients route**

Add `"totalBooked"` to `CLIENT_SORT_FIELDS`. In the paginated branch: when `sortBy === "totalBooked"`, fetch `prisma.client.findMany({ where, include, select-free })` for the filtered set's `id, name, …` (all rows, no skip/take), `prisma.order.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { notIn: ["CANCELED", "DRAFT"] } }, _sum: { totalPrice: true } })`, `attachTotals` + `sortByTotal`, then slice `[skip, skip + pageSize]` for `rows`; `total` is the filtered count as today. Otherwise keep the current query and ALSO run the same `groupBy` for the page's ids and `attachTotals` — so `totalBooked` is on every paginated row regardless of sort. The unpaginated branch is unchanged (the web's own consumers). `clientOrderBy` gets no new case (the aggregate sort is done in JS).

- [ ] **Step 5: Payments route** — read `precast-crm/src/app/api/payments/route.ts`; where it builds `where` for the list, copy it before the `status` filter is applied into `countWhere`, add `prisma.payment.groupBy({ by: ["status"], where: countWhere, _count: { _all: true } })` to its `Promise.all`, and put `counts: countsFrom(groups)` on the response envelope. If the route returns a bare array, wrap nothing — instead add `counts` only when the request carries `?page=` or `?withCounts=1` (the Android client sends `withCounts=1`; the web keeps its bare array). State which in the report.

- [ ] **Step 6: Verify** — `cd precast-crm && npx tsc --noEmit && npx vitest run` green.

- [ ] **Step 7: Commit** — `Feat(api) · client totals with a total sort, payment-tab counts for the mobile`

---

### Task 2: Design system — carried components (clearance and text field moved to phase 4)

> **Amendment (2026-09-11):** the owner pulled the calculator (phase 4) forward, ahead of this phase. Phase 4's Task 1 now lands the inset-aware nav-pill clearance (`LocalNavPillInset`, `navPillPadding`, `navPillContentPadding`, `StickyActionBar(clearNavPill)`, `StickyActionBarDefaults.height`, deletion of `underNav`/`underStickyBar`, the phase-2 migration) and `EtalonTextField`/`EtalonTextFieldDefaults`. When this phase runs, treat those as ALREADY PRESENT: this task keeps only `OrderRow.trailing`, `SegmentedControl(fill)`, `TonalButton`, the compact-button geometry, `BrandMark`, «Лойиҳа», the grouped keypad echo, and the tests for them. Ruling R2 and the Global Constraint on clearance describe the state phase 4 leaves behind.

**Files:**
- Create: `core/designsystem/.../components/NavPill.kt`, `BrandMark.kt`, `EtalonTextField.kt`
- Modify: `StickyActionBar.kt`, `EtalonDimens.kt`, `OrderRow.kt`, `SegmentedControl.kt`, `EtalonButtons.kt`, `NumericKeypadSheet.kt`, `StatusChip.kt` + designsystem `strings.xml`, `app/.../nav/EtalonNavHost.kt`, and every clearance call site: `HomeScreen.kt`, `OrdersListScreen.kt`, `OrderDetailScreen.kt`, `CalculatorScreen.kt`, `ClientsScreen.kt`, `ConfirmQueueScreen.kt`, `RecordPaymentScreen.kt`, `DriversScreen.kt`, `ShipmentsScreen.kt`, `ShipmentLoadScreen.kt`, `LoadTruckScreen.kt`, `DispatchScreen.kt`, `DeliveryProofScreen.kt`, `DeliveryLocationScreen.kt`, `PhotoCapture.kt`, `LogisticsScreenshotTest.kt` previews.
- Tests: `NavPillTest.kt` (new), `OrderRowScreenshotTest.kt`, `ControlsScreenshotTest` (segmented fill), `ButtonsScreenshotTest` (tonal + compact), `KeptComponentsScreenshotTest` (keypad echo), a `BrandMark` sample on `ds_kept`.

**Interfaces (produces):**
```kotlin
// NavPill.kt
val LocalNavPillInset: ProvidableCompositionLocal<Dp>   // default 0.dp: outside the shell nothing is reserved
@Composable fun navPillInsetOf(): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + NAV_PILL_BAND   // 84.dp = 12 + 60 + 12
@Composable fun Modifier.navPillPadding(): Modifier = padding(bottom = LocalNavPillInset.current)
@Composable fun navPillContentPadding(start: Dp = 0.dp, top: Dp = 0.dp, end: Dp = 0.dp): PaddingValues   // bottom = LocalNavPillInset.current
// StickyActionBar
fun StickyActionBar(clearNavPill: Boolean = true, content: RowScope.() -> Unit)   // bottomInset param removed; when clearNavPill the bar adds LocalNavPillInset ONCE, after its own navigationBarsPadding is dropped (the inset already contains the nav bar)
// OrderRow
fun OrderRow(…, trailing: (@Composable ColumnScope.() -> Unit)? = null)   // drawn under the amount when debt == null && paidLabel == null; e.g. «1 буюртма» in EtalonType.tagPanel ink3 (light) / onDarkMuted (dark)
// SegmentedControl
fun SegmentedControl(…, fill: Boolean = false)   // fill: items take equal weight and the track fills its width (2b-payments)
// EtalonButtons
fun TonalButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, compact: Boolean = true)   // lavenderBg fill, indigo text, pill, h32 compact / h48; the «Кўриб чиқиш» pill
// compact PrimaryButton/SecondaryButton geometry: side padding 13 dp, icon 16 dp, gap 6 dp (measured on 2b-orders «+ Янги» = 70 dp)
// BrandMark.kt
fun BrandMark(modifier: Modifier = Modifier)   // 34 dp gradient square + «ETALON» 14/800 + «Йиғма монолит» meta — extracted from HomeScreen's AppBarRow; Home calls it
// EtalonTextField.kt
object EtalonTextFieldDefaults { @Composable fun colors(): TextFieldColors }   // page ground, hairline surfaceBorder, focused indigo, text ink, placeholder ink3, error red — for OutlinedTextField inside FormField
fun EtalonTextField(value, onValueChange, modifier, placeholder: String? = null, singleLine = true, keyboardOptions = KeyboardOptions.Default, visualTransformation = VisualTransformation.None, textStyle = EtalonType.body, prefix: String? = null, isError = false)   // an OutlinedTextField with those colours, shape md, h48 min
```
- `EtalonDimens.kt`: `underNav` and `underStickyBar` DELETED (compile errors are the migration checklist).
- `StatusChip.kt`: `OrderStatus.DRAFT` label → new `ds_status_draft` = «Лойиҳа» (short and long), family NEUTRAL (already).
- `NumericKeypadSheet`: the echo groups digits with the thin space when `suffix == MONEY_UNIT` (`formatMoney(Money(BigDecimal(digits)))` for a digits-only value; raw while a decimal is being typed).

- [ ] **Step 1: Failing tests** — `NavPillTest`: `navPillInsetOf()` under a fake `WindowInsets` of 48 dp returns 132 dp, of 24 dp returns 108 dp; `LocalNavPillInset` defaults to 0 dp; `StickyActionBar(clearNavPill = true)` inside `CompositionLocalProvider(LocalNavPillInset provides 132.dp)` places its buttons' bottom ≥ 132 dp above the window bottom (Robolectric layout bounds). `OrderRowScreenshotTest`: a sample with `trailing = { Text("1 буюртма") }` and null debt/paid. `ControlsScreenshotTest`: a `fill = true` segmented control at 379 dp. `ButtonsScreenshotTest`: `TonalButton` + the compact primary measuring 70 dp wide for «Янги» with the Plus icon (assert width via `onNodeWithText`). Keypad: `KeptComponents` sample echo «4 000 000».

- [ ] **Step 2: Implement** the interfaces above. In `EtalonNavHost.kt` wrap the `NavDisplay` in `CompositionLocalProvider(LocalNavPillInset provides if (locked) 0.dp else navPillInsetOf())` (the forced-PIN screen hides the pill, so it reserves nothing). Migrate every call site: lists → `contentPadding = navPillContentPadding(start = EtalonSpace.cardMargin, …)`; the phase-2 Box lifts → plain `StickyActionBar { … }` (clearNavPill defaults true); `OrderDetailScreen`'s `bottomInset` → removed, list bottom = `LocalNavPillInset.current + STICKY_BAR_HEIGHT` where `STICKY_BAR_HEIGHT` is a named constant in `StickyActionBar.kt` (`val stickyBarHeight: Dp` = 16 scrim + 12 + 48 + 12 = 88 dp) exposed as `StickyActionBarDefaults.height`; `CalculatorScreen` scaffold padding → `navPillPadding()`; `PhotoCapture` likewise. Re-record every baseline that moves (expect: the 12 logistics/payments, calculator 7, orders 9, home 4, clients 2 — say which moved and by how much; at Robolectric's 0 dp nav inset the band is 84 dp, so most move by 16 dp vs the old 100).

- [ ] **Step 3: Verify** with `--rerun-tasks`; on the emulator (gesture nav) confirm the bar-to-pill gap on Order detail is ~30 dp as the capture draws, and switch the emulator to three-button navigation (`adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton`) and confirm nothing is covered on Orders, Order detail, Clients; switch back (`…navbar.gestural`). Capture both to the workspace.

- [ ] **Step 4: Commit** in two: `Feat(designsystem) · inset-aware nav-pill clearance replaces underNav and the lifts`, `Feat(designsystem) · trailing row line, filled segments, tonal button, brand mark, text-field colours, Лойиҳа, grouped keypad echo`.

---

### Task 3: Android wire — client totals + sort, payment counts

**Files:** `core/network` (`ClientRowDto.totalBooked: BigDecimal = 0` via `BigDecimalSerializer`; `clients(sortBy: String? = null, sortDir: String? = null, withCounts…)`; `PaymentsPageDto.counts: PaymentCountsDto? = null` or the equivalent on the payments call), `core/model` (`ClientSummary.totalBooked: Money`, `PaymentCounts(pending, confirmed, rejected)`), `core/data` (`ClientMappers`, `ClientsRepository.list(query, sortByTotal = true)`, `PaymentsRepository.queue(status)` returns counts alongside rows or a `counts(): Flow<PaymentCounts?>`), tests extended (`ClientMappersTest`, `PaymentsApiTest`/mapper test with and without the new keys).

- [ ] Steps: failing decode/mapper tests → DTO/model/repo → module tests → standard command (no baseline moves) → commit `Feat(android) · client totals, total sort and payment-tab counts on the wire`.

---

### Task 4: Payments — queue, approve sheet, reject sheet, toasts

**Files:** `feature/payments/queue/ConfirmQueueScreen.kt` (rewrite), `queue/ConfirmSheet.kt` → `queue/ApproveSheet.kt` + `queue/RejectSheet.kt`, `queue/ConfirmQueueViewModel.kt` (`toast`, `counts`, `openDiscrepancies: Int`), `res/values/strings.xml`, `app/.../nav/EtalonNavHost.kt` (Payments entry gains `onOpenDiscrepancies = { backStack.add(Discrepancies) }` when `discrepancy.view`), `PaymentScreenshotTest.kt` (queue part rewritten), `ConfirmQueueViewModelTest.kt` (toast/counts cases).

**Oracle:** `2b-payments.png`.

**Composition** (`statusBarsPadding()` at the root; `Column(page)`):
1. Header (`padding(horizontal = EtalonSpace.headerMargin)`): «Тўловлар» `displayTitle`; subtitle «Ходимлар қайд қилган тўловларни тасдиқлаш» `body` ink2; when `discrepancy.view && openDiscrepancies > 0` a `TonalButton(«Тафовутлар N»)` right-aligned in the title row (R9).
2. `SegmentedControl(items = [Кутилмоқда n, Тасдиқланган n, Рад этилган n], fill = true, onNavy = false)` in `padding(horizontal = cardMargin)` — the capture's full-width navy track; counts null while unknown (R7).
3. Banners: offline `ErrorBanner`, error, `NoticeBanner` no-permission — unchanged semantics.
4. `LazyColumn(contentPadding = navPillContentPadding(cardMargin, sm, cardMargin), spacedBy(EtalonSpace.md))` of `PaymentCard`s:
   - white `xl` card, hairline; `Row`: `Avatar(clientName, 36)`, `Column(weight 1)`: name `rowTitle`, meta `meta` ink2 = `formatOrderNo(orderNumber) · methodLabel · recordedBy · formatScheduleDate(paidOn ?: recordedAt)` (recordedBy = `custody.recordedBy` or `collectedBy`, ellipsized); trailing `Column(End)`: `MoneyText(amount, rowAmount)` and, under it, PENDING → `TonalButton(«Кўриб чиқиш», compact)` (only when `canConfirm`; otherwise the tag), else `PaymentStatusTag(status)`.
   - Kept lines below the row (only when present): «Кутилган: …» meta, «Камомад: …» red `label`, rejection reason red meta, `CustodyChain` (restyled in phase 1) — these are what the web shows and the owner decides on.
   - Whole card `clickable` opens the order; the pill opens the approve sheet (`onApprove`), with «Рад этиш» reachable inside the approve sheet's footer (`DangerButton`, which switches the sheet to reject mode — today's `openReject` becomes reachable from the sheet, not the card; the card keeps ONE action as the capture draws).
5. Empty: «Тўлов йўқ» `body` ink3 centred at 48 dp.
6. `EtalonToast(message = s.toast, visible = s.toast != null)` at the bottom; the screen clears it after `TOAST_DURATION_MS` (2 600) via `LaunchedEffect(s.toast)`.

**ApproveSheet** (white `ModalBottomSheet`, `containerColor = surface`, `shape = sheetTop`, `dragHandle = null`, the same non-dismissable-while-submitting guard as today): title «Тўловни тасдиқлаш» `sectionTitle`; meta «№ · client»; amount hero `MoneyHeroText(amount, amountLg)` tappable → `NumericKeypadSheet` (kept, echo now grouped); «Қайд этилди: …» / «Кутилган: …» metas; `FormCard` with `FormField(«Созлаш изоҳи…»)` (`EtalonTextField`) when `amountChanged`; shortfall block: red «Камомад» + `FormField(«Тафовут амали»)` containing three 48 dp option rows (check glyph on the selected, like `DriverPicker`) + note field; receipts `PhotoStrip` + `Lightbox`; error banner; footer `Row`: `DangerButton(«Рад этиш», compact = false, weight)` + `PrimaryButton(«Тасдиқлаш», weight)`. The approve tap opens the navy `ConfirmSheet(caption «Тасдиқлаш», amount, meta «№ · client», tiles ConfirmTile(«Усул», method) + ConfirmTile(«Ходим», recordedBy), dismiss «Бекор қилиш», confirm «Тасдиқлаш»)` → `onSubmitApprove` (R3). **RejectSheet**: the navy `ConfirmSheet` variant cannot carry a reason field, so reject stays a white sheet: title «Тўловни рад этиш», hero (read-only), `FormField(«Сабаб…»)`, footer Secondary + Danger.

**Strings** (add): `payments_title` «Тўловлар», `payments_subtitle` «Ходимлар қайд қилган тўловларни тасдиқлаш», `payments_review` «Кўриб чиқиш», `payments_discrepancies_pill` «Тафовутлар %1$d», `toast_confirmed` «%1$s тасдиқланди», `toast_rejected` «Тўлов рад этилди», `confirm_tile_method` «Усул», `confirm_tile_recorded_by` «Ходим».

**Kept:** tab semantics (server-side status filter), pull-to-refresh, offline gating, `canConfirm`, `busy`, expected/shortfall/discrepancy action rules, receipts, non-dismissable submit, open order.

**Baselines:** `queue_pending_light` (the capture: three pending rows, counts 3/3/1), `queue_confirmed_light` (tags), `queue_shortfall_light` (kept case), `queue_font13`, `approve_sheet_light`, `reject_sheet_light` (via `captureScreenRoboImage`); delete `queue_card_shortfall_{light,dark,font13}`.

- [ ] Steps: strings → failing screenshot + VM tests → screen + sheets → record, look beside `2b-payments.png` → standard command → emulator captures (queue, approve sheet, toast after a confirm on a test payment IF the local DB has a pending one — never confirm real money: use the dev database only) → commit `Feat(android) · Payments rebuilt to the prototype: segmented queue, review pill, approve/reject sheets, toasts`.

---

### Task 5: Record payment

**Files:** `feature/payments/record/RecordPaymentScreen.kt` (rewrite), strings, `PaymentScreenshotTest.kt` (record part), `RecordPaymentViewModelTest.kt` (untouched unless a state field is added for the summary step).

**Oracle:** §5.2 row — «FormCard; amount in `amountLg`; method as FilterChips; receipt PhotoStrip; ConfirmSheet-style summary before submit».

**Composition:** root `statusBarsPadding`; header row: `EtalonIconButton(ArrowLeft, shape md)` + «Тўловни қайд этиш» `headline`; scroll `Column(padding cardMargin, spacedBy md)`: banners (offline/load error/no permission/error) unchanged; order line «№ · client» `rowTitle` + «Мижоз қарзи …» / «Қайд этиш мумкин …» metas (+ the explanation when they differ); **amount block**: `MoneyHeroText(amount, amountLg)` in a white `xl` card, tappable → keypad, red «Ортиқча: …» when over cap; quick chips `EtalonFilterChip(«Тўлиқ · <cap>»)`, `(«Ярми»)`; `FormCard`: `FormField(«Усул»)` → `FlowRow` of `EtalonFilterChip`s (CASH…OTHER); `FormField(«Манба»)` → chips (driver source withheld without `driver.view`, as today); `FormField(«Ҳайдовчи»)` (only when `driverApplies`) → value row with chevron opening `DriverPicker`; hand-over `FormField(«Дарҳол офисга топширилди»)` → a token-coloured `Switch` (`SwitchDefaults.colors(checkedTrackColor = indigo, …)`); `FormField(«Тўлов санаси»)` → value row («Бугун» or the date) opening the existing bounded `DatePickerDialog` (token colours as Orders); `FormField(«Изоҳ»)` → `EtalonTextField`; `FormField(«Чеклар», divider = false)` → `PhotoStrip` + hint meta. Sticky bar: the auto-confirm/pending note `meta` (green/ink2) above `StickyActionBar { PrimaryButton(«Қайд этиш») }` or the two receipts buttons once `paymentId != null` — unchanged rules. **Summary gate:** «Қайд этиш» opens the navy `ConfirmSheet(caption «Тўлов», amount, meta «№ · client», tiles «Усул» + «Манба», dismiss «Бекор қилиш», confirm «Қайд этиш»)` → `onSubmit`. Leave-confirm and remove-receipt dialogs: token-dressed `AlertDialog` (as the sign-out one).

**Strings** (add): `record_summary_caption` «Тўлов», `confirm_tile_source` «Манба».

**Baselines:** `record_light` (cash, driver hidden), `record_driver_light` (source = from driver, driver chosen), `record_summary_light` (the navy sheet), `record_font13`; delete `record_sheet_*`.

- [ ] Steps as Task 4; commit `Feat(android) · Record payment on FormCards with a summary sheet before submit`.

---

### Task 6: Discrepancies

**Files:** `feature/payments/discrepancies/DiscrepanciesScreen.kt` (rewrite), `DiscrepanciesViewModel.kt` (`toast`), strings, `PaymentScreenshotTest.kt` (discrepancies part), VM test (toast).

**Oracle:** §5.2 row — «NavySheet rows with StatusTag; resolve via ConfirmSheet».

**Composition:** root `statusBarsPadding`; header row: back `EtalonIconButton` + «Нақд пул тафовутлари» `headline`; banners; `NavySheet(title = «Рўйхат», fillsToBottom = true)` holding a `LazyColumn` (the Orders pattern) of rows: `Avatar(clientName)`, name `rowTitle` onDark, `DiscrepancyStatusTag(status, ROW_ON_NAVY)`, meta «№ 09‑0003 · Ҳайдовчи · 3 сен» onDarkMuted; trailing: expected `MoneyText` onDark + «Камомад <gap>» in `debtOnDark` (or «Олинган <received>» when the gap is zero); resolution note as a second meta line when present; tap opens the order; a `TonalButton(«Ҳал қилиш»)` under the row when `canResolve` (tonal on navy: `navy2` fill, `lavender` text — add `onDark: Boolean` to `TonalButton` in this task; ledger it). Empty «Тафовут йўқ» onDarkMuted. **ResolveSheet:** white `ModalBottomSheet` (as the approve sheet) with title, meta, expected/received metas, «Аввалги қарор» block as a `FormCard` read-only when re-resolving, `FormField(«Ҳал қилиш тури»)` with four 48 dp check rows, `FormField(«Изоҳ…»)`, footer Secondary + Primary; the Primary opens the navy `ConfirmSheet(caption «Ҳал қилиш», amount = gap, meta «№ · client», tiles «Тури» + «Ҳайдовчи», confirm «Ҳал қилиш»)` → `onSubmitResolve`; toast «Тафовут ҳал қилинди».

**Baselines:** `discrepancies_light` (two open, one resolved), `discrepancies_font13`, `resolve_sheet_light`; delete `discrepancies_list_*`.

- [ ] Steps as Task 4; commit `Feat(android) · Discrepancies on a navy list with a resolve summary`.

---

### Task 7: Clients list

**Files:** `feature/clients/list/ClientsScreen.kt` (rewrite), `ClientsViewModel.kt` (sort by total; `totalBooked` in state rows), strings, `ClientsScreenshotTest.kt` (new), `ClientsViewModelTest.kt` (sort param).

**Oracle:** `2b-clients.png`.

**Composition:** root `statusBarsPadding`; header: «Мижозлар» `displayTitle` + «N мижоз · жами айланма бўйича» `meta` ink2 (N = `s.total`); `SearchField(placeholder «Исм ёки телефон рақами»)` (R4); banners; white `xl` card (`padding(horizontal = cardMargin)`) of `OrderRow(clientName = name, status = null, metaLine = "${formatPhone(phone)} · ${formatAddressLine(address)}", total = totalBooked, debt = null, paidLabel = null, trailing = { Text(«N буюртма», tagPanel, ink3) }, onDark = false, onClick)`; the phone in the meta is NOT a link (the row opens the client; dial lives on the detail — say so in a KDoc; `Dial.kt` stays for the detail); truncated `NoticeBanner` at the end; empty «Мижоз топилмади»; `StickyActionBar { PrimaryButton(«Мижоз қўшиш») }` when `showAddAction`; list `contentPadding` bottom = pill inset + `StickyActionBarDefaults.height` when the bar shows.

**Strings** (add): `clients_title` «Мижозлар», `clients_subtitle` «%1$d мижоз · жами айланма бўйича».

**Baselines:** `clients_light` (the capture's eight rows), `clients_empty_light`, `clients_truncated_light`, `clients_font13`.

- [ ] Steps as Task 4; commit `Feat(android) · Clients rebuilt to the prototype: totals, avatar rows`.

---

### Task 8: Client detail and client edit

**Files:** `feature/clients/detail/ClientDetailScreen.kt` (rewrite), `edit/ClientEditScreen.kt` (rewrite the sheet body; keep the ViewModel and the dedup flow), `core/designsystem/.../DetailPanel.kt` (`actions` slot), strings, `ClientDetailScreenshotTest.kt` (new), `ClientEditScreenshotTest.kt` (re-record).

**Oracle:** §5.2 rows + ruling R5.

**Detail composition:** `DetailPanel(caption = «Мижоз», headline = name, statusTag = null, clientName = formatPhone(phone), addressLine = formatAddressLine(address), tiles = {}, totals = { PanelTotal(«Буюртмалар», N); PanelTotal(«Жами», formatMoney(sum of orders' totalPrice)) }, onBack, dateLabel = «» (empty; `DetailPanel` draws nothing for a blank), onCall = dial, actions = { if (showEditAction) EtalonIconButton(Pencil, onDark = true, enabled = !isOffline) })`; notes as a white card «Изоҳ» when present; white card «Буюртмалар» with `OrderRow`s (status tag, meta `formatOrderNo · formatScheduleDate`, total, no debt/paid line) or «Буюртма йўқ»; banners; pull-to-refresh; list bottom via `navPillContentPadding`.

**Edit sheet composition:** white `ModalBottomSheet` (surface, sheetTop): title `sectionTitle` («Янги мижоз» / «Мижозни таҳрирлаш»), banners (error, phone-on-file, stored-phone-invalid, keep notices) as today, `FormCard`: `FormField(«Мижоз номи»)` `EtalonTextField`, `FormField(«Телефон рақами»)` `EtalonTextField(prefix = "+998 ", keyboard Phone)`, `RegionField` ×2 (already skinned), `FormField(«Кўча, уй, хонадон»)`, `FormField(«Изоҳ», divider = false)`; footer `PrimaryButton(«Сақлаш» / «Ўша мижозни очиш»)` with the same enabled/loading rules; the region picker still replaces the sheet.

**Baselines:** `client_detail_light`, `client_detail_font13`, `client_edit_light`/`_font13` re-recorded.

- [ ] Steps as Task 4; commit `Feat(android) · Client detail on a DetailPanel; client edit on FormCards`.

---

### Task 9: Login and Change PIN

**Files:** `feature/auth/LoginScreen.kt`, `PinPad.kt`, `ChangePinScreen.kt` (rewrites), strings, `LoginScreenshotTest.kt` (rewrite: light + font13 + tablet light), `ChangePinScreenshotTest.kt` (new).

**Oracle:** §5.2 rows + ruling R6.

**Login:** `Column(page, statusBarsPadding, padding headerMargin)`: `BrandMark()` at the top; `Spacer(weight 0.4)`; «Кириш» `displayTitle`; «Исмингиз ва 4 рақамли PIN» `body` ink2; hint (indigo `label`) when present; `FormCard { FormField(«Логин», divider = false) { EtalonTextField(loginName) } }`; PIN dots: four 12 dp circles, filled `indigo` / hollow hairline `ink3`, `spacedBy(md)` centred; `ErrorBanner`; a 2 dp `indigo` progress line while submitting; `Spacer(weight 1)`; `PinPad` restyled: 3×4 keys `h64`, `surface`, hairline, `md`, digit `titleSm` ink, backspace key with `EtalonIcons.Delete`, pressed `lavenderBg`, disabled `ink3`; bottom `navigationBarsPadding`. No `Scaffold`, no `MaterialTheme`.

**Change PIN:** header row: back (only when `!forced`) + «PIN ни ўзгартириш» `headline`; forced hint `body` ink2; `FormCard` with `FormField(«Жорий PIN»)` (hidden when forced), `FormField(«Янги PIN»)`, `FormField(«Янги PIN (такрор)», divider = false)` — each `EtalonTextField(keyboard NumberPassword, visualTransformation = PasswordVisualTransformation())`; `ErrorBanner`; `PrimaryButton(«Сақлаш», loading = isSubmitting)`.

**Baselines:** `login_light`, `login_font13`, `login_tablet_light`; delete `login_phone_*`; `change_pin_light`, `change_pin_forced_light`.

- [ ] Steps as Task 4; commit `Feat(android) · Login and Change PIN on the brand page with FormCards`.

---

### Task 10: Close the phase — sweep, verification, owner captures

- [ ] Orphan sweep: `underNav`, `underStickyBar`, `ConfirmSheet` (payments' old file), `queue_card_shortfall`, `record_sheet`, `discrepancies_list`, `login_phone`, `StatusStripeCard`/`SectionLabel`/`StatusChip`/`PaymentStatusChip`/`DiscrepancyStatusChip`/`ShipmentStatusChip` usages outside `feature/logistics` and `feature/calculator` (those two keep them until phases 4–5), Material `Icons.*` outside those two modules, `LocalEtalonColors` outside the shim.
- [ ] Standard command with `--rerun-tasks`; web tests.
- [ ] Emulator walk with captures to the workspace `captures/final-*.png`: Payments (pending tab), approve sheet, Record payment, Discrepancies, Clients, Client detail, Client edit sheet, Login, Change PIN — each beside its oracle in the report; three-button navigation check on Payments and Clients.
- [ ] Commit any sweep: `Chore(android) · retire the pre-restyle payment, client and auth pieces`.

---

## Carried from phases 1–2 (acceptance for this phase)

- Inset-aware pill clearance (Task 2, R2) — the phase-2 reviews' Important item.
- Status-bar insets on Payments and Clients (pre-existing collision) — every rebuilt root has `statusBarsPadding()`.
- `OrderRow` neutral trailing line (Task 2) for Clients/Drivers.
- `SegmentedControl(fill)` for the payments switch (Task 2).
- Compact `PrimaryButton` geometry: 70 dp «+ Янги» (Task 2) — Orders' baseline re-records.
- `DRAFT` → «Лойиҳа» (Task 2).
- Grouped keypad echo (Task 2).
- `TonalButton` for «Кўриб чиқиш» / «Ҳал қилиш» (Tasks 2, 4, 6).
- `BrandMark` shared by Home and Login (Tasks 2, 9).
- From the phase-2 whole-branch review: ChangePin's pill clearance and IME behaviour (Task 9 — `imePadding()` on its column); Roborazzi baselines for `AccountSheet` and `OutboxSheet` (Task 2 records them as `ds_account_sheet_light` / `ds_outbox_sheet_light` via `captureScreenRoboImage` if phase 3 touches those files, else Task 10 adds them in `:app`); the owner-visible items to confirm or restore before this phase closes — the receivables card's missing sparkline (R2), the order detail's per-room subtotal line and the client phone as text (Task 8 M5), and the month names' Russian-Cyrillic forms («сентябрь», as the captures draw) — asked of the owner, not changed here.
- From phase 4 (calculator) and its whole-branch review: `OutboxSheet` now has its own baselines in `:feature:home` (`home_outbox_*`), so Task 2 records only `ds_account_sheet_light`. Every rebuilt screen with a text field gets `imePadding()` on its root and hides its sticky bar while `WindowInsets.isImeVisible` (the calculator's `SummarySheet.barVisible` / order detail's pattern) — `enableEdgeToEdge` makes the manifest's `adjustResize` inert. Every money column derived from parts must SUM on display (the phase-4 `displayedDiscount` rule; the web mirrors it). Owner-visible items carried, not fixed here: M3 date pickers' month header and weekday initials follow the DEVICE locale (fix = app locale via `AppCompatDelegate.setApplicationLocales` + `uz-Cyrl`, a readiness-slice item); the web's own order page still prints the server's English «Order placed for …» event text (server-side fix, separate); another operator's sign-in purges queued orders and their rejected rows (pre-existing, now costs a whole quote); «Калькуляторда очиш» on a rejected quote overwrites an open calculator draft without asking (gate on a non-empty draft in the readiness slice); «Буюртма бериш» on the summary sheet's action row ellipsizes at 360 dp; the settings sheet's grid label «Лабораторий ўлчам» reads oddly (pre-existing wording, owner's call); the AVD advertises a hardware keyboard, so `imePadding` magnitudes are proven only on a real phone.
- Phase-5 items stay out: `«Юкланди деб белгилаш»` ellipsis, the driver screens, `Lightbox` scrim judgement.

## Self-review

- Spec coverage: §3.5 Payments (Task 4), §3.6 Clients (Task 7), §5.2 Login/ChangePin (Task 9), ClientDetail/ClientEdit (Task 8), RecordPayment (Task 5), Discrepancies (Task 6); §4 shell clearance (Task 2); §7 numbers throughout; §8 testing per task.
- Type consistency: `TonalButton` gains `onDark` in Task 6 (ledger); `StickyActionBarDefaults.height` (Task 2) is used by Tasks 7 and by the migrated `OrderDetailScreen`; `PaymentCounts` (Task 3) feeds `SegmentItem.count` (Task 4); `ClientSummary.totalBooked` (Task 3) feeds `OrderRow.total` (Task 7); `DetailPanel.actions` (Task 8) is additive with a null default.
- Placeholders: none — every step names its strings, components and baselines; the payments-route `counts` placement has two explicit alternatives, decided by the route's existing shape and stated in the report.
