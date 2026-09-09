# Android Phase 2b — Calculator Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The phone quotes a job in front of a customer and then places the order. A calculator screen whose live numbers come from the Phase 2a engine, whose inputs are what the operator actually types, and whose Save/Place calls send **inputs only** — so the number on the phone and the number the server stores are the same number.

**Architecture:** One new feature module `:feature:calculator` (Hilt, ViewModel, Compose) on top of `:core:calc`, which gains the **row layer** the web keeps above the engine (`recomputeRow` / `applyRateOverride` / totals aggregation / beam schedule) — that layer was NOT ported in 2a. The server **recomputes every room with its own `calculateSlab` and `loadPricingConfig()`** on both `POST /api/projects` and `POST /api/orders`; Android never sends a computed price, only `RoomCalcInput` fields. Phase 2a's bit-for-bit parity is the whole reason the phone's live figure matches the stored one — if the two ever disagree, the engine port is wrong, not the screen. Drafts live in a Room table keyed by operator (the same semantics as the web's `calculator-draft-<userId>`); placing an order is queueable through the outbox, which is why Task 1 is server work.

**Tech Stack:** Kotlin 2.4 / Compose BOM 2026.08.00 / Material3 `BottomSheetScaffold` / Navigation 3 / Hilt / Room 2.8.4 / Retrofit 3 + kotlinx-serialization / JUnit 5 (Robolectric + Roborazzi only where a screenshot or a Room migration needs them). compileSdk 37 / minSdk 36 via `AndroidConfig`. Server: Next.js 14 App Router, Zod, vitest. **No new dependency is introduced by this plan.**

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` — §5.4 (Calculator), §5.1 (shell), §4.3 (offline/outbox), §6.3 (components). **The design below supersedes §5.4 where the two differ** — it was agreed with the owner after seeing the web calculator side by side. Differences, so an implementer does not "fix" them back: the expanded card is split into *editable inputs* and *read-only engine working-out*; the m² rate override ships (§5.4 does not mention it); the numeric keypad is **docked, not modal**, and stays open across fields; prepayment-at-placement and the capacity week strip are deferred to 2c.

**Base:** branch `feat/android-phase2a`, on top of the Phase 2a head.

---

## Phase 2 split (this plan is the second of four)

| Slice | Scope | Depends on |
|---|---|---|
| 2a (done) | `:core:calc` engine port + parity harness + gazoblok engine | — |
| **2b (this plan)** | Calculator screen, room list, live totals, client bar, draft save → `POST /api/projects`, place order → `POST /api/orders`, share quote image | 2a |
| 2c | Edit an existing order from the calculator, AI assist (`calculator.aiAssist`), prepayment + capacity strip at placement, production log, inventory, Gazoblok orders line | 2a, 2b |
| 2d | Owner editorial home (Vico charts, donut, top clients) — the tier deferred from 1d | — |

### Explicitly out of scope for 2b — do not build these

- **AI assist from a photo or free text** (`POST /api/calculations/ai-extract`). It is gated on the opt-in `calculator.aiAssist` permission and is its own slice (2c). Do not add the button, the permission read, or the endpoint.
- **The CAD drawing canvas** (`RoomCanvas`, `DrawRoomDialog`, `drawingJson`). Phase 3. `SaveProjectDraftSchema.drawing` is simply never sent.
- **Tapered / irregular rooms.** They only ever arrive through the CAD canvas. Every room in 2b is a rectangle with an `innerWidth` and an `innerLength`.
- **Editing an existing order from the calculator** (`?fromOrder=`, `EditOrderSchema`, `PATCH /api/orders/{id}`). Phase 2c.
- **Prepayment and receipt capture inside the place-order sheet**, and the capacity week strip. 2b sends `paidAmount = 0`; the operator records the payment from the order screen straight afterwards, on the `RecordPayment` screen that already exists.
- **Opening a saved draft from a project list.** 2b persists and restores the operator's own single working draft; a projects browser is 2c.

---

## Global Constraints

Copy these into your working notes before you touch anything. Each has cost this project a rebuild at least once.

- **Uzbek Cyrillic for every user-facing string, no exceptions** — labels, buttons, empty states, errors, toasts, content descriptions. Code identifiers stay English. **Never translate existing Uzbek copy.** Where the web already has a word for a thing, use the web's word: «Хона», «Эни», «Бўйи», «Таяниш», «Корр.», «+Б», «Бош Б.», «Шаблон», «Монолит узунлиги», «Балка узунлиги», «Қадам», «Қатор», «Гишт/Қатор», «Майдон», «м² нархи», «Сумма», «Жами», «Жами хоналар», «Чегирма %», «Сўнгги нархи», «Балка + Ғишт», «Жами маҳсулот оғирлиги», «Лабораторий ўлчам», «10 см», «5 см», «Қўшимча», «Тозалаш», «Юбориш», «Лойиҳани сақлаш», «Буюртма бериш», «Кейинги», «дона».
- **Money is `Money` over `BigDecimal`. Never `Double`/`Float`/`Long` for money.** The sole exception is inside `:core:calc`, whose engine mirrors JS `number` arithmetic; `Boundary.kt` is the only crossing point and `moneyOf` is `internal` to that module. **A calculator ViewModel holds engine `Double`s for live display and converts through the boundary (`SlabResult.money()`, `ProjectTotal.money()`) for anything shown as money or sent as money.**
- **Outbox ⇔ idempotency**: a kind may be queued in the offline outbox **only if its route is `withIdempotency`-wrapped**. `OutboxWorker`'s `when (OutboxKind.from(row.kind))` has **no `else`** — a new kind must be handled there or the module does not compile.
- **Every outbox row is owner-stamped** (`OutboxEntity.ownerId`, set from `CurrentUser.id()` at enqueue) and the worker sends only the current operator's rows. Enqueuing with nobody signed in fails loudly; it must not silently succeed.
- **Android string-resource names must be module-prefixed.** Resources merge by name across modules and the nearer-to-app module wins. This has bitten the project three times. `:feature:calculator` uses the `calc_` prefix on every name; anything moved into `:core:designsystem` uses `ds_`.
- **A task that widens `EtalonApi` must update every implementation, including `FakeEtalonApi` in `:core:testing`.** That abstract class exists precisely so the whole project does not break when the interface grows.
- **Any Room schema change needs a `Migration` in `ALL_MIGRATIONS` and a migration test** — the destructive fallback was deliberately removed, because an outbox row is the only durable record of an operator's photo and cash figure. **The database is currently at version 5.** This plan takes it to 6 (Task 8) and then 7 (Task 9). The exported schema JSON under `core/database/src/main/assets/uz.etalon.crm.core.database.EtalonDatabase/` is a committed build artifact — commit the new `6.json` / `7.json` KSP writes.
- **Numbers:** space-grouped thousands (U+00A0 non-breaking), decimal comma, `UZS`, `м²`, `та`, mono tabular figures (`EtalonType.mono*`). Route everything through `:core:ui`'s `Formatters.kt`; **never format inline.**
- **Phone is the unique client identity; names may repeat** — never flag a duplicate name. Normalise through the existing Kotlin mirror `uz.etalon.crm.core.data.mapper.normalizePhone` (mirrors `src/lib/phone.ts`) before writing or matching.
- **JUnit 5.** Never apply `org.jetbrains.kotlin.android` (the convention plugins wire Kotlin). **No new dependency without justification** — this plan needs none.
- **Verification per task:** from `android/`, with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`, run `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon`. **`verifyRoborazziDebug` is not optional:** `testDebugUnitTest` alone records nothing and compares nothing — the Roborazzi baselines are only checked when that task sets the verify property. Six order-detail goldens sat stale from Phase 1c until this phase ran it by name (amended 2026-09-09; earlier tasks in this plan ran the shorter command). For server tasks, from `precast-crm/`, run `npm test` and `npx tsc --noEmit`.

### Wire contracts — verified, use these exact values

The server recomputes every room. Android sends inputs, never results.

**`RoomCalcInputBaseSchema`** (`precast-crm/src/lib/validation.ts:160`) — the room wire shape, snake-free camelCase:

| field | rule |
|---|---|
| `name` | string, ≤80, optional/nullable |
| `innerWidth` | number, **positive** (`> 0`) |
| `innerLength` | number, **positive** (`> 0`) |
| `bearing` | number ≥ 0, default `0.15` |
| `correction` | number, default `0` |
| `extraBeams` | integer ≥ 0, default `0` |
| `forceStartBeam` | boolean, default `false` |
| `patternOverride` | `LayoutPattern` enum (`GB`/`BGB`/`GBG`), optional/nullable |
| `m2PriceOverride` | boolean, default `false` |
| `m2PriceOverrideValue` | number, nullable — **must equal one of the five static `M2_PRICE_TIERS` prices** |
| `m2PriceReason` | string ≤200, nullable |
| `box` | drawing annotation — **Android sends nothing** |

Two refinements at `:206`: an override **value is required** when `m2PriceOverride` is true, and **neither value nor reason may be set** when it is false.

**`SaveProjectDraftSchema`** (`:252`): `projectId?` (update when present, else create) · `name?` · `clientName?` · `clientPhone` (**required**, min 3, max 40) · `clientAddress?` (≤200) · `shapeType` (default `RECTANGULAR`) · `dimensions?` · `rooms[]` (default `[]`) · `discountPercent` (0–100, default 0) · `discountAmount` (≥0, default 0) · `conversationId?` · `drawing?`.

**`PlaceOrderSchema`** (`:278`): `projectId?` · `clientName` (**required**, min 1) · `clientPhone` (**required**, min 5) · `clientAddress` (**required**, min 1) · `shapeType` · `dimensions?` · `rooms[]` (**min 1**) · `discountPercent` · `discountAmount` · `deliveryCost` (≥0, default 0) · `otherCost` (≥0, default 0) · `scheduledAt` (**date, required**) · `notes?` (≤2000) · `paidAmount` (≥0, default 0) · `paymentMethod?` · `receiptUrls[]` (≤10). Refinement: `paymentMethod` is required when `paidAmount > 0` — 2b always sends `paidAmount = 0` and omits `paymentMethod`.

**Permissions.** The tab is gated on `calculator.use` (already, in `Destination.CALCULATOR`). Both write routes are `withPermission("order.create", …)`. So an operator can hold `calculator.use` and quote without being able to save or place — the two actions are gated separately, on `order.create`, and the buttons are hidden rather than disabled-and-then-refused.

**The five override tiers are the STATIC table, not the live one.** `loadPricingConfig()` may return owner-edited prices, but `RoomCalcInputBaseSchema` validates `m2PriceOverrideValue` against the **static** `M2_PRICE_TIERS` compiled into `calculation-engine.ts` — exactly as the web's `RateOverrideDialog` and `applyRateOverride` do. So the override picker offers `DEFAULT_PRICE_CONFIG.m2PriceTiers` prices (140 000 / 160 000 / 180 000 / 200 000 / 230 000), while the *auto-picked* rate comes from the live `Pricing` in the bootstrap. Offering the live prices would earn a 422 the moment the owner edits a tier.

### Known limitation — state it, do not fix it

The engine and the calculator UI both support an **extras-only room** (`innerLength == 0` with `extraBeams >= 1`; `SlabResult.isExtrasOnly`), but `innerLength` is `.positive()` in both persist schemas, so such a room **cannot be saved or ordered**. That has its own approved spec and is out of 2b's scope.

**How the UI behaves (build this, it is not optional):** an extras-only room computes, shows its subtotal, and counts in the totals like any other room — nothing is hidden. `SlabRow.canPersist` is `false` for it. Save Draft and Place Order are **blocked** while any row has `canPersist == false`, with an Uzbek notice naming the rooms («Бу хоналарни сақлаб бўлмайди: …»), and each such card carries an inline warning line. **The room must never silently vanish on save** — dropping it would quietly change the customer's quoted total between the screen and the stored order.

---

## File structure

**Server**
- Modify: `precast-crm/src/app/api/projects/route.ts` (wrap POST), `precast-crm/src/app/api/orders/route.ts` (wrap POST), `precast-crm/src/lib/openapi/registry.ts`, `precast-crm/tests/idempotency-routes.test.ts`; regenerate `docs/api/openapi.json`.

**`:core:calc`** (row layer, new files)
- `core/calc/src/main/kotlin/uz/etalon/crm/core/calc/SlabRow.kt` — `SlabRow`, `recomputeRow`, `applyRateOverride`, `autoPickedRate`, `M2_OVERRIDE_TIERS`.
- `.../calc/Totals.kt` — `ProjectTotals`, `projectTotals`, `BeamScheduleLine`, `beamSchedule`, `beamLengthKey`.
- `.../calc/Grid.kt` — `roundUpToGrid`, `roundDownToGrid`.
- Tests: `SlabRowTest.kt`, `RateOverrideTest.kt`, `TotalsTest.kt`, `BeamScheduleTest.kt`, `GridTest.kt`.

**`:core:designsystem`**
- Modify: `components/NumericKeypadSheet.kt` (extract a docked `NumericKeypad`); create `components/RegionPicker.kt`; modify `res/values/strings.xml`.

**`:core:ui`**
- Create: `regions/ClientAddress.kt` (moved from `:feature:clients`); modify `format/Formatters.kt` (`formatWeightKg`, `formatMeters`).

**`:core:model`** — modify `Logistics.kt` (`OutboxKind.PLACE_ORDER`, `PendingUpload.orderId` nullable), create `Calculator.kt` (`CalculatorDraft`, `PlaceOrderInput`, `SaveDraftInput`).

**`:core:network`** — modify `EtalonApi.kt` (`phone` on `clients`, `saveProjectDraft`, `placeOrder`), create `dto/CalculatorDto.kt`; test `CalculatorContractTest.kt`.

**`:core:testing`** — modify `FakeEtalonApi.kt`.

**`:core:database`** — create `entity/CalculatorDraftEntity.kt`, `dao/CalculatorDraftDao.kt`; modify `EtalonDatabase.kt` (v7), `Migrations.kt` (`MIGRATION_5_6`, `MIGRATION_6_7`), `entity/OutboxEntity.kt`; commit `assets/…/6.json`, `7.json`.

**`:core:data`** — create `CalculatorRepository.kt`; modify `OutboxRepository.kt`, `ClientsRepository.kt`.

**`:core:sync`** — modify `OutboxWorker.kt`.

**`:feature:calculator`** (new) — `build.gradle.kts`, `src/main/res/values/strings.xml`, and under `src/main/kotlin/uz/etalon/crm/feature/calculator/`:
`CalculatorRoute.kt`, `CalculatorScreen.kt`, `CalculatorViewModel.kt`, `CalculatorUiState.kt`, `RoomCard.kt`, `RoomExtras.kt`, `RateOverrideSheet.kt`, `TotalsSheet.kt`, `ClientBar.kt`, `PlaceOrderSheet.kt`, `QuoteImage.kt`.

**App / build** — `android/settings.gradle.kts`, `android/app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/res/xml/file_paths.xml`, `app/.../nav/Keys.kt`, `app/.../nav/StartKey.kt`, `app/.../nav/EtalonNavHost.kt`.

---

## Task 1 (server): make `POST /api/projects` and `POST /api/orders` idempotent

**Files:** modify `precast-crm/src/app/api/projects/route.ts`, `precast-crm/src/app/api/orders/route.ts`, `precast-crm/src/lib/openapi/registry.ts`, `precast-crm/tests/idempotency-routes.test.ts`; regenerate `docs/api/openapi.json`.

**Interfaces consumed:** `withPermission` (`@/lib/api-auth`), `withIdempotency` (`@/lib/idempotency:41`), `SaveProjectDraftSchema` / `PlaceOrderSchema` (`@/lib/validation`).
**Interfaces produced:** both routes accept an optional `Idempotency-Key` header; a repeat with the same key replays the first response byte-for-byte with `Idempotency-Replayed: true`. Requests without the header are untouched, so the web is unaffected.

The architecture's rule is that an operation may be queued in the offline outbox **only** if its route is `withIdempotency`-wrapped, and the owner has chosen to make placing an order queueable. Neither route is idempotent today: a response lost after the transaction commits turns one tap into two real orders against a real customer.

- [ ] **Step 1: Add the failing route test.** In `precast-crm/tests/idempotency-routes.test.ts`, add both paths to the `ROUTES` array:

```ts
  "src/app/api/projects/route.ts",
  "src/app/api/orders/route.ts",
```

Run `npx vitest run tests/idempotency-routes.test.ts` — two new cases fail on the missing import.

- [ ] **Step 2: Wrap `POST /api/projects`.** In `src/app/api/projects/route.ts`, add `import { withIdempotency } from "@/lib/idempotency";` beside the other `@/lib` imports and change the export at `:216`:

```ts
/** POST /api/projects — order.create. Save Project (draft). Phone-only required.
 *
 *  Wrapped in `withIdempotency` for the same reason POST /api/payments is: the Android
 *  calculator saves a draft over a field connection and retries, and a response lost after
 *  the Project row committed would otherwise leave one quote saved twice under two ids —
 *  the operator then edits one of them and places an order from the stale other. */
export const POST = withPermission("order.create", withIdempotency(async (req: NextRequest, { user }) => {
```

and close it with `}));` where the handler previously closed with `});`.

- [ ] **Step 3: Wrap `POST /api/orders`** the same way, at `src/app/api/orders/route.ts:111`, keeping the existing KDoc block above it and appending one paragraph:

```ts
 * Wrapped in `withIdempotency` because placing an order is the one operation the Android outbox
 * may queue offline: the queued row's id IS the Idempotency-Key, so a drain that retries after a
 * dropped connection replays the first response instead of creating a second real order — with a
 * second order number, a second production commitment and a second receivable.
```

Change the export line to `export const POST = withPermission("order.create", withIdempotency(async (req: NextRequest, { user }) => {` and close with `}));`.

- [ ] **Step 4: Register both in the OpenAPI document.** `/api/projects` is not registered at all today, and `/api/orders` POST carries no `Idempotency-Key` header. In `src/lib/openapi/registry.ts`, import `SaveProjectDraftSchema` alongside `PlaceOrderSchema`, replace the `post /api/orders` line at `:105` with one carrying `headers: z.object({ "Idempotency-Key": idem })`, and add beside it:

```ts
registry.registerPath({ method: "post", path: "/api/projects", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: json(SaveProjectDraftSchema) }, responses: { 201: { description: "Project", ...json(envelope(Any)) }, ...errors } });
```

- [ ] **Step 5: Regenerate and verify.** From `precast-crm/`: `npm run openapi:generate`, then `npm run openapi:check` (must print "up to date"), `npx vitest run tests/idempotency-routes.test.ts tests/openapi.test.ts`, `npm test`, `npx tsc --noEmit`. Commit the regenerated `docs/api/openapi.json` with the sources.

- [ ] **Step 6:** Commit — `Feat(api) · save-draft and place-order accept an Idempotency-Key`.

---

## Task 2: the row layer in `:core:calc` — `recomputeRow`, the rate override, totals, beam schedule

**Files:** create `core/calc/src/main/kotlin/uz/etalon/crm/core/calc/SlabRow.kt`, `Totals.kt`, `Grid.kt`; test `SlabRowTest.kt`, `RateOverrideTest.kt`, `TotalsTest.kt`, `BeamScheduleTest.kt`, `GridTest.kt`.

This layer sits **above** the engine and was not ported in 2a. Its source is `precast-crm/src/components/calculation/MultiRoomCalculator.tsx` — `SlabRow` at `:35`, `recomputeRow` at `:241`, `applyRateOverride` at `:275`, `autoPickedRate` at `:299`, the totals aggregation at `:598`, the beam schedule at `:609` — plus `roundUpToGrid`/`roundDownToGrid` in `src/lib/utils.ts:90`.

**Interfaces produced:**

```kotlin
package uz.etalon.crm.core.calc

data class SlabRow(
    val id: String,
    val name: String,
    val innerWidth: Double = 0.0,
    val innerLength: Double = 0.0,
    val bearing: Double = Calc.DEFAULT_BEARING,
    val correction: Double = 0.0,
    val extraBeams: Int = 0,
    val forceStartBeam: Boolean = false,
    /** null == the web's "AUTO": let the engine auto-pick. */
    val patternOverride: Pattern? = null,
    val m2PriceOverride: Boolean = false,
    val m2PriceOverrideValue: Double? = null,
    val m2PriceReason: String? = null,
    val result: SlabResult? = null,
) {
    /** False for an extras-only room: the engine computes it, but `innerLength` is `.positive()`
     *  in SaveProjectDraftSchema and PlaceOrderSchema, so the server would reject it. The screen
     *  blocks the save and names the room rather than dropping it. */
    val canPersist: Boolean get() = result != null && innerLength > 0
}

val M2_OVERRIDE_TIERS: List<PriceTier> = DEFAULT_PRICE_CONFIG.m2PriceTiers

fun recomputeRow(row: SlabRow, priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG): SlabRow
fun autoPickedRate(row: SlabRow): Double

data class ProjectTotals(
    val projTotal: ProjectTotal,
    val beams: Int, val blocks: Int,
    val monolithLength: Double, val monolithArea: Double, val concrete: Double,
)
fun projectTotals(rows: List<SlabRow>, discountPercent: Double, discountAmount: Double): ProjectTotals

data class BeamScheduleLine(val lengthKey: String, val beams: Int)
fun beamSchedule(rows: List<SlabRow>): List<BeamScheduleLine>
fun beamLengthKey(beamLength: Double): String

fun roundUpToGrid(value: Double, grid: Double): Double
fun roundDownToGrid(value: Double, grid: Double): Double
```

- [ ] **Step 1: Write the failing tests for `recomputeRow` and the override.**

```kotlin
class SlabRowTest {
    private fun row(w: Double, l: Double, extras: Int = 0, bearing: Double = 0.15) =
        SlabRow(id = "r", name = "Хона 1", innerWidth = w, innerLength = l, extraBeams = extras, bearing = bearing)

    @Test fun `a row with no dimensions yet has no result`() {
        assertNull(recomputeRow(row(0.0, 0.0)).result)
        assertNull(recomputeRow(row(4.0, 0.0)).result)            // length 0 and no extras
        assertNull(recomputeRow(row(0.0, 6.0)).result)            // width 0
        assertNull(recomputeRow(row(4.0, 6.0, bearing = -0.1)).result)
    }
    @Test fun `extras-only is computable but not persistable`() {
        val r = recomputeRow(row(4.2, 0.0, extras = 3))
        assertNotNull(r.result); assertTrue(r.result!!.isExtrasOnly); assertFalse(r.canPersist)
    }
    @Test fun `a real room computes and persists`() {
        val r = recomputeRow(row(4.0, 6.0))
        assertNotNull(r.result); assertTrue(r.canPersist)
    }
    @Test fun `an engine rejection leaves result null instead of throwing`() {
        assertNull(recomputeRow(row(Double.NaN, 6.0)).result)
    }
}

class RateOverrideTest {
    private val base = recomputeRow(SlabRow("r", "Хона 1", innerWidth = 4.0, innerLength = 6.0))

    @Test fun `an override replaces m2_price and recomputes m2_cost and subtotal only`() {
        val auto = base.result!!
        val over = recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Такрорий мижоз"))
        val r = over.result!!
        assertEquals(230_000.0, r.m2Price)
        assertEquals(round2(r.billedArea * 230_000.0), r.m2Cost)
        assertEquals(round2(r.m2Cost + r.patternExtraCost + r.manualExtraBeamsCost), r.subtotal)
        // Everything the override must NOT touch.
        assertEquals(auto.billedArea, r.billedArea); assertEquals(auto.beamCount, r.beamCount)
        assertEquals(auto.patternExtraCost, r.patternExtraCost); assertEquals(auto.manualExtraBeamsCost, r.manualExtraBeamsCost)
    }
    @Test fun `a value that is not a catalogue tier is ignored, as on the web`() {
        val r = recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 155_000.0)).result!!
        assertEquals(base.result!!.m2Price, r.m2Price)
    }
    @Test fun `autoPickedRate recovers the tier rate even while overridden`() {
        val auto = base.result!!.m2Price
        assertEquals(auto, autoPickedRate(recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0))))
        assertEquals(0.0, autoPickedRate(SlabRow("x", "Хона 2")))
    }
}
```

- [ ] **Step 2: Run, watch them fail** on unresolved `SlabRow`.

- [ ] **Step 3: Port `SlabRow.kt` line for line.**

```kotlin
/**
 * Run the engine for a single row. Returns the row with a fresh [SlabRow.result], or
 * `result = null` when the inputs are not valid yet — line-for-line from `recomputeRow` in
 * MultiRoomCalculator.tsx:241. An engine rejection is a not-yet-valid row, not a crash: the
 * operator is mid-typing, and a CalculationError here is expected traffic.
 */
fun recomputeRow(row: SlabRow, priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG): SlabRow {
    val hasSlab = row.innerLength > 0
    val hasExtrasOnly = row.innerLength == 0.0 && row.extraBeams >= 1
    if (!(row.innerWidth > 0 && row.bearing >= 0 && (hasSlab || hasExtrasOnly))) return row.copy(result = null)
    return try {
        val result = calculateSlab(
            SlabInput(
                innerWidth = row.innerWidth, innerLength = row.innerLength, bearing = row.bearing,
                pattern = row.patternOverride, correction = row.correction,
                extraBeams = row.extraBeams, forceStartBeam = row.forceStartBeam,
            ),
            priceConfig,
        )
        row.copy(result = applyRateOverride(result, row))
    } catch (e: CalculationError) {
        row.copy(result = null)
    }
}

/**
 * Replace the engine's auto-picked `m2Price` and recompute only the two figures that depend on
 * it. Defence in depth exactly as the TS has it: apply only when the value is a real catalogue
 * tier, because a restored draft could carry a corrupt one and the server's Zod would refuse it.
 */
internal fun applyRateOverride(result: SlabResult, row: SlabRow): SlabResult {
    if (!row.m2PriceOverride || row.m2PriceOverrideValue == null) return result
    if (M2_OVERRIDE_TIERS.none { it.price == row.m2PriceOverrideValue }) return result
    val newPrice = row.m2PriceOverrideValue
    val newCost = round2(result.billedArea * newPrice)
    return result.copy(
        m2Price = newPrice,
        m2Cost = newCost,
        subtotal = round2(newCost + result.patternExtraCost + result.manualExtraBeamsCost),
    )
}

/** The auto-picked rate for a row whatever its override state — the "Авто" label and the
 *  override sheet's comparison both read it. 0.0 when the row has not computed yet. */
fun autoPickedRate(row: SlabRow): Double {
    val r = row.result ?: return 0.0
    if (!row.m2PriceOverride) return r.m2Price
    return tierPrice(r.beamLength, M2_OVERRIDE_TIERS)
}
```

`round2` is `internal` to `:core:calc`, so this file (same module) may call it; the tests live in the same module and may too.

- [ ] **Step 4: Write the failing totals and schedule tests.** The `beamLengthKey` cases are the point of this step — `String.format("%.2f", …)` on a `Double` does **not** agree with JS `toFixed(2)`:

```kotlin
class BeamScheduleTest {
    @Test fun `beamLengthKey matches JS toFixed(2), which String_format does not`() {
        assertEquals("2.67", beamLengthKey(2.675))   // String.format would give "2.68"
        assertEquals("5.00", beamLengthKey(5.005))   // String.format would give "5.01"
        assertEquals("4.61", beamLengthKey(4.605))
        assertEquals("4.30", beamLengthKey(4.3))
        assertEquals("8.30", beamLengthKey(8.3))
    }
    @Test fun `the schedule groups by two-decimal length, descending, summing beam counts`() {
        val rows = listOf(4.0, 4.0, 6.0).mapIndexed { i, w ->
            recomputeRow(SlabRow(id = "r$i", name = "Хона", innerWidth = w, innerLength = 6.0))
        }
        val s = beamSchedule(rows)
        assertEquals(s.map { it.lengthKey }, s.map { it.lengthKey }.sortedByDescending { it.toDouble() })
        assertEquals(rows.sumOf { it.result!!.beamCount }, s.sumOf { it.beams })
    }
    @Test fun `rows with no result contribute nothing`() = assertEquals(emptyList(), beamSchedule(listOf(SlabRow("a", "Хона"))))
}

class TotalsTest {
    @Test fun `an empty list totals to zero everywhere`() {
        val t = projectTotals(emptyList(), 0.0, 0.0)
        assertEquals(0.0, t.projTotal.total); assertEquals(0, t.beams); assertEquals(0.0, t.monolithArea)
    }
    @Test fun `only computed rows count, and the discount goes through projectTotal`() {
        val a = recomputeRow(SlabRow("a", "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        val t = projectTotals(listOf(a, SlabRow("b", "Хона 2")), 10.0, 0.0)
        assertEquals(projectTotal(listOf(a.result!!), 10.0, 0.0), t.projTotal)
        assertEquals(a.result!!.beamCount, t.beams)
    }
    @Test fun `an explicit discount amount wins over the percent, as the engine resolves it`() {
        val a = recomputeRow(SlabRow("a", "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        assertEquals(50_000.0, projectTotals(listOf(a), 10.0, 50_000.0).projTotal.discountAmount)
    }
}

class GridTest {
    @Test fun `the grid helpers mirror src-lib-utils`() {
        assertEquals(4.1, roundUpToGrid(4.0, 0.1)); assertEquals(4.05, roundUpToGrid(4.0, 0.05))
        assertEquals(3.9, roundDownToGrid(4.0, 0.1)); assertEquals(4.2, roundUpToGrid(4.13, 0.1))
        assertEquals(4.0, roundUpToGrid(4.0, 0.0), "a non-positive grid is a no-op")
        assertEquals(Double.NaN, roundUpToGrid(Double.NaN, 0.1))
    }
}
```

- [ ] **Step 5: Run, watch them fail. Then write `Totals.kt` and `Grid.kt`.**

```kotlin
fun projectTotals(rows: List<SlabRow>, discountPercent: Double, discountAmount: Double): ProjectTotals {
    val valid = rows.mapNotNull { it.result }
    return ProjectTotals(
        projTotal = projectTotal(valid, discountPercent, discountAmount),
        beams = valid.sumOf { it.beamCount },
        blocks = valid.sumOf { it.totalBlocks },
        monolithLength = valid.fold(0.0) { s, r -> s + r.monolithLength },
        monolithArea = valid.fold(0.0) { s, r -> s + r.monolithArea },
        concrete = valid.fold(0.0) { s, r -> s + r.concreteVolume },
    )
}

/**
 * JS `Number.prototype.toFixed(2)`: round half **up** on the EXACT binary value of the double,
 * not on its shortest decimal representation. `BigDecimal(Double)` — the constructor everything
 * else in this repo bans — is the only thing that gives the exact value, and this is the one
 * place that wants it: `String.format("%.2f", 2.675)` gives "2.68" while JS gives "2.67", which
 * would split one production beam length into two rows the factory then cuts twice.
 */
fun beamLengthKey(beamLength: Double): String =
    java.math.BigDecimal(beamLength).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()

fun beamSchedule(rows: List<SlabRow>): List<BeamScheduleLine> {
    val acc = LinkedHashMap<String, Int>()
    rows.forEach { row -> row.result?.let { acc.merge(beamLengthKey(it.beamLength), it.beamCount, Int::plus) } }
    return acc.entries.map { BeamScheduleLine(it.key, it.value) }.sortedByDescending { it.lengthKey.toDouble() }
}

private const val GRID_EPS = 1e-9

fun roundUpToGrid(value: Double, grid: Double): Double {
    if (!value.isFinite() || !grid.isFinite() || grid <= 0) return value
    return roundN(kotlin.math.ceil((value + GRID_EPS) / grid) * grid, 3)
}

fun roundDownToGrid(value: Double, grid: Double): Double {
    if (!value.isFinite() || !grid.isFinite() || grid <= 0) return value
    return roundN(kotlin.math.floor((value - GRID_EPS) / grid) * grid, 3)
}
```

`roundN` requires a finite argument, and both guards return early on a non-finite `value`, so it is never reached with one.

- [ ] **Step 6:** `.\gradlew.bat :core:calc:testDebugUnitTest --no-daemon` green. Commit — `Feat(android) · the calculator row layer above the engine`.

---

## Task 3: `:feature:calculator` module and the ViewModel — rooms, live recompute, totals

**Files:** create `android/feature/calculator/build.gradle.kts`, `src/main/res/values/strings.xml`, `CalculatorUiState.kt`, `CalculatorViewModel.kt`; test `CalculatorViewModelTest.kt`; modify `android/settings.gradle.kts`.

**Interfaces consumed:** `:core:calc` (Task 2 — `SlabRow`, `recomputeRow`, `projectTotals`, `beamSchedule`, `roundUpToGrid`, `Pricing.toPriceConfig()`, `SlabResult.money()`, `ProjectTotal.money()`), `:core:data` `SessionRepository`, `PermissionGate`.
**Interfaces produced:**

```kotlin
package uz.etalon.crm.feature.calculator

enum class Grid(val step: Double) { CM10(0.1), CM5(0.05) }
enum class DiscountMode { PERCENT, AMOUNT }
/** Which numeric field the docked keypad is pointed at. */
data class KeypadTarget(val rowId: String, val field: Field) { enum class Field { WIDTH, LENGTH } }

data class CalculatorUiState(
    val rows: List<SlabRow> = emptyList(),
    val expandedRowId: String? = null,
    val keypad: KeypadTarget? = null,
    val keypadText: String = "",
    val discountMode: DiscountMode = DiscountMode.PERCENT,
    val discountPercent: Double = 0.0,
    val discountAmount: Double = 0.0,
    val deliveryCost: Double = 0.0,
    val otherCost: Double = 0.0,
    val grid: Grid = Grid.CM10,
    val totals: ProjectTotals = projectTotals(emptyList(), 0.0, 0.0),
    val schedule: List<BeamScheduleLine> = emptyList(),
    val canWrite: Boolean = false,          // order.create
    val error: String? = null,
) {
    val totalWeightKg: Double get() = totals.monolithArea * KG_PER_M2
    val unpersistableRoomNames: List<String> get() = rows.filter { it.result != null && !it.canPersist }.map { it.name }
}

const val KG_PER_M2 = 180.0

@HiltViewModel
class CalculatorViewModel @Inject constructor(...) : ViewModel() {
    val state: StateFlow<CalculatorUiState>
    fun addRoom(); fun duplicateRoom(id: String); fun deleteRoom(id: String)
    fun moveRoom(from: Int, to: Int)
    fun setName(id: String, name: String)
    fun openKeypad(target: KeypadTarget); fun keypadDigit(c: Char); fun keypadBackspace()
    fun commitKeypad(); fun nextField(); fun closeKeypad()
    fun bumpWidth(id: String, up: Boolean)
    fun setDiscountMode(m: DiscountMode); fun setDiscountPercent(v: Double); fun setDiscountAmount(v: Double)
    fun setDeliveryCost(v: Double); fun setOtherCost(v: Double); fun setGrid(g: Grid)
    fun toggleExpanded(id: String)
    fun clearAll()
}
```

- [ ] **Step 1: Scaffold the module.** `android/feature/calculator/build.gradle.kts`, mirroring `feature/home`:

```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.calculator" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    api(project(":core:calc"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.compose.material.icons)
    testImplementation(project(":core:network"))
    testImplementation(project(":core:testing"))
}
```

Add `":feature:calculator"` to the `include(":feature:auth", …)` line in `android/settings.gradle.kts`, and `implementation(project(":feature:calculator"))` to `android/app/build.gradle.kts`.

- [ ] **Step 2: Create `src/main/res/values/strings.xml`** with the `calc_` prefix on every name. Start with what this task needs; later tasks append.

```xml
<resources>
    <string name="calc_title">Калькулятор</string>
    <string name="calc_room_default_name">Хона %1$d</string>
    <string name="calc_add_room">Хона қўшиш</string>
    <string name="calc_field_width">Эни</string>
    <string name="calc_field_length">Бўйи</string>
    <string name="calc_empty">Ҳали хона қўшилмаган.</string>
    <string name="calc_action_next">Кейинги</string>
    <string name="calc_action_duplicate">Нусха олиш</string>
    <string name="calc_action_delete">Ўчириш</string>
    <string name="calc_action_clear">Тозалаш</string>
    <string name="calc_result_strip">%1$s · %2$s · %3$s</string>
    <string name="calc_blocks">%1$s ғишт</string>
    <string name="calc_beams">%1$s балка</string>
    <string name="calc_room_not_persistable">Бу хона фақат қўшимча балкадан иборат — сақлаб бўлмайди</string>
    <string name="calc_no_write_permission">Буюртма яратишга рухсат йўқ</string>
</resources>
```

- [ ] **Step 3: Write the failing ViewModel tests.**

```kotlin
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.LENGTH
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.WIDTH

class CalculatorViewModelTest {
    /** The bootstrap `Pricing` built from the same strings the server sends ("4.30", "140000"),
     *  so `toPriceConfig()` reproduces DEFAULT_PRICE_CONFIG — the equality Phase 2a's
     *  `BoundaryTest` already pins. */
    private fun vm(canWrite: Boolean = true) = CalculatorViewModel(
        session = FakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { it == "order.create" && canWrite },
    )

    @Test fun `rooms are auto-named Хона N and numbering does not reuse a deleted name`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        assertEquals(listOf("Хона 1", "Хона 2"), v.state.value.rows.map { it.name })
        v.deleteRoom(v.state.value.rows[0].id); v.addRoom()
        assertEquals(listOf("Хона 2", "Хона 3"), v.state.value.rows.map { it.name })
    }
    @Test fun `every keystroke recomputes the row and the totals`() = runTest {
        val v = vm(); v.addRoom()
        val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        assertEquals(0.0, v.state.value.totals.projTotal.total, "width alone is not a room yet")
        v.openKeypad(KeypadTarget(id, LENGTH)); "6".forEach(v::keypadDigit); v.commitKeypad()
        assertTrue(v.state.value.totals.projTotal.total > 0.0)
        assertEquals(v.state.value.rows[0].result!!.subtotal, v.state.value.totals.projTotal.roomsSubtotal)
    }
    @Test fun `the keypad reads a decimal comma`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4,25".forEach(v::keypadDigit); v.commitKeypad()
        assertEquals(4.25, v.state.value.rows[0].innerWidth)
    }
    @Test fun `Кейинги walks width to length to the next room's width and stops at the end`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.openKeypad(KeypadTarget(a, WIDTH)); v.nextField()
        assertEquals(KeypadTarget(a, LENGTH), v.state.value.keypad)
        v.nextField(); assertEquals(KeypadTarget(b, WIDTH), v.state.value.keypad)
        v.nextField(); v.nextField(); assertNull(v.state.value.keypad, "past the last field the keypad closes")
    }
    @Test fun `duplicate copies every input and gives the copy its own id and name`() = runTest {
        val v = vm(); v.addRoom(); val src = v.state.value.rows[0]
        v.duplicateRoom(src.id)
        val copy = v.state.value.rows[1]
        assertNotEquals(src.id, copy.id); assertEquals("Хона 2", copy.name)
        assertEquals(src.innerWidth, copy.innerWidth); assertEquals(src.bearing, copy.bearing)
    }
    @Test fun `moveRoom reorders without recomputing anything`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom(); v.addRoom()
        val before = v.state.value.rows.map { it.id }
        v.moveRoom(0, 2)
        assertEquals(listOf(before[1], before[2], before[0]), v.state.value.rows.map { it.id })
    }
    @Test fun `the width bump uses the chosen grid`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.bumpWidth(id, up = true); assertEquals(4.1, v.state.value.rows[0].innerWidth)
        v.setGrid(Grid.CM5); v.bumpWidth(id, up = false); assertEquals(4.05, v.state.value.rows[0].innerWidth)
    }
    @Test fun `an extras-only room is named as unpersistable rather than dropped`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.setExtraBeams(id, 2)
        assertEquals(listOf("Хона 1"), v.state.value.unpersistableRoomNames)
        assertTrue(v.state.value.totals.projTotal.total > 0.0, "it still counts in the quote")
    }
    @Test fun `an operator without order_create can still quote`() = runTest {
        val v = vm(canWrite = false); v.addRoom()
        assertFalse(v.state.value.canWrite); assertEquals(1, v.state.value.rows.size)
    }
}
```

- [ ] **Step 4: Run, watch them fail. Then write `CalculatorViewModel`.** Shape notes an implementer must not deviate from:
  - One `MutableStateFlow<CalculatorUiState>`; every mutator ends in a single private `recompute()` that maps the changed rows through `recomputeRow(row, priceConfig)` and rewrites `totals` and `schedule`. Recompute the **changed row only**, then re-aggregate — the engine is pure and cheap, but rerunning 30 rooms per keystroke is still waste.
  - `priceConfig` comes from the bootstrap `Pricing` through `toPriceConfig()`, collected once in `init`; until it arrives use `DEFAULT_PRICE_CONFIG`, and recompute every row when it lands.
  - Room naming: a `nextRoomSeq` counter that only ever increases, so deleting «Хона 1» does not make the next room «Хона 1» again and confuse two rooms in the customer's photo of the screen.
  - `keypadText` holds the raw comma string; `commitKeypad()` parses with `text.replace(',', '.').toDoubleOrNull() ?: 0.0` and writes the field. `nextField()` commits first, then moves.
  - `canWrite` is resolved once from `PermissionGate.can("order.create")`.
  - Money never appears in this class as a `Double` beyond the engine's own values; anything the UI shows as money goes through `ProjectTotal.money()` / `SlabResult.money()` at the render site.

- [ ] **Step 5:** `.\gradlew.bat :feature:calculator:testDebugUnitTest --no-daemon` green, then the whole project builds. Commit — `Feat(android) · the calculator ViewModel — rooms, live recompute, totals`.

---

## Task 4: the screen — room cards, the docked keypad, and the real CALCULATOR destination

**Files:** create `CalculatorRoute.kt`, `CalculatorScreen.kt`, `RoomCard.kt`; modify `core/designsystem/components/NumericKeypadSheet.kt`, `core/designsystem/res/values/strings.xml`, `core/ui/format/Formatters.kt`, `app/.../nav/Keys.kt`, `app/.../nav/StartKey.kt`, `app/.../nav/EtalonNavHost.kt`, `app/src/test/.../DestinationsTest.kt`; test `KeypadInputTest.kt` (existing, extended), `FormattersTest.kt` (existing, extended).

**Interfaces consumed:** Task 3's `CalculatorViewModel`.
**Interfaces produced:**

```kotlin
// :core:designsystem — the keypad grid, extracted so it can be docked instead of modal.
@Composable fun NumericKeypad(
    value: String,
    suffix: String? = null,
    allowDecimal: Boolean = true,
    confirmLabel: String,
    onValue: (String) -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
)
// :core:ui
fun formatMeters(v: Double, decimals: Int = 2): String   // "4,25 м"
fun formatWeightKg(kg: Double): String                   // "12 240 кг"
// :app
@Serializable data object Calculator : Key
// :feature:calculator
@Composable fun CalculatorRoute(onOpenOrder: (String) -> Unit)
```

**Why the keypad is docked, not modal.** `NumericKeypadSheet` is a `ModalBottomSheet`; its scrim blocks the list behind it, so a Кейинги walk could not keep the active room visible. The keypad **grid** is extracted unchanged and hosted in the calculator's `Scaffold` bottom slot, above the totals sheet's peek. `NumericKeypadSheet` keeps its current signature and becomes a thin wrapper around `NumericKeypad`, so every existing caller (payments, logistics) is untouched.

- [ ] **Step 1: Extract `NumericKeypad`.** Move the value row and the four button rows out of `NumericKeypadSheet` into a new stateless `NumericKeypad` in the same file, and rewrite the sheet as:

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NumericKeypadSheet(
    title: String, initial: String, suffix: String? = null, allowDecimal: Boolean = false,
    onConfirm: (String) -> Unit, onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionLabel(title)
            NumericKeypad(
                value = value, suffix = suffix, allowDecimal = allowDecimal,
                confirmLabel = stringResource(R.string.action_confirm),
                onValue = { value = it }, onConfirm = { onConfirm(value.ifEmpty { "0" }) },
            )
        }
    }
}
```

