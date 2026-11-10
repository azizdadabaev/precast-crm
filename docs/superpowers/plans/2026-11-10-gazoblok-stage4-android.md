# Gazoblok Stage 4 — Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gazoblok orders on the phone — list, detail, load a truck (counts per size, photos, over-load confirm), mark
delivered, delivery photo, record payment — with the web's Stage-1 rules, plus the three server changes the phone needs.

**Architecture:** A new `:feature:gazoblok` module on branch `feat/android-gazoblok` (cut from `feat/android-restyle`)
reads/writes the Stage-1 gazoblok routes over the app's existing Bearer auth. Pure Kotlin mirrors of the web's
quantity and delivery rules drive display and pre-confirms; the server stays the judge. Only the truck load is queued
offline (new `OutboxKind.GAZOBLOK_LOAD`); every other write is online with an `Idempotency-Key`.

**Tech Stack:** Web — Next.js 14 / Prisma / vitest. Android — Kotlin, Compose, Hilt, Retrofit + kotlinx.serialization,
Room outbox + WorkManager, JUnit5 + Robolectric + Roborazzi.

**Spec:** `docs/superpowers/specs/2026-11-10-gazoblok-stage4-android-design.md` (read it first; parent rules in
`docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md` §4).

## Global Constraints

- UI text Uzbek Cyrillic only; order numbers Latin «B-YYYY-MM-NNNN»; Click / Payme written in Latin.
- Payment chips: AWAITING_PAYMENT grey «Тўлов кутилмоқда»; any PENDING_CONFIRMATION payment → orange «Тасдиқланмаган»;
  PARTIALLY_PAID accent «Қисман»; FULLY_PAID green «Тўланган». Use existing designsystem tokens, no new colours.
- Permissions = web keys: `order.view`, `order.edit`, `order.editShipped`, `payment.record`. Hide what the user lacks.
- Money is `Money` (BigDecimal) — never Double/Long. Counts are `Int`. Numbers via `core/ui/format/Formatters.kt`.
- Over-load sheet text verbatim: «Буюртмадан ортиқ: +N та · +X UZS. Мижоз қарзи шунча ошади.»
- An operation may be QUEUED only if its server route is `withIdempotency`-wrapped (Android architecture hard rule).
- **Gradle: ONE build at a time across all worktrees, FOREGROUND, Bash `timeout: 600000`, never `run_in_background`;
  never while the owner is testing on the emulator.** `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`.
- No push to `main` ever; no push of any branch, no APK publish, no deploy until the owner says so.
- Web tasks commit on `feat/gazoblok-renovation` in `.claude/worktrees/gazoblok-reno`; Android tasks commit on
  `feat/android-gazoblok` in `.claude/worktrees/android-gazoblok`. Never edit web files on an Android branch.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A retried load/payment after a dropped connection — must replay, never double-write (W1; A3/A4 send the same key).
2. Over-load raced by another truck: client thought it was within the order, server answers 409
   `OVERLOAD_CONFIRM_REQUIRED` — the sheet must appear with the **server's** numbers and resend (A8 test).
3. A queued offline load refused later (409/422) — the row must show as failed with the server text, not vanish (A4).
4. User with `order.edit` but without `payment.record` — no payment button; delivery photo still works (W2, A9, A10).
5. Closed orders (DELIVERED / CANCELED / closed short) — every write action hidden, detail still complete (A7).

---

## Parallel execution and builds

| Group | Tasks | Notes |
|---|---|---|
| WEB-A | W1 → W2 (serial: both edit `tests/idempotency-routes.test.ts`) | web worktree |
| WEB-B | W3 | parallel with WEB-A |
| AND-0 | A0 | alone, first Android task (baseline build) |
| AND-1 | A1, A2, A5 | code in parallel (different modules) |
| AND-2 | A3, then A4 | A3 needs A1+A2; A4 needs A3 |
| AND-3 | A6, A7, A8 | code in parallel after AND-2 (separate files) |
| AND-4 | A9, A10 | parallel after A7 (both add to the detail screen — merge carefully) |
| AND-5 | A11, then A12 | serial, last |

