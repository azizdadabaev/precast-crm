# Android Phase 2a — Calculation Engine Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure-Kotlin `:core:calc` module that reproduces `calculation-engine.ts` and `gazoblok-engine.ts` **bit for bit**, proven by replaying golden vectors exported from the web engine, so every later Phase 2 slice (calculator screen, drafts, place-order, quotes) can price a room on the phone with zero divergence from what the server would compute.

**Architecture:** One new Android library module with no Android dependencies beyond the convention plugin, no network, no database. The engine is a line-by-line port on `Double`, because IEEE-754 parity with the JS `number` engine *is* the correctness criterion. Money leaves the module only through an explicit boundary that converts each `round2`'d result to `Money` losslessly. The web repo's golden exporter is widened to cover every distinct engine test input plus the gazoblok engine, pinned by the existing `golden:check`, and a Gradle test-input guard makes the Kotlin suite re-run whenever the TypeScript engine changes.

**Tech Stack:** Kotlin 2.4 (JVM tests, JUnit 5), Gradle 9.6.0 / AGP 9.4.0 (never apply `org.jetbrains.kotlin.android`), kotlinx-serialization-json for reading the vector files in tests, `tsx` for the server exporter. compileSdk 37 / minSdk 36 via `AndroidConfig`.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` — §6.4 (engine ports), §5.4 (calculator, for what consumes this), §7 (delivery plan: Phase 2 exit criterion "parity suite green in CI").

**Base:** branch `feat/android-phase2a`, cut from `feat/android-phase1d` head `f3c984b`.

---

## Phase 2 split (this plan is the first of four)

| Slice | Scope | Depends on |
|---|---|---|
| **2a (this plan)** | `:core:calc` engine port + parity harness + gazoblok engine | — |
| 2b | Calculator screen, rooms list, live totals, client bar, drafts → `/api/projects`, place order, share quote image | 2a |
| 2c | Edit order, AI assist (`/api/calculations/ai-extract`), production log, inventory, Gazoblok orders line | 2a, 2b |
| 2d | Owner editorial home (Vico charts, donut, top clients) — the tier deferred from 1d | — |

---

## Global Constraints

- **This module is the one deliberate exception to "never `Double` for money", and the exception is bounded.** Inside `:core:calc` every quantity — lengths, areas, prices, subtotals — is a `Double`, exactly as the JS engine holds them, because the 26 golden vectors assert `m2_cost: 3491600` and the port must produce the *same double* the server does. `Math.round`, `floor`, `ceil`, `pow(10, n)`, `+ - * /` are IEEE-754 identical on V8 and the JVM; the port must use the same operation in the same order. **No `Double` may leave the module.** `SlabResult`, `ProjectTotal` and the gazoblok results are internal shapes; the only public money surface is the boundary in Task 6, which returns `Money`.
- **`roundN` is half-away-from-zero, not banker's, not Kotlin's `Math.rint`.** JS `Math.round(x)` for `x ≥ 0` is `floor(x + 0.5)`; applied to `Math.abs(n) * f` it rounds half away from zero. Kotlin's `Math.round(Double): Long` is also `floor(x + 0.5)` for the positive operand — use exactly that, never `roundToInt`, never `RoundingMode`.
- **Parity is asserted with `==` on `Double`, never with a tolerance.** A tolerance would hide the exact class of drift this module exists to prevent. If a vector does not match to the bit, the port is wrong, not the test.
- **Field names stay snake_case on the wire and camelCase in Kotlin**, mapped one-to-one; `SlabResult` has exactly 28 fields and the replay asserts every one of them by name, so an omitted field cannot pass.
- **Golden vectors are read from the committed files under `docs/api/` at test time**, declared as Gradle `Test` task inputs so a server regeneration re-runs the suite. Never copy vector contents into Kotlin source.
- **`CalculationError` messages are engine-internal English and stay so** — they are thrown, caught by the caller, and never shown. Phase 2b maps them to Uzbek at the screen. Do not translate them here; the parity tests compare the *type*, not the text.
- No Android UI dependency, no network, no database, no Hilt in this module. Never apply `org.jetbrains.kotlin.android`.
- No logging of anything.

---

## The engine in one page (read before Task 2)

Source: `precast-crm/src/services/calculation-engine.ts`, 529 lines, read it in full. The port is line-by-line; this section only names the traps.

1. **Order of operations is part of the contract.** `beam_length = round3(inner_width + 2 * bearing)` rounds *after* the add. `remainder = round3(effective_length - pitches * PITCH)`. `m2_cost = round2(billed_area * m2_price)` where `billed_area` was already `round3`'d. Port each expression with the same rounding at the same point.
2. **Three length concepts.** `billed_length` (m²-rate base; GBG adds `BLOCK_VISIBLE`), `slab_length` (physical; adds the pattern extension), `monolith_length` (adds manual extras × `BEAM_WIDTH`). They diverge; the vectors catch a mix-up.
3. **The GBG-to-GB promotion consumes one extra beam.** `effective_extra_beams` can be one less than the input; every cost field uses the post-conversion value.
4. **Auto-pick uses `1e-9` epsilons** on the remainder and `tierPrice` uses `1e-9` on the boundary. Keep them; `bearing 0.15 tier 4.30 boundary` is a golden case precisely because `4.0 + 0.30 = 4.3` must land in the first tier.
5. **Extras-only mode** (`inner_length == 0 && extra_beams >= 1`) short-circuits to a separate function with sentinel zeros and `is_extras_only = true`.
6. **`projectTotal`**: an explicit `discount_amount_override > 0` wins and the percent is back-computed; otherwise the percent is clamped to `[0, 100]`. The amount is capped at the subtotal.

---

## File structure

**Server**
- Modify: `precast-crm/scripts/export-calc-golden.ts` — add every distinct input from `tests/calculation-engine.test.ts` and `tests/calculation-engine-extras-only.test.ts`; add a gazoblok emit target.
- Create: `docs/api/gazoblok-golden.json`. Modify: `docs/api/calc-golden.json` (regenerated), `.gitattributes` (pin the new file `text eol=lf`), `package.json` (`golden:check` covers both).

**`:core:calc`** (new) — `android/core/calc/build.gradle.kts`, `src/main/kotlin/uz/etalon/crm/core/calc/`:
`Constants.kt`, `Rounding.kt`, `Pricing.kt` (tiers + `PriceConfig`), `SlabInput.kt`, `SlabResult.kt`, `CalculateSlab.kt`, `ProjectTotal.kt`, `CalculationError.kt`, `gazoblok/*.kt`, `Boundary.kt` (Task 6).
`src/test/kotlin/uz/etalon/crm/core/calc/`: `GoldenVectors.kt` (loader), `RoundingTest.kt`, `TierPriceTest.kt`, `SlabParityTest.kt`, `ValidationTest.kt`, `ProjectTotalTest.kt`, `GazoblokParityTest.kt`, `BoundaryTest.kt`, `EngineDriftTest.kt`.

**Android build** — `android/settings.gradle.kts` (include `:core:calc`).

---

## Task 1: Module scaffold, helpers, and the golden loader

**Files:** create `android/core/calc/build.gradle.kts`, `Constants.kt`, `Rounding.kt`, `Pricing.kt`, test `GoldenVectors.kt`, `RoundingTest.kt`, `TierPriceTest.kt`; modify `android/settings.gradle.kts`.

**Interfaces produced:**
```kotlin
object Calc { const val PITCH = 0.58; const val BEAM_WIDTH = 0.12; const val BLOCK_LENGTH = 0.20; const val BLOCK_VISIBLE = 0.45; const val TOPPING_THICKNESS = 0.05; const val DEFAULT_BEARING = 0.15; const val SMALL_REMAINDER = 0.20; const val MEDIUM_REMAINDER = 0.45 }
fun roundN(n: Double, decimals: Int): Double
fun round2(n: Double): Double; fun round3(n: Double): Double
data class PriceTier(val maxBeamLength: Double, val price: Double)
data class PriceConfig(val m2PriceTiers: List<PriceTier>, val extraBeamPriceTiers: List<PriceTier>, val blockUnitPrice: Double)
val DEFAULT_PRICE_CONFIG: PriceConfig
fun tierPrice(beamLength: Double, tiers: List<PriceTier>): Double
enum class Pattern { GB, BGB, GBG }
fun autoPickPattern(remainder: Double): AutoPick   // data class AutoPick(val pattern: Pattern, val bumpPitches: Boolean)
```
Test-side: `object GoldenVectors { val slab: SlabGolden; val gazoblok: GazoblokGolden }` reading `docs/api/*.json` relative to the repo root.

- [ ] **Step 1: Scaffold the module** mirroring `android/core/model/build.gradle.kts` (`etalon.android.library`, namespace `uz.etalon.crm.core.calc`), with `testImplementation(libs.kotlinx.serialization.json)`. Add the include to `settings.gradle.kts`.

- [ ] **Step 2: Write the failing rounding tests.** These pin the half-away-from-zero rule against values where banker's rounding or `rint` would differ:

```kotlin
@Test fun `roundN is half away from zero, like the JS engine`() {
    assertEquals(2.5, roundN(2.45, 1)); assertEquals(-2.5, roundN(-2.45, 1))
    assertEquals(0.13, roundN(0.125, 2)); assertEquals(-0.13, roundN(-0.125, 2))   // rint would give 0.12
    assertEquals(3.0, roundN(2.5, 0)); assertEquals(-3.0, roundN(-2.5, 0))          // banker's would give 2.0
    assertEquals(4.646, round3(4.6455))                                              // the "half-away rounding length" golden input
}
@Test fun `tierPrice clamps above the last tier and honours the epsilon at a boundary`() {
    val t = DEFAULT_PRICE_CONFIG.m2PriceTiers
    assertEquals(140000.0, tierPrice(4.3, t)); assertEquals(140000.0, tierPrice(4.0 + 2 * 0.15, t))  // 4.3 computed, not literal
    assertEquals(160000.0, tierPrice(4.3000001, t)); assertEquals(230000.0, tierPrice(9.0, t))
}
@Test fun `autoPickPattern thresholds match the engine`() {
    assertEquals(AutoPick(Pattern.GB, false), autoPickPattern(0.0))
    assertEquals(AutoPick(Pattern.BGB, false), autoPickPattern(0.20)); assertEquals(AutoPick(Pattern.GBG, false), autoPickPattern(0.45))
    assertEquals(AutoPick(Pattern.GB, true), autoPickPattern(0.4500001))
}
```

- [ ] **Step 3: Run, watch them fail.**

- [ ] **Step 4: Port the helpers verbatim.**

```kotlin
fun roundN(n: Double, decimals: Int): Double {
    val f = Math.pow(10.0, decimals.toDouble())
    val sign = if (n < 0) -1.0 else 1.0
    return (sign * Math.round(Math.abs(n) * f)) / f     // Math.round(Double): Long == JS Math.round on a non-negative operand
}
fun tierPrice(beamLength: Double, tiers: List<PriceTier>): Double {
    val eps = 1e-9
    for (t in tiers) if (beamLength <= t.maxBeamLength + eps) return t.price
    return tiers.last().price
}
```
`DEFAULT_PRICE_CONFIG` carries the five m² tiers, five extra-beam tiers and `blockUnitPrice = 6000.0` from the TS constants.

- [ ] **Step 5: Write the golden loader.** It resolves `docs/api/calc-golden.json` from the repo root (walk up from the module directory until `docs/api` exists), decodes `version`, `pricing`, `cases[]{name,input,result}` with kotlinx, and exposes the raw result as a `Map<String, JsonPrimitive>` so Task 2 can assert *every* field by name. Declare both vector files as inputs on the module's `Test` tasks:

```kotlin
tasks.withType<Test>().configureEach {
    inputs.files(rootProject.file("../docs/api/calc-golden.json"), rootProject.file("../docs/api/gazoblok-golden.json"))
        .withPropertyName("goldenVectors").withPathSensitivity(PathSensitivity.RELATIVE)
}
```
Without this, Gradle marks the suite up-to-date after a server regeneration and a parity break sails through — the 1d contract test found exactly that.

- [ ] **Step 6:** `:core:calc:testDebugUnitTest :core:calc:assembleDebug` green. Commit — `Feat(android) · calc engine scaffold, rounding, tiers, and the golden loader`.

---

## Task 2: `calculateSlab`, extras-only mode, and the 26-vector parity replay

**Files:** create `SlabInput.kt`, `SlabResult.kt`, `CalculateSlab.kt`, `CalculationError.kt`; test `SlabParityTest.kt`.

**Interfaces produced:**
```kotlin
data class SlabInput(val innerWidth: Double, val innerLength: Double, val bearing: Double? = null, val pattern: Pattern? = null, val correction: Double? = null, val extraBeams: Int? = null, val forceStartBeam: Boolean? = null)
data class SlabResult(/* the 28 fields, camelCase, Double / Int / Pattern / Boolean */)
class CalculationError(message: String) : RuntimeException(message)
fun calculateSlab(input: SlabInput, priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG): SlabResult
```

- [ ] **Step 1: Write the failing parity test first.** It is table-driven over every case in the file and asserts every field by its wire name, so a field the port forgot cannot pass:

```kotlin
@TestFactory fun `every slab golden vector replays bit for bit`() = GoldenVectors.slab.cases.map { c ->
    DynamicTest.dynamicTest(c.name) {
        val r = calculateSlab(c.input.toSlabInput(), GoldenVectors.slab.pricing.toPriceConfig())
        val actual = r.toWireMap()          // Map<String, Any> keyed by the 28 snake_case names
        assertEquals(c.result.keys, actual.keys, "field set")
        for ((k, expected) in c.result) assertEquals(expected.asKotlin(), actual[k], "${c.name}: $k")
    }
}
@Test fun `the vector file carries exactly the cases Phase 0 exported, and every result has 28 fields`() {
    assertTrue(GoldenVectors.slab.cases.size >= 26)
    GoldenVectors.slab.cases.forEach { assertEquals(28, it.result.size, it.name) }
}
```
`asKotlin()` turns a `JsonPrimitive` into `Double` for numbers, `Boolean`, or `String` (pattern). **Compare doubles with `assertEquals(Double, Double)` — no delta argument.**

- [ ] **Step 2: Run, watch it fail** on an unresolved `calculateSlab`.

- [ ] **Step 3: Port `calculateSlab` and `calculateExtrasOnly` line by line** from the TS, in the same order, with the same rounding points. `Math.floor` → `kotlin.math.floor`, `Math.ceil` → `ceil`, both then `.toInt()`. Keep `validate()` as a private function throwing `CalculationError` with the TS messages verbatim. Keep the explicit-override > `bumpPitches` > auto precedence and the start-beam promotion block exactly.

- [ ] **Step 4: Run the replay.** If any case fails, the diff names the field — fix the port, never the vector. Expected: 26 dynamic tests pass.

- [ ] **Step 5:** Commit — `Feat(android) · the slab engine, replaying every golden vector bit for bit`.

---

## Task 3: Validation errors and `projectTotal`

**Files:** create `ProjectTotal.kt`; test `ValidationTest.kt`, `ProjectTotalTest.kt`.

The golden file carries only success cases. The eight rejection cases in `precast-crm/tests/calculation-engine.test.ts:574-589` must be ported by hand, asserting the exception *type*:

- [ ] **Step 1: Write the failing tests.**

```kotlin
@Test fun `the engine rejects what the server rejects`() {
    listOf(
        SlabInput(0.0, 6.0), SlabInput(-1.0, 6.0),                       // width
        SlabInput(4.0, 0.0),                                             // length 0 without extras
        SlabInput(Double.NaN, 6.0), SlabInput(4.0, Double.POSITIVE_INFINITY),
        SlabInput(4.0, 6.0, bearing = -0.1),
        SlabInput(4.0, 6.0, extraBeams = -1),
    ).forEach { assertThrows<CalculationError>(it.toString()) { calculateSlab(it) } }
}
@Test fun `extras-only mode is accepted, but not with a non-finite length`() {
    assertTrue(calculateSlab(SlabInput(4.2, 0.0, extraBeams = 3)).isExtrasOnly)
    assertThrows<CalculationError> { calculateSlab(SlabInput(4.2, Double.NaN, extraBeams = 3)) }
}
```
The TS also rejects `extra_beams: 1.5`; Kotlin's `Int` makes that unrepresentable, so note it in the report rather than inventing a case.

`projectTotal` tests, mirroring the TS docstring: percent path, amount override wins and back-computes the percent, cap at subtotal, percent clamped to `[0,100]`, empty room list gives all zeros.

- [ ] **Step 2: Run, watch them fail. Step 3: Port `projectTotal` verbatim** — `reduce` then `round2`, `Math.min`/`Math.max` as in the TS. **Step 4:** green. Commit — `Feat(android) · engine validation and the project total`.

---

## Task 4 (server): Widen the golden exporter — every engine input, plus gazoblok

**Files:** modify `precast-crm/scripts/export-calc-golden.ts`, `precast-crm/package.json`, `.gitattributes`; regenerate `docs/api/calc-golden.json`; create `docs/api/gazoblok-golden.json`; modify `precast-crm/tests/calc-golden.test.ts`.

The 26 hand-picked cases are a floor, not the ceiling the spec asked for ("every vitest case"). And `gazoblok-engine.ts` has 16 vitest cases and **no vectors at all** — porting it against hand-transcribed expectations is the drift the golden approach exists to prevent.

- [ ] **Step 1: Add every distinct `calculateSlab` input** from `tests/calculation-engine.test.ts` and `tests/calculation-engine-extras-only.test.ts` to `GOLDEN_CASES`, named after the `it(...)` title. Deduplicate against the existing 26 by input equality. Expect roughly 40–50 new cases; report the real count.

- [ ] **Step 2: Add a gazoblok emit target** — `docs/api/gazoblok-golden.json` with `{ version, cases: [{ name, fn: "blockVolumeM3"|"pricePerM3"|"blocksPerM3"|"estimateWall"|"lineTotal"|"orderTotal"|"estimateProject", input, result }] }`, one case per success path in `tests/gazoblok-engine.test.ts`. Read that file for the exact fixtures; `estimateProject` takes a `Map` of products — serialise it as an object keyed by `productId`. Rejection cases are not vectors; list their inputs in a `rejects: []` array so Task 5 can port them.

- [ ] **Step 3: Pin and check.** Add `docs/api/gazoblok-golden.json text eol=lf` to `.gitattributes` (this repo has `core.autocrlf=true`; an unpinned generated file fails a byte-comparison check on a clean Windows checkout). Extend `golden:check` and `calc-golden.test.ts` so both files are verified against a fresh export.

- [ ] **Step 4:** `npm run golden:calc`, `npm run golden:check`, `npx vitest run tests/calc-golden.test.ts`, `npx tsc --noEmit` — all clean. Commit — `Feat(calc) · golden vectors for every engine input and for the gazoblok engine`.

---

## Task 5: The gazoblok engine port

**Files:** create `gazoblok/GazoblokTypes.kt`, `gazoblok/GazoblokEngine.kt`, `gazoblok/GazoblokError.kt`; test `GazoblokParityTest.kt`.

Source: `precast-crm/src/services/gazoblok-engine.ts`, 356 lines. Same discipline as Task 2: `Double` inside, verbatim order of operations, `round2`/`round3` from Task 1, a `GazoblokError` that extends `CalculationError` exactly as the TS does.

- [ ] **Step 1: Write the failing table-driven replay** over `GoldenVectors.gazoblok.cases`, dispatching on `fn` to the right Kotlin function and asserting every result field by name, doubles with `==`. Port the `rejects` list as `assertThrows<GazoblokError>` cases.
- [ ] **Step 2: Run, watch it fail. Step 3: Port** `blockVolumeM3`, `pricePerM3`, `blocksPerM3`, `estimateWall`, `lineTotal`, `orderTotal`, `estimateProject` with `Opening`, `WallInput`, `ProjectEstimateOpts`, `PerSizeResult`, `GlueResult`, `EstimateWarning`, `ProjectEstimateResult`. `estimateProject`'s `products: Map` becomes `Map<String, LabelledBlockProduct>`. Warnings carry the TS `code` enum and message verbatim. **Step 4:** green. Commit — `Feat(android) · the gazoblok engine, replaying its golden vectors`.

---

## Task 6: The money boundary — the only place a `Double` becomes `Money`

**Files:** create `Boundary.kt`; test `BoundaryTest.kt`.

**Interfaces produced:**
```kotlin
fun Pricing.toPriceConfig(): PriceConfig          // Android's BigDecimal/Money pricing (core:model Session.kt) → engine doubles
data class RoomMoney(val subtotal: Money, val m2Cost: Money, val patternExtraCost: Money, val manualExtraBeamsCost: Money, val m2Price: Money, val extraBeamPricePerM: Money)
fun SlabResult.money(): RoomMoney
data class ProjectMoney(val roomsSubtotal: Money, val discountPercent: BigDecimal, val discountAmount: Money, val total: Money)
fun ProjectTotal.money(): ProjectMoney
```

Why this is safe, and what the test must prove: every money field the engine returns has passed through `round2`, so the `Double` is the nearest double to a value with at most two decimals. `BigDecimal.valueOf(d)` uses `Double.toString`, the shortest representation that round-trips — which for such a value is exactly the two-decimal string. So `Money(BigDecimal.valueOf(d).setScale(2))` is lossless. **`BigDecimal(d)` (the constructor) is NOT** — it expands the binary fraction (`BigDecimal(0.1)` is `0.1000000000000000055…`). Use `valueOf`, never the constructor, and the test must fail if someone swaps them.

- [ ] **Step 1: Write the failing tests.**

```kotlin
@Test fun `every money field of every golden vector converts to Money losslessly`() = GoldenVectors.slab.cases.forEach { c ->
    val m = calculateSlab(c.input.toSlabInput(), GoldenVectors.slab.pricing.toPriceConfig()).money()
    assertEquals(Money.parse(c.result.getValue("subtotal").content), m.subtotal, c.name)   // parses the wire literal, e.g. "3491600"
    assertEquals(Money.parse(c.result.getValue("m2_cost").content), m.m2Cost, c.name)
}
@Test fun `the conversion is exact at the Decimal(14,2) ceiling and on a fractional cost`() {
    assertEquals(Money.parse("999999999999.99"), moneyOf(999999999999.99))
    assertEquals(Money.parse("0.10"), moneyOf(0.1))            // BigDecimal(0.1) would give 0.1000000000000000055…
}
@Test fun `Android pricing converts to engine doubles that pick the same tiers as the exported pricing block`() {
    val fromAndroid = androidDefaultPricing().toPriceConfig()      // build a Pricing from the same strings the bootstrap sends: "4.30", "140000"
    val fromGolden = GoldenVectors.slab.pricing.toPriceConfig()
    assertEquals(fromGolden, fromAndroid)
    listOf(4.3, 4.3000001, 5.3, 9.0).forEach { assertEquals(tierPrice(it, fromGolden.m2PriceTiers), tierPrice(it, fromAndroid.m2PriceTiers)) }
}
```

- [ ] **Step 2: Run, watch them fail. Step 3: Implement** with `BigDecimal.valueOf(d).setScale(2, RoundingMode.UNNECESSARY)` — `UNNECESSARY` throws if a value somehow carries more than two decimals, which is the correct loud failure for a non-`round2`'d double reaching the boundary. `Pricing.toPriceConfig()` maps `BigDecimal.toDouble()` on both the tier boundary and the price; `discountPercent` stays `BigDecimal` via the same `valueOf`. **Step 4:** green. Commit — `Feat(android) · the boundary where engine doubles become Money, losslessly`.

---

## Task 7: The drift guard and the whole-project run

**Files:** test `EngineDriftTest.kt`; modify `android/core/calc/build.gradle.kts` (test inputs).

A regenerated vector file already re-runs the parity suite (Task 1). But a constant edited in `calculation-engine.ts` *without* a regeneration — `PITCH`, a tier price, a threshold — leaves both files agreeing with each other and the Kotlin wrong. The 1d slice built exactly this guard for the dashboard DTO; reuse the technique.

- [ ] **Step 1: Write the failing test.** It reads `precast-crm/src/services/calculation-engine.ts` (declared as a `Test` input the same way as the vectors), strips comments, and asserts the eight physical constants, both tier tables and `BLOCK_UNIT_PRICE` still equal the Kotlin values. Then the same for `DEFAULT_WASTE_PCT`, `DEFAULT_JOINT_MM`, `DEFAULT_GLUE_KG_PER_M2`, `DEFAULT_GLUE_BAG_KG` in `gazoblok-engine.ts`. Prove it can fail: change `PITCH` in the TS locally, run plain `:core:calc:testDebugUnitTest` (not `--rerun-tasks`), watch it go red naming the constant, restore it, and put that in the report.
- [ ] **Step 2:** the whole project — `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` — green; from `precast-crm/`, `npm test`, `npx tsc --noEmit`, `npm run golden:check` clean.
- [ ] **Step 3:** Commit — `Test(android) · the engine cannot drift from the TypeScript silently`.

---

## Self-review

**Spec coverage (§6.4).** Line-by-line port with the same field names → Task 2; `roundN` half-away-from-zero, `tierPrice`, `projectTotal`, `calculateExtrasOnly` → Tasks 1–3; gazoblok engine → Tasks 4–5; parity harness replaying every case with exact equality of all 28 fields → Tasks 2 and 4. **§6.4's `:core:geometry` (the CAD port) is Phase 3 and is not here.**

**The one thing most likely to go wrong.** An implementer who has absorbed this project's "never `Double` for money" rule will reach for `BigDecimal` inside the engine and get parity failures on the seventh decimal. The Global Constraints open with why that rule is suspended inside this module and where it resumes; Task 6 is where it resumes.

**The second.** `roundToInt()` / `Math.rint()` / `RoundingMode.HALF_UP` all look like `Math.round`. Only `Math.round(Double): Long` matches JS on a non-negative operand. Task 1's test has values where each alternative gives a different answer.

**Type consistency.** `PriceConfig`, `PriceTier`, `Pattern`, `SlabInput`, `SlabResult`, `ProjectTotal` are defined in Tasks 1–3 and used unchanged in Tasks 5–7. `GoldenVectors` is defined in Task 1 and gains its `gazoblok` half in Task 5 after Task 4 exports the file. `Money.parse` and the `Pricing` type already exist in `:core:model`.