`NumericKeypad` itself keeps `applyDigit`/`applyBackspace` as the only entry rules and calls `onValue(applyDigit(value, ch, allowDecimal))`. It is **stateless** — the caller owns the string — which is what lets the calculator's ViewModel drive it across fields. Extend `KeypadInputTest` with a case proving `applyDigit("", ',', allowDecimal = true) == "0,"` and that a second comma is refused.

- [ ] **Step 2: Add the two formatters** to `core/ui/format/Formatters.kt`, beside `formatArea`:

```kotlin
/** A length in metres for a room card or a beam schedule row. */
fun formatMeters(v: Double, decimals: Int = 2): String =
    formatDecimal(BigDecimal.valueOf(v), decimals) + " м"

/** Total product weight. The factory's rule of thumb for finished beam-and-block flooring is
 *  180 kg per m² of slab; the calculator shows it so an operator can size the truck at a glance.
 *  Whole kilograms — a tenth of a kilo on a twelve-tonne load is noise. */
fun formatWeightKg(kg: Double): String = formatDecimal(BigDecimal.valueOf(kg), 0) + " кг"
```

Add a `FormattersTest` case: `formatWeightKg(12240.0)` is `"12 240 кг"` with a **non-breaking** space, and `formatMeters(4.25)` is `"4,25 м"`.