Web and Android groups are independent until A2 (needs W3's fixtures) and A12 (needs W1–W2 running locally).
**Parallel tasks may be CODED at the same time, but their "Run" steps are executed by the controller one Gradle
invocation at a time** (queue them; an implementer that finds another Gradle daemon busy waits, it never starts a
second build). `npx vitest` runs may overlap with each other but not with a Gradle build on a starved host.

---

### Task W1: Idempotency on the gazoblok write routes (web worktree)

Parallel group: WEB-A

**Files:**
- Modify: `precast-crm/src/app/api/gazoblok/orders/[id]/shipments/route.ts` (POST)
- Modify: `precast-crm/src/app/api/gazoblok/orders/[id]/shipments/[sid]/route.ts` (PATCH)
- Modify: `precast-crm/src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts` (POST)
- Modify: `precast-crm/src/app/api/gazoblok/orders/[id]/route.ts` (PATCH)
- Modify: `precast-crm/src/app/api/gazoblok/upload-receipt/route.ts` (POST)
- Test: `precast-crm/tests/idempotency-routes.test.ts`

**Interfaces:** Produces: those five handlers honour the `Idempotency-Key` header (replay first success for 24 h).

- [ ] **Step 1:** Add the five paths above to `ROUTES` in `tests/idempotency-routes.test.ts`.
- [ ] **Step 2:** `cd precast-crm && npx vitest run tests/idempotency-routes.test.ts` → 5 FAIL.
- [ ] **Step 3:** Wrap each inner handler: `withPermission(..., withIdempotency<Params>(async (req, ctx) => …))` /
  `withAuth<Params>(withIdempotency<Params>(…))`, exactly as `src/app/api/orders/[id]/shipments/[sid]/load/route.ts:33`.
  No behaviour change for requests without the header (web).
- [ ] **Step 4:** Re-run the test → PASS; `npx vitest run tests/gazoblok-*.test.ts` → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `Feat(gazoblok) · write routes replay retries (Idempotency-Key) for the phone`.

### Task W2: Delivery-photo route (web worktree)

Parallel group: WEB-A (after W1)

**Files:**
- Create: `precast-crm/src/app/api/gazoblok/orders/[id]/delivery-proof/route.ts`
- Modify: `precast-crm/src/lib/gazoblok-rules.ts` (add `deliveryProofProblem`)
- Modify: `precast-crm/src/lib/gazoblok-labels.ts` (event label `DELIVERY_PROOF`)
- Test: `precast-crm/tests/gazoblok-rules.test.ts`, `precast-crm/tests/idempotency-routes.test.ts`

**Interfaces:** Produces `POST /api/gazoblok/orders/{id}/delivery-proof` — multipart `file` (one JPG/PNG/WEBP ≤ 8 MB),
`order.edit`, idempotent → `ok({ deliveryProofUrl, deliveryProofUploadedAt })`. Pure
`deliveryProofProblem(o: { status: string }): string | null`.

- [ ] **Step 1:** Tests: `deliveryProofProblem({status:"CANCELED"})` → `"Бекор қилинган буюртмага сурат қўшиб бўлмайди · Order is canceled"`;
  `PLACED`, `IN_PRODUCTION`, `DELIVERED` → `null`. Add the route path to `ROUTES` in the idempotency test.
- [ ] **Step 2:** Run both tests → FAIL.
- [ ] **Step 3:** Implement. Route: `withPermission("order.edit", withIdempotency(...))`; 404 unknown order; 409 from
  `deliveryProofProblem`; validate like `upload-receipt` (`ALLOWED_IMAGE_MIME`, `MAX_IMAGE_SIZE_BYTES`,
  `imageExtFromBytes`); save with `saveImageFromFormData(f, \`gazoblok/orders/${id}\`, \`delivery-${Date.now()}\`)`
  (URL starts `/uploads/gazoblok/`, valid for `GazoblokDeliveryProofUrl`); update `deliveryProofUrl` +
  `deliveryProofUploadedAt`; create `GazoblokOrderEvent` `type:"DELIVERY_PROOF"`, `message:"Етказиш сурати юкланди"`,
  `actorId`. Label `DELIVERY_PROOF: ["Етказиш сурати", "Delivery photo"]`.
- [ ] **Step 4:** Tests PASS; `npx tsc --noEmit`; `npm run lint`.
- [ ] **Step 5:** Commit `Feat(gazoblok) · delivery photo route for the phone`.

### Task W3: Contract fixtures (web worktree)

Parallel group: WEB-B

**Files:**
- Create: `docs/api/gazoblok-contract/list.json`, `detail-open.json`, `detail-overloaded.json`, `detail-closed-short.json`,
  `load-409-overload.json`, `README.md` (how they were captured, date, commit)
- Modify: `.gitattributes` (`docs/api/gazoblok-contract/*.json text eol=lf`)

**Interfaces:** Produces the exact JSON (envelope included) the phone parses in A2.

- [ ] **Step 1:** Start the dev server in this worktree against the **local** DB (memory `reference_local_dev_db`;
  never prod). Create test orders through the web UI only on the local DB.
- [ ] **Step 2:** Capture with `curl -H "Authorization: Bearer <local token from POST /api/auth/login>"`: list, an open
  order with 2 trucks, an over-loaded order, a closed-short order, and a load POST without `confirmOverload` (409 body).
- [ ] **Step 3:** Replace real-looking phones/names with obvious fixtures («Тест Мижоз», `+998900000000`); keep every field.
- [ ] **Step 4:** Commit `Docs(gazoblok) · API contract fixtures for the Android client`.

### Task A0: Branch, worktree, baseline

Parallel group: AND-0

**Files:** none (git + local setup)

- [ ] **Step 1:** `git -C C:\Users\aziz\Downloads\precast-crm\precast-crm worktree add .claude/worktrees/android-gazoblok -b feat/android-gazoblok feat/android-restyle`
  (from its CURRENT head; record the sha in the task log).
- [ ] **Step 2:** Copy `android/local.properties` from `.claude/worktrees/android-phase1b/android/` (git-ignored).
- [ ] **Step 3:** Baseline, foreground, timeout 600000: `cd android && ./gradlew testDebugUnitTest` → all green.
  Any red here is pre-existing: compare against `feat/android-restyle` before blaming Stage 4.

### Task A1: Domain model and pure rules (`:core:model`)

Parallel group: AND-1

**Files:**
- Create: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Gazoblok.kt`
- Create: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/GazoblokRules.kt`
- Test: `android/core/model/src/test/kotlin/uz/etalon/crm/core/model/GazoblokRulesTest.kt`

**Interfaces — Produces:**
```kotlin
enum class GazoblokStatus { PLACED, IN_PRODUCTION, DELIVERED, CANCELED, UNKNOWN }
enum class GazoblokShipmentStatus { PENDING, LOADED, DELIVERED, UNKNOWN }
data class GazoblokLine(val id: String, val productId: String, val label: String, val quantity: Int, val unitPrice: Money)
data class LineQty(val lineId: String, val label: String, val ordered: Int, val loaded: Int, val left: Int, val over: Int)
data class GazoblokShipment(val id: String, val number: Int, val status: GazoblokShipmentStatus,
    val loadedLines: Map<String, Int>?, val photoUrls: List<String>, val loadedAt: Instant?, val deliveredAt: Instant?)
data class GazoblokOrderSummary(...)   // list row: id, number, client name/phone, total, status, paymentState, pendingPaymentCount, placedAt
data class GazoblokOrderDetail(...)    // + lines, quantities, shipments, payments, events, createdByName, overshipAmount,
                                       //   unpaidOverload, refundDue, confirmedPaid, totalPrice, shortClosedAt, reasons, deliveryProofUrl
object GazoblokRules {
    fun lineQuantities(lines: List<GazoblokLine>, shipments: List<Map<String, Int>?>): List<LineQty>
    fun overloadLines(lines: List<GazoblokLine>, otherShipments: List<Map<String, Int>?>, next: Map<String, Int>): List<Pair<String, Int>>
    fun overloadAmount(lines: List<GazoblokLine>, over: List<Pair<String, Int>>): Money
    fun deliverProblem(lines: List<LineQty>, shortClosed: Boolean, openShipments: Int, remaining: Money): String?
    fun isOpen(status: GazoblokStatus, shortClosed: Boolean): Boolean
}
```
`deliverProblem` returns the **Uzbek half** of the web `canDeliver` strings (`src/lib/gazoblok-rules.ts:12`).

- [ ] **Step 1: Failing tests**, ported case-for-case from `tests/gazoblok-quantities.test.ts` (`lineQuantities`,
  `overloadLines`) and `tests/gazoblok-rules.test.ts` (`canDeliver`, `isOpen`). Must include:
  `overloadLines(order 200, others 0, next 400) == [(l1, 200)]`; others already 250 of 200 and next 10 → `[(l1, 10)]`;
  `deliverProblem(left>0, shortClosed=false, …) == "Ҳамма блоклар юкланмаган — юкланг ёки буюртмани қисқа ёпинг"`;
  remaining 0.004 → `null` (same 0.005 tolerance).
- [ ] **Step 2:** `./gradlew :core:model:testDebugUnitTest --tests "*GazoblokRulesTest"` → FAIL (queued, foreground).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `Feat(android) · gazoblok model and the web's quantity/delivery rules`.

### Task A2: DTOs and API (`:core:network`)

Parallel group: AND-1 (needs W3's JSON)

**Files:**
- Create: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/GazoblokDto.kt`
- Modify: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/EtalonApi.kt`
- Create: `android/core/network/src/test/resources/gazoblok/*.json` (copied from W3, byte-identical)
- Test: `android/core/network/src/test/kotlin/uz/etalon/crm/core/network/GazoblokContractTest.kt`

**Interfaces — Produces** (`EtalonApi`):
```kotlin
@GET("/api/gazoblok/orders") suspend fun gazoblokOrders(@Query("q") q: String?, @Query("status") status: String?): List<GazoblokOrderSummaryDto>
@GET("/api/gazoblok/orders/{id}") suspend fun gazoblokOrder(@Path("id") id: String): GazoblokOrderDetailDto
@POST("/api/gazoblok/orders/{id}/shipments") suspend fun gazoblokAddShipment(@Path("id") id: String, @Header("Idempotency-Key") key: String): GazoblokShipmentDto
@Multipart @POST("/api/gazoblok/orders/{id}/shipments/{sid}/load") suspend fun gazoblokLoad(@Path("id") id: String, @Path("sid") sid: String,
    @Part("loadedLines") loadedLines: RequestBody, @Part("confirmOverload") confirmOverload: RequestBody,
    @Part files: List<MultipartBody.Part>, @Header("Idempotency-Key") key: String, @Header("Authorization") authorization: String?): GazoblokShipmentDto
@PATCH("/api/gazoblok/orders/{id}/shipments/{sid}") suspend fun gazoblokDeliverShipment(@Path("id") id: String, @Path("sid") sid: String, @Header("Idempotency-Key") key: String): GazoblokShipmentDto
@PATCH("/api/gazoblok/orders/{id}") suspend fun gazoblokAction(@Path("id") id: String, @Body body: GazoblokActionDto, @Header("Idempotency-Key") key: String): JsonObject
@Multipart @POST("/api/gazoblok/orders/{id}/delivery-proof") suspend fun gazoblokDeliveryProof(@Path("id") id: String, @Part file: MultipartBody.Part, @Header("Idempotency-Key") key: String): GazoblokDeliveryProofDto
@Multipart @POST("/api/gazoblok/upload-receipt") suspend fun gazoblokUploadReceipt(@Part file: MultipartBody.Part, @Header("Idempotency-Key") key: String): UploadedUrlDto
```
`GazoblokActionDto` is a sealed class serialised with `"action"` discriminator: `SetStatus(status, deliveryProofUrl?)`,
`RecordPayment(amount: BigDecimal, method, notes?, receiptUrls)`. Money fields use `BigDecimalSerializer`.
`OverloadConfirmDto(code, extraBlocks: Int, extraAmount: BigDecimal, overload: List<{lineId, extra, label}>)`.

- [ ] **Step 1: Failing tests:** each fixture decodes; detail-overloaded has `quantities` with an `over > 0` row and
  `unpaidOverload > 0`; `load-409-overload.json` decodes to `OverloadConfirmDto` with `code == "OVERLOAD_CONFIRM_REQUIRED"`;
  `RecordPayment` encodes to `{"action":"record_payment","amount":…,"method":"CLICK",…}` (MockWebServer request body).
- [ ] **Step 2:** `./gradlew :core:network:testDebugUnitTest --tests "*GazoblokContractTest"` → FAIL.
- [ ] **Step 3:** Implement; unknown enum strings decode to `UNKNOWN`, unknown JSON keys ignored (existing `EtalonJson`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Feat(android) · gazoblok API contract`.

### Task A3: Repository and mappers (`:core:data`)

Parallel group: AND-2

**Files:**
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/GazoblokRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/mapper/GazoblokMappers.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/OverloadConfirm.kt` (`overloadConfirmOf(e: Throwable): OverloadConfirm?`, like `PhoneChangeConfirm.kt`)
- Test: `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/GazoblokRepositoryTest.kt`, `GazoblokMappersTest.kt`

**Interfaces — Produces:**
```kotlin
interface GazoblokRepository {
    suspend fun list(q: String?, status: GazoblokStatus?): Resource<List<GazoblokOrderSummary>>
    suspend fun detail(id: String): Resource<GazoblokOrderDetail>
    suspend fun addShipment(orderId: String, key: String): Resource<Unit>
    suspend fun load(orderId: String, shipmentId: String, lines: Map<String, Int>, confirmOverload: Boolean, photos: List<File>, key: String): LoadResult
    suspend fun deliverShipment(orderId: String, shipmentId: String, key: String): Resource<Unit>
    suspend fun markDelivered(orderId: String, key: String): Resource<Unit>
    suspend fun uploadDeliveryProof(orderId: String, photo: File, key: String): Resource<Unit>
    suspend fun recordPayment(orderId: String, amount: Money, method: PaymentMethod, notes: String?, receipts: List<File>, key: String): Resource<Unit>
}
sealed interface LoadResult { data object Done; data class NeedsConfirm(val confirm: OverloadConfirm); data class Failed(val error: AppError) }
```
Errors through the existing `ErrorMapper`/`toAppError`; the user message is the server text before « · ».

- [ ] **Step 1: Failing tests** (fake `EtalonApi`): 409 with `code OVERLOAD_CONFIRM_REQUIRED` → `LoadResult.NeedsConfirm`
  carrying the server's `extraBlocks`/`extraAmount`; 409 without that code → `Failed`; `recordPayment` uploads each receipt
  first and passes their URLs in order; the caller's key reaches the request unchanged; mapper sets `pendingPaymentCount`
  and keeps `B-` numbers verbatim.
- [ ] **Step 2:** `./gradlew :core:data:testDebugUnitTest --tests "*Gazoblok*"` → FAIL.
- [ ] **Step 3:** Implement; bind in a Hilt module.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Feat(android) · gazoblok repository with over-load confirm`.

### Task A4: Offline truck load (`:core:model`, `:core:sync`, `:core:data`)

Parallel group: AND-2 (after A3)

**Files:**
- Modify: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Logistics.kt` (`OutboxKind.GAZOBLOK_LOAD`)
- Modify: `android/core/sync/src/main/kotlin/uz/etalon/crm/core/sync/OutboxWorker.kt` (dispatch at the `when` ~line 175)
- Modify: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/GazoblokRepository.kt` (`enqueueLoad`, `pendingLoads(orderId)`)
- Test: `android/core/sync/src/test/kotlin/uz/etalon/crm/core/sync/OutboxWorkerTest.kt`, `GazoblokRepositoryTest.kt`

**Interfaces — Produces:** `suspend fun enqueueLoad(orderId, shipmentId, lines, confirmOverload, photos)`;
`fun pendingLoads(orderId: String): Flow<Map<String /*shipmentId*/, Map<String, Int>>>`. Payload JSON
`{"orderId","shipmentId","loadedLines":{…},"confirmOverload":bool}`; row id = Idempotency-Key. No Room version bump.

- [ ] **Step 1: Failing tests:** worker sends `GAZOBLOK_LOAD` to `gazoblokLoad` with the row id as key and the payload's
  lines; a 409/422 answer marks the row failed with the server text (permanent, not retried); network drop → retry;
  `pendingLoads` returns the queued counts.
- [ ] **Step 2:** `./gradlew :core:sync:testDebugUnitTest :core:data:testDebugUnitTest --tests "*Gazoblok*" --tests "*OutboxWorker*"` → FAIL.
- [ ] **Step 3:** Implement. The load VM enqueues only when the online call fails with a network error.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Feat(android) · gazoblok truck loads queue offline`.

### Task A5: Module, navigation, Orders-tab switch

Parallel group: AND-1

**Files:**
- Create: `android/feature/gazoblok/build.gradle.kts` (copy `feature/payments/build.gradle.kts` plugins/deps; namespace `uz.etalon.crm.feature.gazoblok`; depends on `:feature:capture`)
- Modify: `android/settings.gradle.kts` (include `:feature:gazoblok`), `android/app/build.gradle.kts` (dependency)
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/nav/Keys.kt`, `nav/EtalonNavHost.kt`
- Modify: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/list/OrdersListScreen.kt` (segment «Плита | Газоблок»)
- Test: `android/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/OrdersListScreenTest.kt`

**Interfaces — Produces:** keys `GazoblokOrders`, `GazoblokOrderDetail(id)`, `GazoblokLoad(orderId, shipmentId)`,
`GazoblokDeliveryProof(orderId)`, `GazoblokRecordPayment(orderId)`; `OrdersListScreen(onOpenGazoblok: () -> Unit)`.

- [ ] **Step 1: Failing test:** the «Газоблок» segment exists and calls `onOpenGazoblok`; placeholder route renders.
- [ ] **Step 2:** `./gradlew :feature:orders:testDebugUnitTest --tests "*OrdersListScreenTest"` → FAIL.
- [ ] **Step 3:** Implement with an empty `GazoblokOrdersRoute` placeholder.
- [ ] **Step 4:** PASS; `./gradlew :app:assembleDebug` succeeds.
- [ ] **Step 5:** Commit `Feat(android) · gazoblok module and the Orders-tab switch`.

### Task A6: List screen

Parallel group: AND-3

**Files:** Create `android/feature/gazoblok/src/main/kotlin/uz/etalon/crm/feature/gazoblok/list/GazoblokListScreen.kt`,
`GazoblokListViewModel.kt`, `PaymentChip.kt`; Test `…/src/test/kotlin/…/gazoblok/GazoblokListViewModelTest.kt`, `PaymentChipTest.kt`

- [ ] **Step 1: Failing tests:** `paymentChipOf(state=PARTIALLY_PAID, pending=1)` → orange «Тасдиқланмаган»;
  `(AWAITING_PAYMENT, 0)` → grey «Тўлов кутилмоқда»; VM: search debounced, status segment re-queries, error → Uzbek
  message + «Қайта уриниш»; empty → «Газоблок буюртмалари йўқ».
- [ ] **Step 2:** `./gradlew :feature:gazoblok:testDebugUnitTest --tests "*GazoblokList*" --tests "*PaymentChip*"` → FAIL.
- [ ] **Step 3:** Implement per spec §4.2.
- [ ] **Step 4:** PASS. **Step 5:** Commit `Feat(android) · gazoblok orders list`.

### Task A7: Detail screen

Parallel group: AND-3

**Files:** Create `…/gazoblok/detail/GazoblokDetailScreen.kt`, `GazoblokDetailViewModel.kt`, `QuantitiesTable.kt`,
`TrucksCard.kt`, `HistoryList.kt`; Test `GazoblokDetailViewModelTest.kt`

- [ ] **Step 1: Failing tests:** sections per spec §4.3 present/absent: over-load block only when `overshipAmount > 0`;
  refund block only when `refundDue > 0`; closed order → no write actions; «+ Машина қўшиш» only with `order.edit` on an
  open order; correct-delivered-truck only with `order.editShipped`; events render «Ким · нима · 10.11.2026 14:32»
  (Asia/Tashkent).
- [ ] **Step 2:** `./gradlew :feature:gazoblok:testDebugUnitTest --tests "*GazoblokDetail*"` → FAIL.
- [ ] **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `Feat(android) · gazoblok order detail`.

### Task A8: Load a truck + over-load sheet

Parallel group: AND-3

**Files:** Create `…/gazoblok/load/GazoblokLoadScreen.kt`, `GazoblokLoadViewModel.kt`, `OverloadSheet.kt`;
Test `GazoblokLoadViewModelTest.kt`

- [ ] **Step 1: Failing tests:** prefill from the truck's `loadedLines`; hint «Буюртма 400 · бошқа машиналарда 150 ·
  қолди 250» counts queued loads (`pendingLoads`) as other trucks; local over-load → sheet text
  «Буюртмадан ортиқ: +200 та · +X UZS. Мижоз қарзи шунча ошади.» before any request; confirm → request has
  `confirmOverload=true`; server `NeedsConfirm` (race) → sheet with the **server's** numbers → resend; network error →
  enqueued + «Навбатга қўйилди»; same Idempotency-Key reused for the resend after a dropped connection.
- [ ] **Step 2:** `./gradlew :feature:gazoblok:testDebugUnitTest --tests "*GazoblokLoad*"` → FAIL.
- [ ] **Step 3:** Implement; photos through `:feature:capture` `PhotoCapture`.
- [ ] **Step 4:** PASS. **Step 5:** Commit `Feat(android) · load a gazoblok truck with over-load confirm`.

### Task A9: Deliver — truck, delivery photo, order «Етказилди»

Parallel group: AND-4

**Files:** Create `…/gazoblok/deliver/GazoblokDeliveryProofScreen.kt`, `GazoblokDeliveryProofViewModel.kt`;
Modify `GazoblokDetailScreen.kt`, `GazoblokDetailViewModel.kt`; Test `GazoblokDeliverTest.kt`

- [ ] **Step 1: Failing tests:** truck «Етказилди» enabled only on LOADED; PENDING shows «Аввал юкланг»; order
  «Етказилди» disabled with `GazoblokRules.deliverProblem` text (+ «Қолди: X UZS» when money owed); server 409 text
  replaces the local reason; delivery photo allowed on DELIVERED/open, hidden on CANCELED; success refreshes detail.
- [ ] **Step 2:** `./gradlew :feature:gazoblok:testDebugUnitTest --tests "*GazoblokDeliver*"` → FAIL.
- [ ] **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `Feat(android) · deliver gazoblok trucks and orders`.

### Task A10: Record payment

Parallel group: AND-4

**Files:** Create `…/gazoblok/payment/GazoblokPaymentScreen.kt`, `GazoblokPaymentViewModel.kt`;
Modify `GazoblokDetailScreen.kt`; Test `GazoblokPaymentViewModelTest.kt`

- [ ] **Step 1: Failing tests:** «7,5» and «1 554 000» parse; amount > Қолди → hint «Қолдиқдан кўп» and save disabled;
  method chips labelled Нақд / Банк ўтказмаси / Click / Payme / Бошқа; hidden without `payment.record`; server ceiling
  refusal shown verbatim (Uzbek half); one key per save attempt, reused on retry; receipts uploaded before the PATCH.
- [ ] **Step 2:** `./gradlew :feature:gazoblok:testDebugUnitTest --tests "*GazoblokPayment*"` → FAIL.
- [ ] **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `Feat(android) · record a gazoblok payment`.

### Task A11: Screenshots, full suite, build

Parallel group: AND-5

**Files:** Test `android/feature/gazoblok/src/test/kotlin/…/gazoblok/GazoblokScreenshotTest.kt` + recorded PNGs

- [ ] **Step 1:** Roborazzi tests (fixed clock, like `OrderDetailScreenshotTest`): list, detail open / over-loaded /
  closed short / canceled, load screen, over-load sheet, payment screen — light and dark; worst cases: 60-char client
  name, 0 trucks, 9-digit sums, 6 sizes.
- [ ] **Step 2:** Record: `./gradlew :feature:gazoblok:recordRoborazziDebug`; look at every PNG, fix layout faults.
- [ ] **Step 3:** Full run, foreground: `./gradlew testDebugUnitTest` → all green (Stage 4 + pre-existing).
- [ ] **Step 4:** `./gradlew :app:assembleDebug` succeeds.
- [ ] **Step 5:** Commit `Test(android) · gazoblok screenshots`.

### Task A12: Emulator walk (owner-facing)

Parallel group: AND-5 (last; needs W1–W2 running locally)

- [ ] **Step 1:** Run the web dev server from `gazoblok-reno` on the local DB; confirm no owner emulator session is
  active; cold-boot the AVD if swap is high (`adb shell top -n 1 -b | head -4`).
- [ ] **Step 2:** `./gradlew :app:installDebug` (foreground).
- [ ] **Step 3:** Walk: truck 1 short, truck 2 over (sheet), airplane-mode load (queued, then drains), deliver both
  trucks, delivery photo, Click payment as an operator (orange «Тасдиқланмаган»), confirm on web, order «Етказилди».
  Screenshot each screen.
- [ ] **Step 4:** Send the screenshots to the owner. **Stop.** No merge into `feat/android-restyle`, no push, no APK
  publish until the owner approves and web Stage 1 + W1–W3 are deployed.