- [ ] **Step 3: Write `RoomCard.kt`** — the collapsed card. Structure, in order: a drag handle (`Icons.Default.DragHandle`, 48 dp target) · the room name (an `OutlinedTextField`, single line) · two large tappable dimension fields showing `formatMeters(row.innerWidth)` under `calc_field_width` / `calc_field_length`, each opening the keypad on that field and highlighted when it is the keypad's target · the result strip `«24,75 м² · 12 балка · 96 ғишт»` built from `calc_result_strip` with `formatArea(BigDecimal.valueOf(r.monolithArea))`, `calc_beams` and `calc_blocks` · the pattern chip (`StatusChip`-shaped, reading «Г-Б» / «Б-Г-Б» / «Г-Б-Г», with an «Авто» marker when `patternOverride == null`) · the room subtotal via `MoneyText(row.result!!.money().subtotal)` · a «Қўшимча» expander row · an overflow `IconButton` opening a `DropdownMenu` with `calc_action_duplicate` and `calc_action_delete` · and, when `!row.canPersist && row.result != null`, an inline `NoticeBanner(stringResource(R.string.calc_room_not_persistable))`. A row with `result == null` shows «—» in place of the strip and the subtotal.

- [ ] **Step 4: Write `CalculatorScreen.kt`.** A `Scaffold` whose content is a `LazyColumn` of `RoomCard`s keyed by `row.id`, a `FloatingActionButton` calling `addRoom()`, and a `bottomBar` that hosts the docked keypad when `state.keypad != null`:

```kotlin
if (s.keypad != null) {
    Column(Modifier.background(MaterialTheme.colorScheme.surface).navigationBarsPadding().padding(16.dp)) {
        NumericKeypad(
            value = s.keypadText, suffix = "м", allowDecimal = true,
            confirmLabel = stringResource(R.string.calc_action_next),
            onValue = vm::setKeypadText, onConfirm = vm::nextField,
        )
    }
}
```

Keep the active room visible: `LaunchedEffect(s.keypad?.rowId) { s.keypad?.rowId?.let { id -> s.rows.indexOfFirst { it.id == id }.takeIf { i -> i >= 0 }?.let { listState.animateScrollToItem(it) } } }`.

Drag-to-reorder without a new dependency: a `Modifier.pointerInput(Unit) { detectDragGesturesAfterLongPress(...) }` on the handle that accumulates the drag offset, finds the hovered index from `listState.layoutInfo.visibleItemsInfo`, and calls `vm.moveRoom(from, to)` when the index changes. The index arithmetic itself is `moveRoom` in the ViewModel and is already unit-tested — the gesture only supplies two integers.

- [ ] **Step 5: Write `CalculatorRoute.kt`** — `hiltViewModel()`, `collectAsStateWithLifecycle()`, and pass callbacks through. Keep it as thin as `HomeRoute`.

- [ ] **Step 6: Replace the placeholder destination.** In `nav/Keys.kt` add `@Serializable data object Calculator : Key` under a `// ── Calculator` heading; in `nav/StartKey.kt` add `Destination.CALCULATOR -> Calculator` to `Destination.key()` and `is Calculator -> PERM_CALCULATOR_USE` to `gatingPermission`, with `internal const val PERM_CALCULATOR_USE = "calculator.use"`; in `nav/EtalonNavHost.kt` register

```kotlin
if (me.can(PERM_CALCULATOR_USE)) {
    entry<Calculator> { CalculatorRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
}
```

Update `DestinationsTest`: the owner's bar is now `HOME, ORDERS, CALCULATOR, PAYMENTS, MORE` (CALCULATOR has a screen, so `hasScreen()` is true and it takes its priority slot), `key()` for CALCULATOR is `Calculator` and no longer a `ComingSoon`, and `gatingPermission(Calculator) == "calculator.use"`. Fix the existing assertions rather than weakening them.

- [ ] **Step 7:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green. **Deliverable a reviewer can reject on its own:** open the app as an operator with `calculator.use`, tap «Ҳисоб», add three rooms, type dimensions with the keypad walking field to field, and read a live subtotal per room. Commit — `Feat(android) · the calculator screen with rooms, live results and a docked keypad`.

---

## Task 5: «Қўшимча» — the editable inputs, the read-only working-out, and the rate override

**Files:** create `RoomExtras.kt`, `RateOverrideSheet.kt`; modify `RoomCard.kt`, `CalculatorViewModel.kt`, `feature/calculator/res/values/strings.xml`; test `RoomExtrasStateTest.kt`, `RateOverrideSheetTest.kt`.

**Interfaces consumed:** `SlabRow`, `M2_OVERRIDE_TIERS`, `autoPickedRate`, `Pattern` (Task 2); `CountStepper`, `NumericKeypadSheet`, `SectionLabel` (`:core:designsystem`).
**Interfaces produced:**

```kotlin
// CalculatorViewModel gains:
fun setBearing(id: String, v: Double)
fun setCorrection(id: String, v: Double)
fun setExtraBeams(id: String, n: Int)
fun setForceStartBeam(id: String, on: Boolean)
fun setPattern(id: String, p: Pattern?)                       // null == Авто
fun applyRateOverride(id: String, price: Double, reason: String)
fun clearRateOverride(id: String)
// :feature:calculator
@Composable fun RoomExtras(row: SlabRow, vm: CalculatorViewModel)
@Composable fun RateOverrideSheet(row: SlabRow, onDismiss: () -> Unit, onApply: (Double, String) -> Unit, onClear: () -> Unit)
```

The card expands into **two visually separated groups**, and the separation is the point of the design: the top group is what the operator may change, the bottom group is the engine showing its working. Never mix them.

- [ ] **Step 1: Add the strings** (append to `feature/calculator/res/values/strings.xml`):

```xml
    <string name="calc_extras">Қўшимча</string>
    <string name="calc_field_bearing">Таяниш</string>
    <string name="calc_field_correction">Корр.</string>
    <string name="calc_field_extra_beams">+Б</string>
    <string name="calc_field_start_beam">Бош Б.</string>
    <string name="calc_field_pattern">Шаблон</string>
    <string name="calc_pattern_auto">Авто</string>
    <string name="calc_pattern_gb">Г-Б</string>
    <string name="calc_pattern_bgb">Б-Г-Б</string>
    <string name="calc_pattern_gbg">Г-Б-Г</string>
    <string name="calc_working_out">Ҳисоб-китоб</string>
    <string name="calc_out_monolith_length">Монолит узунлиги</string>
    <string name="calc_out_beam_length">Балка узунлиги</string>
    <string name="calc_out_pitches">Қадам</string>
    <string name="calc_out_block_rows">Қатор</string>
    <string name="calc_out_blocks_per_row">Гишт/Қатор</string>
    <string name="calc_rate">м² нархи</string>
    <string name="calc_rate_auto">Авто: %1$s</string>
    <string name="calc_rate_override_title">м² нархини ўзгартириш</string>
    <string name="calc_rate_reason">Сабаби</string>
    <string name="calc_rate_reason_required">Сабабини ёзинг</string>
    <string name="calc_rate_apply">Қўллаш</string>
    <string name="calc_rate_clear">Авто нархга қайтариш</string>
```

- [ ] **Step 2: Write the failing tests.**

```kotlin
class RoomExtrasStateTest {
    @Test fun `changing bearing or correction recomputes the row immediately`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        val before = v.state.value.rows[0].result!!.beamLength
        v.setBearing(id, 0.20)
        assertNotEquals(before, v.state.value.rows[0].result!!.beamLength)
    }
    @Test fun `a pattern override takes precedence and Авто gives it back`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.setPattern(id, Pattern.GBG)
        assertEquals(Pattern.GBG, v.state.value.rows[0].result!!.pattern)
        v.setPattern(id, null)
        assertEquals(v.state.value.rows[0].result!!.patternAuto, v.state.value.rows[0].result!!.pattern)
    }
    @Test fun `applying an override stores the reason and clearing wipes both`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.applyRateOverride(id, 230_000.0, "Йирик буюртма")
        val r = v.state.value.rows[0]
        assertTrue(r.m2PriceOverride); assertEquals(230_000.0, r.m2PriceOverrideValue)
        assertEquals("Йирик буюртма", r.m2PriceReason); assertEquals(230_000.0, r.result!!.m2Price)
        v.clearRateOverride(id)
        val c = v.state.value.rows[0]
        // The wire refuses a value or reason while m2PriceOverride is false (validation.ts:206).
        assertFalse(c.m2PriceOverride); assertNull(c.m2PriceOverrideValue); assertNull(c.m2PriceReason)
    }
    @Test fun `a blank reason is refused — the override is never applied without one`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.applyRateOverride(id, 230_000.0, "   ")
        assertFalse(v.state.value.rows[0].m2PriceOverride)
    }
    @Test fun `the override picker offers exactly the five static catalogue tiers`() {
        assertEquals(listOf(140_000.0, 160_000.0, 180_000.0, 200_000.0, 230_000.0), M2_OVERRIDE_TIERS.map { it.price })
    }
}
```

- [ ] **Step 3: Run, watch them fail. Implement the ViewModel mutators.** Each is `updateRow(id) { it.copy(field = value) }` followed by `recompute()`. `applyRateOverride` is the only one with a rule:

```kotlin
/**
 * The reason is MANDATORY here, unlike the web's optional note. A rate that differs from the
 * tier table is the one number on a quote nobody can reconstruct later, and the phone is where
 * it gets changed standing in front of the customer. Blank means the override does not happen.
 */
fun applyRateOverride(id: String, price: Double, reason: String) {
    val note = reason.trim().take(MAX_REASON)          // 200 — RoomCalcInputBaseSchema
    if (note.isEmpty()) return
    if (M2_OVERRIDE_TIERS.none { it.price == price }) return
    updateRow(id) { it.copy(m2PriceOverride = true, m2PriceOverrideValue = price, m2PriceReason = note) }
}

fun clearRateOverride(id: String) =
    updateRow(id) { it.copy(m2PriceOverride = false, m2PriceOverrideValue = null, m2PriceReason = null) }
```

- [ ] **Step 4: Write `RoomExtras.kt`.** Group one, under `SectionLabel(stringResource(R.string.calc_extras))`: `bearing` and `correction` as tappable fields opening `NumericKeypadSheet` (modal is right here — they are rare, one-off edits, not a walk); `extraBeams` as a `CountStepper`; `forceStartBeam` as a `Switch` row; the pattern as four `FilterChip`s (`Авто`/`Г-Б`/`Б-Г-Б`/`Г-Б-Г`); and the rate row showing `MoneyText(row.result!!.money().m2Price)` with `calc_rate_auto` underneath when overridden, opening `RateOverrideSheet`. Group two, under `SectionLabel(stringResource(R.string.calc_working_out))` and visually recessed (`MaterialTheme.colorScheme.surfaceVariant`, no touch targets at all): `calc_out_monolith_length` → `formatMeters(r.monolithLength)`, `calc_out_beam_length` → `formatMeters(r.beamLength)`, `calc_out_pitches` → `formatCount(r.pitches)`, `calc_out_block_rows` → `formatCount(r.blockRows)`, `calc_out_blocks_per_row` → `formatCount(r.blocksPerRow)`.

- [ ] **Step 5: Write `RateOverrideSheet.kt`** — a `ModalBottomSheet` listing the five `M2_OVERRIDE_TIERS` prices as selectable rows (each `MoneyText`, the auto-picked one marked `calc_rate_auto`), an `OutlinedTextField` for the reason capped at 200 characters with a live counter, a `PrimaryButton(calc_rate_apply)` **disabled while the reason is blank**, and a `SecondaryButton(calc_rate_clear)` shown only when an override is already set.

- [ ] **Step 6:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green. Commit — `Feat(android) · the room's extra inputs, the engine's working-out, and the rate override`.

---

## Task 6: the totals sheet — persistent, draggable, with the beam schedule

**Files:** create `TotalsSheet.kt`; modify `CalculatorScreen.kt`, `CalculatorViewModel.kt`, `feature/calculator/res/values/strings.xml`; test `TotalsSheetStateTest.kt`.

**Interfaces consumed:** `ProjectTotals`, `BeamScheduleLine`, `roundUpToGrid` (Task 2); `ProjectTotal.money()` (`:core:calc` `Boundary.kt`); `formatWeightKg`, `formatArea`, `formatCount` (`:core:ui`).
**Interfaces produced:**

```kotlin
@Composable fun TotalsSheet(state: CalculatorUiState, vm: CalculatorViewModel, actions: @Composable () -> Unit)
// CalculatorViewModel gains:
fun roundAllWidthsUp()
```

- [ ] **Step 1: Add the strings.**

```xml
    <string name="calc_totals_title">Сўнгги нархи</string>
    <string name="calc_rooms_subtotal">Жами хоналар</string>
    <string name="calc_discount_percent">Чегирма %</string>
    <string name="calc_discount_amount">Чегирма (сўм)</string>
    <string name="calc_delivery_cost">Етказиб бериш</string>
    <string name="calc_other_cost">Бошқа харажат</string>
    <string name="calc_total_weight">Жами маҳсулот оғирлиги</string>
    <string name="calc_grid_label">Лабораторий ўлчам</string>
    <string name="calc_grid_10">10 см</string>
    <string name="calc_grid_5">5 см</string>
    <string name="calc_round_all_up">Барча хоналарни юқорилаштириш</string>
    <string name="calc_production_list">Балка + Ғишт</string>
    <string name="calc_schedule_row">Балка · %1$s м</string>
    <string name="calc_pieces">%1$s дона</string>
    <string name="calc_schedule_empty">Ҳозирча балка йўқ.</string>
    <string name="calc_total_blocks">Ғишт · жами</string>
```

- [ ] **Step 2: Write the failing state tests.**

```kotlin
class TotalsSheetStateTest {
    @Test fun `the two discount modes are mutually exclusive, as the engine resolves them`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        v.setDiscountMode(DiscountMode.PERCENT); v.setDiscountPercent(10.0)
        assertEquals(0.0, v.state.value.discountAmount)
        v.setDiscountMode(DiscountMode.AMOUNT); v.setDiscountAmount(50_000.0)
        assertEquals(0.0, v.state.value.discountPercent, "switching mode clears the other field")
        assertEquals(50_000.0, v.state.value.totals.projTotal.discountAmount)
    }
    @Test fun `the percent is clamped to 0..100`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0); v.setDiscountPercent(140.0)
        assertEquals(100.0, v.state.value.discountPercent)
    }
    @Test fun `weight is monolith area times 180`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        assertEquals(v.state.value.totals.monolithArea * 180.0, v.state.value.totalWeightKg)
    }
    @Test fun `round all up applies the grid to every row that has a width`() = runTest {
        val v = vm(); addRoom(v, 4.03, 6.0); v.addRoom()
        v.setGrid(Grid.CM10); v.roundAllWidthsUp()
        assertEquals(4.1, v.state.value.rows[0].innerWidth)
        assertEquals(0.0, v.state.value.rows[1].innerWidth, "a row with no width is left alone")
    }
}
```

- [ ] **Step 3: Run, watch them fail. Implement `setDiscountMode` / `setDiscountPercent` / `setDiscountAmount` / `roundAllWidthsUp`.** `setDiscountMode` zeroes the field the other mode owns; `setDiscountPercent` clamps with `coerceIn(0.0, 100.0)`; `setDiscountAmount` clamps with `coerceAtLeast(0.0)`; `roundAllWidthsUp` maps `rows` and, for each row with `innerWidth > 0`, `recomputeRow(it.copy(innerWidth = roundUpToGrid(it.innerWidth, grid.step)), priceConfig)`.

- [ ] **Step 4: Write `TotalsSheet.kt`** and host it as `BottomSheetScaffold`'s `sheetContent` in `CalculatorScreen`, with `sheetPeekHeight = 88.dp` and `rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded, skipHiddenState = true)` — persistent and draggable, never dismissible. **Collapsed (the peek):** one row — `MoneyText(state.totals.projTotal.money().total, style = EtalonType.monoTitle)` on the left and `formatArea(BigDecimal.valueOf(state.totals.monolithArea))` on the right. **Expanded:** `calc_rooms_subtotal` · the discount as a two-chip `PERCENT`/`AMOUNT` toggle with one keypad-backed field · `calc_delivery_cost` · `calc_other_cost` · `calc_total_weight` reading `«{area} м² × 180 = {formatWeightKg(state.totalWeightKg)}»` · the `calc_grid_label` segmented pair `calc_grid_10`/`calc_grid_5` with the `calc_round_all_up` ghost button beside it · the `calc_production_list` block rendering `state.schedule` as `calc_schedule_row` + `calc_pieces` rows (already sorted descending by the engine layer) with `calc_schedule_empty` when it is empty and a final `calc_total_blocks` row when `totals.blocks > 0` · and last the `actions` slot the next tasks fill.

> **The beam schedule is production data, not decoration.** The factory cuts beams by length; the grouping key is `beamLengthKey` from Task 2 and must stay two decimals, descending. Do not re-derive it in the UI.

- [ ] **Step 5:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green. Commit — `Feat(android) · the persistent totals sheet with the beam schedule`.

---

## Task 7: the client bar — phone-first lookup, region picker, collapse to one line

**Files:** create `ClientBar.kt`; move `feature/clients/.../edit/ClientAddress.kt` → `core/ui/src/main/kotlin/uz/etalon/crm/core/ui/regions/ClientAddress.kt`; create `core/designsystem/components/RegionPicker.kt`; modify `core/designsystem/res/values/strings.xml`, `feature/clients/.../edit/ClientEditScreen.kt`, `feature/clients/.../edit/Regions.kt`, `core/network/EtalonApi.kt`, `core/testing/FakeEtalonApi.kt`, `core/data/ClientsRepository.kt`, `CalculatorViewModel.kt`; test `ClientsRepositoryTest.kt` (existing, extended), `ClientBarStateTest.kt`.

**Interfaces consumed:** `ClientPage`, `ClientSummary`, `normalizePhone`, `formatPhone`, `formatAddressLine`.
**Interfaces produced:**

```kotlin
// :core:ui (moved verbatim, package changed to uz.etalon.crm.core.ui.regions)
data class ParsedAddress(val viloyat: String, val tuman: String, val street: String)
fun composeAddress(viloyat: String, tuman: String, street: String): String
fun parseAddress(address: String?): ParsedAddress
// :core:designsystem (extracted from ClientEditScreen)
@Composable fun RegionField(label: String, value: String, onOpen: () -> Unit)
@Composable fun RegionPickerSheet(title: String, options: List<Pair<String, String>>, onDismiss: () -> Unit, onPick: (String) -> Unit)
// :core:network
@GET("/api/clients") suspend fun clients(
    @Query("q") q: String? = null, @Query("phone") phone: String? = null,
    @Query("page") page: Int = 1, @Query("pageSize") pageSize: Int = CLIENTS_PAGE_SIZE,
): ClientsPageDto
// :core:data
suspend fun ClientsRepository.findByPhone(phone: String): Result<ClientSummary?>
// :feature:calculator
@Composable fun ClientBar(state: CalculatorUiState, vm: CalculatorViewModel)
```

- [ ] **Step 1: Move the address composer into `:core:ui`.** `git mv` `ClientAddress.kt` to `core/ui/src/main/kotlin/uz/etalon/crm/core/ui/regions/ClientAddress.kt`, change its package to `uz.etalon.crm.core.ui.regions`, delete the now-duplicated `findViloyatByName`/`findTumanByName`/`tumansOf` from it (`:core:ui`'s `Regions.kt:249-256` already has all three, `public`), and keep its long KDoc verbatim — it documents two deliberate divergences from the TypeScript. In `feature/clients/.../edit/Regions.kt`, extend the existing re-export shim so the module compiles unchanged:

```kotlin
internal typealias ParsedAddress = uz.etalon.crm.core.ui.regions.ParsedAddress
internal fun composeAddress(v: String, t: String, s: String) = uz.etalon.crm.core.ui.regions.composeAddress(v, t, s)
internal fun parseAddress(a: String?) = uz.etalon.crm.core.ui.regions.parseAddress(a)
internal fun findViloyatByName(n: String) = uz.etalon.crm.core.ui.regions.findViloyatByName(n)
internal fun findTumanByName(n: String) = uz.etalon.crm.core.ui.regions.findTumanByName(n)
internal fun tumansOf(v: String) = uz.etalon.crm.core.ui.regions.tumansOf(v)
```

Move the address tests that came with it into `:core:ui`'s test source set. `:feature:clients` already depends on `:core:ui`, so no build file changes.

- [ ] **Step 2: Extract the region picker into `:core:designsystem`.** Move `RegionField` and `RegionPickerSheet` out of `ClientEditScreen.kt` into `core/designsystem/components/RegionPicker.kt`, `public`, taking their labels as `String` parameters instead of `@StringRes Int` (a shared component must not name another module's resources). Add the four strings to the design-system `strings.xml` with the `ds_` prefix, and **delete** the four `client_region_*` strings from `feature/clients`:

```xml
    <string name="ds_region_unset">Танланмаган</string>
    <string name="ds_region_search">Қидириш</string>
    <string name="ds_region_clear">Тозалаш</string>
    <string name="ds_region_empty">Ҳеч нарса топилмади</string>
```

`ClientEditSheet` now calls `RegionField(stringResource(R.string.client_field_viloyat), s.viloyat) { … }`. `ClientEditViewModelTest` must stay green untouched — if it does not, the extraction changed behaviour and is wrong.

- [ ] **Step 3: Widen `EtalonApi.clients` with `phone`,** replacing the KDoc paragraph that says `?phone=` is deliberately absent:

```kotlin
     * `?phone=` IS used, by the calculator's client bar and only there: it is an exact-or-prefix
     * match on the normalised number (`src/app/api/clients/route.ts:88`), which is the dedup the
     * web calculator's ClientInfoBar does. `q` stays the list screen's search — it matches names
     * and trailing digits, which is the wrong shape for "is this exact number already a customer".
```

Add the `phone` override to `FakeEtalonApi` (`override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int): ClientsPageDto = unused("clients")`) and fix every existing override in the test suites — the compiler names them all.

- [ ] **Step 4: Add `findByPhone` to `ClientsRepository`, test-first.**

```kotlin
@Test fun `findByPhone normalises before asking and returns the exact match only`() = runTest {
    var asked: String? = null
    val api = object : FakeEtalonApi() {
        override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int): ClientsPageDto {
            asked = phone
            return ClientsPageDto(rows = listOf(row(phone = "998901112233")), total = 1, page = 1, pageSize = 50, pageCount = 1)
        }
    }
    val hit = repo(api).findByPhone("90 111 22 33").getOrThrow()
    assertEquals("998901112233", asked)
    assertEquals("998901112233", hit?.phone)
}
@Test fun `a prefix match that is not the same number is not a match`() = runTest {
    val api = object : FakeEtalonApi() {
        override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int) =
            ClientsPageDto(rows = listOf(row(phone = "998901112234")), total = 1, page = 1, pageSize = 50, pageCount = 1)
    }
    assertNull(repo(api).findByPhone("998901112233").getOrThrow())
}
```

```kotlin
/**
 * Phone is this product's unique customer identity, so this is an identity lookup, not a search.
 * The route matches on `startsWith` as well as `contains` (route.ts:88-95) — good enough for the
 * web's autocomplete, wrong for "fill this quote in with that customer", so the exact normalised
 * number is compared here before anything is returned. A near miss is not a customer.
 */
suspend fun findByPhone(phone: String): Result<ClientSummary?> = runCatchingCancellable {
    val norm = normalizePhone(phone)
    if (norm.length < 9) return@runCatchingCancellable null
    api.clients(phone = norm).toDomain().items.firstOrNull { normalizePhone(it.phone) == norm }
}
```

- [ ] **Step 5: Write `ClientBar.kt` and its ViewModel state.** `CalculatorUiState` gains `clientPhoneDigits: String`, `clientName: String`, `clientAddress: ParsedAddress`, `matchedClientId: String?`, `clientLookupError: String?`, `clientBarCollapsed: Boolean`. The bar is `stickyHeader` in the room `LazyColumn`. Expanded: a phone field with the `+998 ` prefix and nine local digits (copied field-for-field from `ClientEditSheet` so the two screens behave identically), a name field, `RegionField` × 2 backed by `VILOYATS`/`tumansOf`, and a street field. **On the ninth digit** the ViewModel debounces ~400 ms and calls `findByPhone`; a hit fills name and address from the stored client (`parseAddress`) and sets `matchedClientId`; a miss leaves the typed fields alone and clears `matchedClientId` — that is a new customer, not an error. A lookup failure sets `clientLookupError` and is shown as an `ErrorBanner` with a retry; it never blocks typing. Once a phone and a name are present the bar **collapses to one line**: `«{name} · {formatPhone(phone)} · {formatAddressLine(address)}»` with a pencil to reopen.

- [ ] **Step 6:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green — including `:feature:clients`, which must still pass with no test edits. Commit — `Feat(android) · the calculator's client bar with phone-first lookup`.

---

## Task 8: draft persistence and «Лойиҳани сақлаш» → `POST /api/projects`

**Files:** create `core/database/entity/CalculatorDraftEntity.kt`, `core/database/dao/CalculatorDraftDao.kt`, `core/model/Calculator.kt`, `core/network/dto/CalculatorDto.kt`, `core/data/CalculatorRepository.kt`; modify `core/database/EtalonDatabase.kt`, `core/database/Migrations.kt`, `core/network/EtalonApi.kt`, `core/testing/FakeEtalonApi.kt`, `CalculatorViewModel.kt`, `CalculatorScreen.kt`, `feature/calculator/res/values/strings.xml`; commit `core/database/src/main/assets/uz.etalon.crm.core.database.EtalonDatabase/6.json`; test `CalculatorDraftDaoTest.kt`, `EtalonDatabaseMigrationTest.kt` (extended), `CalculatorRepositoryTest.kt`, `CalculatorContractTest.kt`.

**Interfaces consumed:** Task 1's idempotent `POST /api/projects`; `SlabRow` (Task 2).
**Interfaces produced:**

```kotlin
// :core:network/dto/CalculatorDto.kt — mirrors RoomCalcInputBaseSchema field for field.
@Serializable data class RoomCalcInputDto(
    val name: String? = null,
    val innerWidth: Double, val innerLength: Double,
    val bearing: Double = 0.15, val correction: Double = 0.0,
    val extraBeams: Int = 0, val forceStartBeam: Boolean = false,
    val patternOverride: String? = null,
    val m2PriceOverride: Boolean = false,
    val m2PriceOverrideValue: Double? = null,
    val m2PriceReason: String? = null,
)
@Serializable data class SaveProjectDraftRequest(
    val projectId: String? = null, val name: String? = null,
    val clientName: String? = null, val clientPhone: String, val clientAddress: String? = null,
    val rooms: List<RoomCalcInputDto>,
    val discountPercent: Double = 0.0, val discountAmount: Double = 0.0,
)
@Serializable data class ProjectSavedDto(val id: String)

// :core:network
@POST("/api/projects") suspend fun saveProjectDraft(
    @Body body: SaveProjectDraftRequest, @Header("Idempotency-Key") idempotencyKey: String,
): ProjectSavedDto

// :core:model/Calculator.kt
data class CalculatorDraft(val rows: List<SlabRow>, val clientPhone: String, val clientName: String,
    val clientAddress: String, val discountPercent: Double, val discountAmount: Double,
    val deliveryCost: Double, val otherCost: Double, val projectId: String?)

// :core:data
suspend fun CalculatorRepository.saveDraft(input: SaveDraftInput, idempotencyKey: String): Result<String>
fun CalculatorRepository.observeDraft(): Flow<CalculatorDraft?>
suspend fun CalculatorRepository.persistDraft(draft: CalculatorDraft)
suspend fun CalculatorRepository.clearDraft()
```

- [ ] **Step 1: The draft table, schema 6.** `CalculatorDraftEntity` is deliberately one row per operator holding the whole draft as JSON — the draft is read and written whole, never queried by field, and a normalised room table would need its own migration every time `SlabRow` grows a field:

```kotlin
/** The operator's single in-progress quote, keyed by owner exactly as the web's
 *  `calculator-draft-<userId>` localStorage key is. Held as one JSON blob because it is only
 *  ever read and written whole; nothing queries inside it. */
@Entity(tableName = "calculator_draft")
data class CalculatorDraftEntity(
    @PrimaryKey val ownerId: String,
    val draftJson: String,
    val updatedAt: Long,
)
```

DAO: `observe(ownerId): Flow<CalculatorDraftEntity?>`, `upsert(row)` (`OnConflictStrategy.REPLACE`), `deleteFor(ownerId)`. Register the entity on `EtalonDatabase`, bump `version = 6`, add `abstract fun calculatorDraftDao(): CalculatorDraftDao`, and add to `Migrations.kt`:

```kotlin
/** 5 → 6 adds the calculator draft table. Additive only — nothing existing is touched, and the
 *  outbox in the same file is untouched by design. */
internal val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `calculator_draft` (" +
                "`ownerId` TEXT NOT NULL, `draftJson` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, " +
                "PRIMARY KEY(`ownerId`))"
        )
    }
}
```

and extend `ALL_MIGRATIONS` to `arrayOf(MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)`.

- [ ] **Step 2: Extend the migration test** so the existing outbox-survival case runs `runMigrationsAndValidate(6, …)` instead of 4, and add:

```kotlin
@Test fun `schema 6 adds the draft table without disturbing a queued upload`() {
    helper.createDatabase(5).use { db ->
        db.execSQL("INSERT INTO outbox (id, ownerId, kind, orderId, shipmentId, paymentId, filePath, payloadJson, state, attempts, lastError, createdAt, updatedAt) VALUES ('row-2','u1','LOAD_TRUCK','o1',NULL,NULL,'/p.jpg','{}','QUEUED',0,NULL,10,10)")
    }
    helper.runMigrationsAndValidate(6, ALL_MIGRATIONS.toList()).use { db ->
        db.prepare("SELECT COUNT(*) FROM calculator_draft").use { s -> assertTrue(s.step()); assertEquals(0, s.getInt(0)) }
        db.prepare("SELECT state FROM outbox WHERE id = 'row-2'").use { s -> assertTrue(s.step()); assertEquals("QUEUED", s.getText(0)) }
    }
}
```

Run `.\gradlew.bat :core:database:testDebugUnitTest --no-daemon` and commit the generated `6.json`.

- [ ] **Step 3: Write the wire contract test first,** in `:core:network`, in the style of `ServerContractTest` (which reads the REAL server sources rather than the generated OpenAPI):

```kotlin
/**
 * The room DTO names fields the server's Zod parses. A rename in validation.ts today passes every
 * other check — vitest never asserts the key names, `openapi:check` reads the same schema object,
 * and the first failure is a 422 in front of a customer with the quote already typed in.
 */
class CalculatorContractTest {
    private val validation = serverFile("precast-crm/src/lib/validation.ts")

    @Test fun `RoomCalcInputBaseSchema still carries every field RoomCalcInputDto sends`() {
        val body = zodObjectBody(validation, "RoomCalcInputBaseSchema")
        for (f in listOf("name", "innerWidth", "innerLength", "bearing", "correction", "extraBeams",
                         "forceStartBeam", "patternOverride", "m2PriceOverride",
                         "m2PriceOverrideValue", "m2PriceReason")) assertField(body, f)
    }
    @Test fun `innerLength is still positive, which is why an extras-only room cannot be saved`() {
        assertTrue(Regex("innerLength:\\s*z\\.coerce\\.number\\(\\)\\.positive\\(\\)").containsMatchIn(validation))
    }
    @Test fun `SaveProjectDraftSchema and PlaceOrderSchema still carry what this client sends`() {
        val draft = zodObjectBody(validation, "SaveProjectDraftSchema")
        for (f in listOf("projectId", "clientName", "clientPhone", "clientAddress", "rooms",
                         "discountPercent", "discountAmount")) assertField(draft, f)
        val order = zodObjectBody(validation, "PlaceOrderSchema")
        for (f in listOf("clientName", "clientPhone", "clientAddress", "rooms", "discountPercent",
                         "discountAmount", "deliveryCost", "otherCost", "scheduledAt", "notes",
                         "paidAmount")) assertField(order, f)
    }
}
```

Declare `precast-crm/src/lib/validation.ts` as a `Test` task input in `core/network/build.gradle.kts` the same way `:core:calc` declares the engine sources, or the suite reports up-to-date after a server edit.

- [ ] **Step 4: Write `CalculatorRepository`.** It holds the DAO (draft persistence, owner-stamped via `CurrentUser.id()`; with nobody signed in `observeDraft()` emits null and `persistDraft` is a no-op), the API, `PermissionGate` and `Json`. `SlabRow.toWire()` maps to `RoomCalcInputDto`, sending `patternOverride = patternOverride?.name` and dropping `result`. `saveDraft` refuses without `order.create` with the Uzbek message, refuses when any row is not `canPersist`, and passes the caller's `idempotencyKey` (the same key across a retry of one submission, a new one for a new save — the `RecordPaymentViewModel` rule). Test it with a `FakeEtalonApi` that records the request and asserts: `clientPhone` is normalised, `rooms` are in list order, an overridden row carries value **and** reason, a non-overridden row carries `m2PriceOverride = false` with **both** other fields null, and a save with an extras-only row never reaches the API.

- [ ] **Step 5: Wire autosave and the button.** The ViewModel writes the draft on a 500 ms debounce after any mutation and restores it in `init` before the first frame the operator can type into. Add `«Лойиҳани сақлаш»` and `«Тозалаш»` to the totals sheet's `actions` slot, both hidden when `!canWrite`. `clearAll()` empties the rows, the client bar and the discounts, and calls `clearDraft()`. Save shows a spinner, then an Uzbek confirmation, and keeps the returned `projectId` in state so a second save **updates** rather than duplicating.

- [ ] **Step 6:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green. **Deliverable:** type a quote, kill the app, reopen — the quote is still there; tap «Лойиҳани сақлаш» and the draft appears in the web CRM's projects list. Commit — `Feat(android) · the calculator draft survives, and saves to the server`.

---

## Task 9: «Буюртма бериш» → `POST /api/orders`, queueable offline

**Files:** create `PlaceOrderSheet.kt`; modify `core/model/Logistics.kt`, `core/database/entity/OutboxEntity.kt`, `core/database/Migrations.kt`, `core/database/EtalonDatabase.kt`, `core/database/dao/OutboxDao.kt`, `core/data/OutboxRepository.kt`, `core/sync/OutboxWorker.kt`, `core/network/EtalonApi.kt`, `core/network/dto/CalculatorDto.kt`, `core/testing/FakeEtalonApi.kt`, `core/data/CalculatorRepository.kt`, `CalculatorViewModel.kt`, `feature/calculator/res/values/strings.xml`; commit `assets/…/7.json`; test `OutboxWorkerTest.kt` (extended), `EtalonDatabaseMigrationTest.kt` (extended), `CalculatorRepositoryTest.kt` (extended), `PlaceOrderSheetStateTest.kt`.

**Interfaces consumed:** Task 1's idempotent `POST /api/orders`.
**Interfaces produced:**

```kotlin
@Serializable data class PlaceOrderRequest(
    val clientName: String, val clientPhone: String, val clientAddress: String,
    val rooms: List<RoomCalcInputDto>,
    val discountPercent: Double = 0.0, val discountAmount: Double = 0.0,
    val deliveryCost: Double = 0.0, val otherCost: Double = 0.0,
    /** ISO-8601 instant; `z.coerce.date()` on the server. */
    val scheduledAt: String,
    val notes: String? = null,
    /** Always 0 in 2b — prepayment at placement is 2c. `paymentMethod` is therefore omitted,
     *  which PlaceOrderSchema's refinement only demands when this is > 0. */
    val paidAmount: Double = 0.0,
)
@Serializable data class OrderPlacedDto(val id: String, val orderNumber: String)

@POST("/api/orders") suspend fun placeOrder(
    @Body body: PlaceOrderRequest, @Header("Idempotency-Key") idempotencyKey: String,
    @Header("Authorization") authorization: String,
): OrderPlacedDto

enum class OutboxKind { LOAD_TRUCK, ADD_LOADED_PHOTO, DELIVERY_PROOF, LOAD_SHIPMENT, ADD_PAYMENT_RECEIPT, PLACE_ORDER, UNKNOWN; … }
suspend fun CalculatorRepository.placeOrder(input: PlaceOrderInput, idempotencyKey: String): Result<String>
suspend fun CalculatorRepository.queuePlaceOrder(input: PlaceOrderInput): Result<String>
```

`placeOrder` carries an explicit `Authorization` header for the same reason the four multipart routes do: the outbox drain pins the token it started with, and a row claimed under one operator must never go out under the next one's.

- [ ] **Step 1: Make `outbox.orderId` nullable — schema 7.** A queued PLACE_ORDER row has no order id yet; there is no honest value to put in a non-null column, and `""` would send `orders.refreshDetail("")` down a real network call. SQLite cannot drop a NOT NULL, so the migration recreates the table:

```kotlin
/** 6 → 7 makes `outbox.orderId` nullable, because a queued PLACE_ORDER row has no order yet —
 *  the order is what it is going to create. SQLite cannot relax NOT NULL in place, so the table
 *  is recreated and every existing row copied across UNCHANGED: these rows are the only durable
 *  record of a photographed delivery and the cash counted against it. */
internal val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `outbox_new` (`id` TEXT NOT NULL, `ownerId` TEXT NOT NULL, " +
                "`kind` TEXT NOT NULL, `orderId` TEXT, `shipmentId` TEXT, `paymentId` TEXT, " +
                "`filePath` TEXT, `payloadJson` TEXT NOT NULL, `state` TEXT NOT NULL, " +
                "`attempts` INTEGER NOT NULL, `lastError` TEXT, `createdAt` INTEGER NOT NULL, " +
                "`updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))"
        )
        connection.execSQL("INSERT INTO `outbox_new` SELECT * FROM `outbox`")
        connection.execSQL("DROP TABLE `outbox`")
        connection.execSQL("ALTER TABLE `outbox_new` RENAME TO `outbox`")
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_orderId` ON `outbox` (`orderId`)")
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_ownerId` ON `outbox` (`ownerId`)")
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_state_createdAt` ON `outbox` (`state`, `createdAt`)")
    }
}
```

Change `OutboxEntity.orderId` to `String?`, `PendingUpload.orderId` to `String?`, `OutboxDao.observeForOrder`'s parameter stays non-null (a null `orderId` simply never matches), bump the database to `version = 7`, add `MIGRATION_6_7` to `ALL_MIGRATIONS`, and add a migration test asserting a 6→7 step keeps a queued row's `ownerId`, `filePath`, `payloadJson` and `state` and that `orderId` is now writable as NULL. Commit the generated `7.json`. **Verify the generated `7.json` index names match the SQL above** — a mismatch fails `runMigrationsAndValidate`, which is the check working.

- [ ] **Step 2: Widen `OutboxRepository.enqueue`** so `orderId: String?` (defaulted to null) and `photo` stays optional. Nothing else changes: the row is still owner-stamped and still refuses to enqueue with nobody signed in.

- [ ] **Step 3: Restructure `OutboxWorker.send`,** which today resolves the JPEG for every kind before the `when`. Move that resolution into the photo branches so a body-only kind is possible:

```kotlin
private suspend fun send(row: OutboxEntity, authorization: String) {
    val payload = json.decodeFromString(JsonObject.serializer(), row.payloadJson)

    // Only the photo kinds have a file, and each one needs it; PLACE_ORDER carries its whole
    // request in payloadJson. Resolving it up front — as this did while every kind was a photo —
    // would fail a body-only row with "Сурат топилмади", a permanent failure over a missing
    // photo it never had.
    fun part(): MultipartBody.Part {
        val file = row.filePath?.let(::File)?.takeIf { it.exists() } ?: throw MissingUploadFileException(row.filePath)
        return MultipartBody.Part.createFormData("file", file.name, file.asRequestBody(JPEG))
    }
    fun text(key: String, fallback: String = "") = (payload[key]?.jsonPrimitive?.content ?: fallback).toRequestBody(PLAIN)
    fun orderId() = requireNotNull(row.orderId) { "outbox row ${row.id} of kind ${row.kind} has no orderId" }

    when (OutboxKind.from(row.kind)) {
        OutboxKind.UNKNOWN -> error("Unsupported outbox kind: ${row.kind}")
        OutboxKind.LOAD_TRUCK -> api.loadTruck(orderId(), part(), row.id, authorization)
        OutboxKind.ADD_LOADED_PHOTO -> api.addLoadedPhoto(orderId(), part(), row.id, authorization)
        OutboxKind.DELIVERY_PROOF -> api.deliveryProof(
            id = orderId(), file = part(),
            cashAmount = text("cashAmount", "0"), noCashCollected = text("noCashCollected", "false"),
            noCashCollectedNote = text("noCashCollectedNote"), driverReturned = text("driverReturned", "false"),
            idempotencyKey = row.id, authorization = authorization,
        )
        OutboxKind.LOAD_SHIPMENT -> api.loadShipment(
            id = orderId(), sid = requireNotNull(row.shipmentId), file = part(),
            loadedBeams = (payload["loadedBeams"]?.toString() ?: "{}").toRequestBody(PLAIN),
            loadedBlocks = text("loadedBlocks", "0"),
            idempotencyKey = row.id, authorization = authorization,
        )
        // The whole request is the payload. `row.id` is the Idempotency-Key, so a retry after a
        // dropped connection replays the first response rather than placing a second real order.
        OutboxKind.PLACE_ORDER -> api.placeOrder(
            body = json.decodeFromJsonElement(PlaceOrderRequest.serializer(), payload),
            idempotencyKey = row.id, authorization = authorization,
        )
    }
}
```

and guard the refresh loop: `OutboxOutcome.Done -> { row.filePath?.let { File(it).delete() }; dao.delete(row.id); row.orderId?.let { touchedOrders += it } }`. Add `OutboxWorkerTest` cases: a PLACE_ORDER row with no file and no orderId drains successfully and calls `placeOrder` with `row.id` as the key; a photo row with a missing file still fails permanently with «Сурат топилмади, қайта суратга олинг».

- [ ] **Step 4: `CalculatorRepository.placeOrder` / `queuePlaceOrder`,** test-first. `placeOrder` refuses without `order.create`, refuses when any row is not `canPersist`, refuses an empty room list (`PlaceOrderSchema` requires `min(1)`), and requires all three client fields. `queuePlaceOrder` serialises the identical `PlaceOrderRequest` into `payloadJson` and enqueues `OutboxKind.PLACE_ORDER` with `orderId = null`. Assert in a test that the queued JSON round-trips to a `PlaceOrderRequest` equal to what the online path would have sent — that equality is what makes the offline order the same order.

- [ ] **Step 5: Write `PlaceOrderSheet.kt`** — a `ModalBottomSheet` with: the client line (read-only, from the bar); a **required** delivery date via `DatePickerDialog`, defaulting to nothing so the operator must choose (the field is required server-side and a silent "today" is a real production commitment); a notes field capped at 2000; a read-only summary of rooms / m² / total; and `PrimaryButton(calc_action_place_order)` disabled until name, phone, address, ≥1 persistable room and a date are all present. On confirm, the ViewModel mints one `Idempotency-Key` per submission (`UUID.randomUUID().toString()`, held in `SavedStateHandle` so process death does not mint a second), calls `placeOrder`, and on an `AppError.Network` offers «Навбатга қўйиш» → `queuePlaceOrder`. On success it calls `clearAll()` and navigates to the new order through `onOpenOrder`.

New strings:

```xml
    <string name="calc_action_place_order">Буюртма бериш</string>
    <string name="calc_action_save_draft">Лойиҳани сақлаш</string>
    <string name="calc_place_scheduled_at">Етказиб бериш санаси</string>
    <string name="calc_place_notes">Изоҳ</string>
    <string name="calc_place_queue">Навбатга қўйиш</string>
    <string name="calc_place_queued">Интернет пайдо бўлганда юборилади</string>
    <string name="calc_cannot_save_rooms">Бу хоналарни сақлаб бўлмайди: %1$s</string>
</resources>
```

- [ ] **Step 6:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` green. Commit — `Feat(android) · place an order from the calculator, online or queued`.

---

## Task 10: «Юбориш» — the quote as a shareable image

**Files:** create `QuoteImage.kt`, `app/src/main/res/xml/file_paths.xml`; modify `app/src/main/AndroidManifest.xml`, `TotalsSheet.kt`, `CalculatorScreen.kt`, `feature/calculator/res/values/strings.xml`; test `QuoteImageTest.kt`.

**Interfaces consumed:** `CalculatorUiState`, the formatters.
**Interfaces produced:**

```kotlin
/** The off-screen quote card that gets captured. Composed, never scrolled — it is a picture. */
@Composable fun QuoteCard(state: CalculatorUiState, modifier: Modifier = Modifier)
/** Writes a PNG under `cacheDir/quotes/` and returns the content:// URI to share. */
suspend fun writeQuotePng(context: Context, bitmap: ImageBitmap): Uri
fun shareQuoteIntent(uri: Uri, subject: String): Intent
```

- [ ] **Step 1: Add the FileProvider.** `app/src/main/res/xml/file_paths.xml`:

```xml
<paths>
    <!-- Only the generated quote PNGs are exposed, and only for the life of the share. -->
    <cache-path name="quotes" path="quotes/" />
</paths>
```

and inside `<application>` in `app/src/main/AndroidManifest.xml`:

```xml
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
```

`androidx.core:core-ktx` is already a dependency, so `FileProvider` needs no new library.

- [ ] **Step 2: Write `QuoteCard`** — a fixed-width (`360.dp`) column on an opaque `MaterialTheme.colorScheme.surface` background: the company line «EtalonSlabs · Yig'ma Monolit» with `+998934813330`, the client line, one row per computed room (`name · formatArea · MoneyText(subtotal)`), then the totals block (rooms subtotal, discount, delivery, other, grand total) and the beam schedule. **Opaque background is not optional** — a transparent capture shares as a black rectangle in most messengers.

- [ ] **Step 3: Capture it with a `GraphicsLayer`,** no new dependency — Compose has this since 1.7 and the BOM here is 2026.08.00:

```kotlin
val layer = rememberGraphicsLayer()
Box(Modifier.drawWithContent { layer.record { this@drawWithContent.drawContent() } }) { QuoteCard(state) }
// on tap:
scope.launch {
    val uri = writeQuotePng(context, layer.toImageBitmap())
    context.startActivity(Intent.createChooser(shareQuoteIntent(uri, subject), null))
}
```

Render the card off-screen with `Modifier.graphicsLayer { alpha = 0f }` inside the calculator so it is composed and measured but invisible.

```kotlin
suspend fun writeQuotePng(context: Context, bitmap: ImageBitmap): Uri = withContext(Dispatchers.IO) {
    val dir = File(context.cacheDir, "quotes").apply { mkdirs() }
    // One file, overwritten: the cache is not a gallery, and a share the operator repeats twenty
    // times a day must not fill the phone with twenty PNGs nothing ever deletes.
    val file = File(dir, "quote.png")
    file.outputStream().use { bitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

fun shareQuoteIntent(uri: Uri, subject: String): Intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/png"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_SUBJECT, subject)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)   // without this every messenger gets a SecurityException
}
```

- [ ] **Step 4: Test what can be tested off-device.** A Robolectric test that `writeQuotePng` produces a readable PNG under `cacheDir/quotes/` and a `content://` URI with the app's authority, and that `shareQuoteIntent` carries `FLAG_GRANT_READ_URI_PERMISSION`, `type == "image/png"` and a non-null `EXTRA_STREAM`. Add `«Юбориш»` (`calc_action_share`) to the totals sheet's `actions` slot, enabled only when at least one room has a result — **it is not gated on `order.create`**; showing a customer a price is not writing one.

- [ ] **Step 5:** the whole project — `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` — green; from `precast-crm/`, `npm test`, `npx tsc --noEmit`, `npm run openapi:check`, `npm run golden:check` all clean. Commit — `Feat(android) · share the quote as an image`.

---

## Self-review

**Spec coverage (§5.4).** Room cards with two large comma-decimal fields, extras behind «Қўшимча», pattern chip, per-room subtotal in mono, FAB, drag reorder → Tasks 4–5. Persistent bottom-sheet totals with the discount toggle, delivery, other, 180 kg/m² weight and the rounding grid → Task 6. Client bar with phone-first `?phone=` lookup and the viloyat/tuman picker → Task 7. Draft persistence keyed by user, surviving process death → Task 8. Save Project, Place Order, share image → Tasks 8–10. **Deliberately not built, and why:** AI assist, the CAD canvas, tapered rooms, order editing, prepayment at placement and the capacity strip — each listed in "Out of scope" above with the slice that owns it.

**The one thing most likely to go wrong.** An implementer computes a total in the ViewModel and sends it. The server would ignore it — `POST /api/projects` and `POST /api/orders` both recompute every room from `calculateSlab` and `loadPricingConfig()` — but the habit leaks into a "helpful" `totalPrice` field that then drifts. The wire DTOs in Tasks 8 and 9 have **no** money field at all, and `CalculatorContractTest` asserts the schemas that shape them.

**The second.** The extras-only room. It computes, it shows a price, and the persist schema refuses it. Every path that writes (draft save, place order, queue) checks `canPersist` and names the rooms in Uzbek; nothing anywhere filters them out of a list. If a reviewer sees `rows.filter { it.canPersist }` before a `map` to the wire, that is the bug this note exists to catch.

**The third.** `beamLengthKey`. `String.format(Locale.ROOT, "%.2f", 2.675)` gives `"2.68"`; JS `toFixed(2)` gives `"2.67"`. The factory cuts by that key. Task 2's test pins 2.675 and 5.005 specifically, and the implementation uses the exact-binary `BigDecimal(Double)` constructor — the one place in this codebase where that constructor is correct and `Boundary.kt`'s ban on it does not apply, because it is a length, not money.

**Type consistency.** `SlabRow`, `ProjectTotals`, `BeamScheduleLine` and `M2_OVERRIDE_TIERS` are defined in Task 2 and used unchanged in Tasks 3–10. `CalculatorUiState` is defined in Task 3 and only ever gains fields (Tasks 5, 6, 7, 9) — no task redefines it. `RoomCalcInputDto` is defined in Task 8 and reused verbatim by Task 9's `PlaceOrderRequest`. `OutboxKind` gains exactly one value, in Task 9, and `OutboxWorker`'s `when` is updated in the same task because it has no `else`. `Money`, `Pricing`, `SlabResult`, `ProjectTotal`, `SlabResult.money()`, `ProjectTotal.money()` and `Pricing.toPriceConfig()` all already exist from Phase 2a.

**Schema versions.** 5 today → 6 in Task 8 (additive `calculator_draft`) → 7 in Task 9 (`outbox.orderId` nullable, table recreated with every row copied). Each has a `Migration` in `ALL_MIGRATIONS`, a test that proves a queued upload survives it, and a committed schema JSON. Tasks 8 and 9 must land in that order.
