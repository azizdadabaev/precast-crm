# Android Phase 1c — Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the money path on the phone — record a payment against an order, attach receipt photos, and let an owner work the confirmation queue and resolve discrepancies — so Phase 1's "zero money-math divergence" exit criterion can finally be tested.

**Architecture:** A new `:feature:payments` module over new endpoints in `:core:network` and a new `PaymentsRepository` / `DiscrepanciesRepository` in `:core:data`, following the shape Phase 1b established for logistics. The server is unchanged apart from documenting two already-existing discrepancy routes. Only receipt uploads may be queued offline; recording, confirming, rejecting and resolving are online-only, because only the two upload routes are `withIdempotency`-wrapped.

**Tech Stack:** Kotlin 2.4, Jetpack Compose (BOM 2026.08.00), Material 3, Hilt 2.60.1, Retrofit 3.0.0, Room 2.8.4, Navigation 3, WorkManager, Gradle 9.6.0 / AGP 9.4.0 (Kotlin built in — never apply `org.jetbrains.kotlin.android`), JDK 25 (Android Studio JBR). compileSdk 37 / minSdk 36 / targetSdk 36 via `uz.etalon.buildlogic.AndroidConfig`.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` — §5.6 (payments and discrepancies), §5.1 (shell and navigation), §6.5 (formatting).

**Base:** branch `feat/android-phase1c` at `70ded4a`, worktree `.claude/worktrees/android-phase1b`.

---

## Global Constraints

- **Every user-visible string is Uzbek Cyrillic.** No English, no Latin-script Uzbek, no Russian. A validation message written inline in a ViewModel is user-visible. The server sends bilingual `"Uzbek · English"` errors; `ApiException.uzbekMessage` takes the half before `" · "`.
- **Money is the `Money` value class over `BigDecimal`.** Never `Double`, never `Long`. Request bodies here send amounts as bare JSON numbers (`z.coerce.number()` server-side), so they serialise through the existing `BigDecimalSerializer`, which emits `JsonUnquotedLiteral(value.toPlainString())`. Response money arrives as JSON strings and maps via `Money.parse`.
- **The outbox rule.** An operation may be queued **if and only if** its server route is wrapped in `withIdempotency`. In this slice exactly two qualify: `POST /api/payments/upload-receipt` and `POST /api/payments/{id}/receipts`. Recording, confirming, rejecting, handing over and resolving are **online-only** and must fail fast with an Uzbek message rather than being queued.
- **Queued uploads carry a pinned token.** `OutboxWorker` resolves the bearer once per drain and passes it explicitly; every multipart endpoint it calls declares `@Header("Authorization")`, and `AuthInterceptor` skips its own write when that header is already present.
- **Permissions are real, not cosmetic.** `payment.view` to read, `payment.record` to record and to upload receipts, `payment.confirm` to confirm or reject, `discrepancy.view` and `discrepancy.resolve` for discrepancies. Gate nav registration the way `Drivers` is gated, and refuse in the repository as well — a 403 on a queued route becomes a permanently failed row.
- **Never swallow `CancellationException`** — use the existing `runCatchingCancellable`.
- No secrets; **no logging of tokens, cash figures, photos or client data**.
- Touch targets at least 48dp. Tabular figures on every number (`EtalonType.monoBody` / `monoTitle` / `monoDisplay`). Every colour from a real theme token; no hard-coded hex; both light and dark legible.
- A list screen surfaces Loading and Error through a retry-capable `ErrorBanner`, never shows an empty state while loading or while an error is displayed, and guards double submission at both the ViewModel and the button.

---

## Server contracts (read before writing any DTO)

Verified against the route sources on this branch. Do not guess field names.

| Route | Permission | Idempotent | Body / query |
|---|---|---|---|
| `GET /api/payments` | `payment.view` | — | `?orderId=&status=` |
| `POST /api/payments` | `payment.record` | **no** | `PaymentRecordSchema` |
| `POST /api/payments/{id}/confirm` | `payment.confirm` | no | `PaymentConfirmSchema` |
| `POST /api/payments/{id}/reject` | `payment.confirm` | no | `{ reason: string 3..500 }` |
| `POST /api/payments/{id}/handover` | `payment.record` | no | empty |
| `POST /api/payments/upload-receipt` | `payment.record` | **yes** | multipart `file` → `{ url }` |
| `POST /api/payments/{id}/receipts` | `payment.record` | **yes** | multipart `file` → `{ id, imageUrl }` |
| `GET /api/discrepancies` | `discrepancy.view` | — | `?status=` |
| `PATCH /api/discrepancies/{id}` | `discrepancy.resolve` | no | `{ status, resolutionNote ≥5 }` |

**`PaymentRecordSchema`** (`src/lib/validation.ts:392`):
```
orderId              string, required
amount               number, positive          ← bare JSON number
method               CASH | BANK_TRANSFER | CLICK | PAYME | OTHER
source               IN_OFFICE_CASH | BANK_OR_ONLINE | FROM_DRIVER_AT_DELIVERY   (default IN_OFFICE_CASH)
handOverNow          boolean (default false)
collectedByDriverId  string?          
notes                string ≤500?
receiptUrls          string[] ≤10 (default [])
paidOn               string?          
```
Cross-field rules the server enforces, which the client must mirror so a valid form cannot 422:
- `source == FROM_DRIVER_AT_DELIVERY` **requires** `collectedByDriverId`.
- `collectedByDriverId` **only** with `source == FROM_DRIVER_AT_DELIVERY`.
- `source == BANK_OR_ONLINE` **cannot** set `handOverNow`.

**The recordable cap.** The server refuses `amount > totalPrice − confirmedPaid − pendingSum − writeOffAmount`, where `pendingSum` is every `PENDING_CONFIRMATION` payment on the order. **`OrderDetail.remaining` in `:core:model` does NOT subtract pending**, so using it as the cap produces a guaranteed 422 whenever a payment is awaiting confirmation. Task 2 adds a distinct `recordableRemaining`.

**`PaymentConfirmSchema`** (`validation.ts:427`): `amount?`, `adjustmentNote ≤500?`, `discrepancyAction? TRACK|DISCOUNT|WRITEOFF`, `discrepancyNote 5..500?`. The route additionally requires:
- changing the amount ⇒ `adjustmentNote` of at least 5 characters;
- a shortfall ⇒ `discrepancyAction` **and** `discrepancyNote` of at least 5 characters.

**Shortfall is narrower than it looks.** It exists only when the payment has a `collectedById` (driver-collected) **and** the order's dispatch has an `expectedCollection` **and** the final amount is below it. In-office cash and bank transfers can never produce one, and the confirm sheet must not ask for a discrepancy action on those.

**Auto-confirm.** A recorder who holds `payment.confirm` creates the row already `CONFIRMED`; everyone else lands `PENDING_CONFIRMATION`. The record sheet says which will happen before the user submits.

**`DiscrepancyStatus`**: `OPEN`, `RESOLVED_RECOVERED`, `RESOLVED_DISCOUNT`, `RESOLVED_WRITEOFF`, `DISPUTED`.

---

## File structure

**Server (TypeScript)**
- Modify: `precast-crm/src/lib/openapi/registry.ts` — register the two discrepancy routes.
- Modify: `precast-crm/tests/openapi.test.ts` — assert the new path count.

**`:core:model`** — Modify `Enums.kt` (add `PaymentSource`, `DiscrepancyStatus`), create `Payment.kt` (`PaymentRecordInput`, `PaymentQueueItem`, `CustodyChain`, `Discrepancy`), modify `Order.kt` (add `recordableRemaining`).

**`:core:network`** — Modify `EtalonApi.kt` (9 endpoints), create `dto/PaymentDto.kt`, `dto/DiscrepancyDto.kt`.

**`:core:database`** — Modify `OutboxEntity.kt` (two new kinds), `Migrations.kt` (version 4 → 5).

**`:core:sync`** — Modify `OutboxWorker.kt` (two new exhaustive `when` branches).

**`:core:data`** — Create `PaymentsRepository.kt`, `DiscrepanciesRepository.kt`, `PaymentMappers.kt`; modify `OutboxRepository.kt` (enqueue receipts).

**`:core:designsystem`** — Modify `StatusChip.kt` (payment-status and discrepancy-status mappings + tests), create `components/CustodyChain.kt`.

**`:feature:payments`** (new module) — `record/RecordPaymentViewModel.kt`, `record/RecordPaymentScreen.kt`, `queue/ConfirmQueueViewModel.kt`, `queue/ConfirmQueueScreen.kt`, `queue/ConfirmSheet.kt`, `discrepancies/DiscrepanciesViewModel.kt`, `discrepancies/DiscrepanciesScreen.kt`, `res/values/strings.xml`.

**`:app`** — Modify `nav/Keys.kt`, `nav/EtalonNavHost.kt`, `nav/StartKey.kt`, `shell/Destinations.kt` wiring.

---

## Task 1: Document the discrepancy routes in the OpenAPI contract

The six payment routes are already registered (Phase 0). The two discrepancy routes are not, and the Android client is generated against this contract.

**Files:**
- Modify: `precast-crm/src/lib/openapi/registry.ts`
- Modify: `precast-crm/tests/openapi.test.ts`

**Interfaces:**
- Produces: two new paths in `docs/api/openapi.json` — `/api/discrepancies` (GET) and `/api/discrepancies/{id}` (PATCH).

- [ ] **Step 1: Read how the neighbouring routes are registered**

Read `registry.ts` around lines 127-132 (the payment block) and note the exact helper usage: `security: bearer`, `json(...)`, `envelope(...)`, `errors`.

- [ ] **Step 2: Write the failing count assertion**

In `precast-crm/tests/openapi.test.ts`, find the existing path-count assertion and raise the expected number by exactly 2. Run it and watch it fail with the old count.

Run: `cd precast-crm && npx vitest run tests/openapi.test.ts`

- [ ] **Step 3: Register both routes**

Add beside the payment block, importing `DiscrepancyUpdateSchema` and `DiscrepancyStatusEnum` from `@/lib/validation`:

```ts
registry.registerPath({ method: "get", path: "/api/discrepancies", security: bearer, request: { query: z.object({ status: DiscrepancyStatusEnum.optional() }) }, responses: { 200: { description: "Discrepancies", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/discrepancies/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(DiscrepancyUpdateSchema) }, responses: { 200: { description: "Updated", ...json(envelope(Any)) }, ...errors } });
```

- [ ] **Step 4: Regenerate and verify**

Run: `cd precast-crm && npm run openapi:calc 2>/dev/null || npx tsx scripts/generate-openapi.ts` then `npm run openapi:check`
Expected: "openapi.json is up to date". Then `npx vitest run tests/openapi.test.ts` passes, and `npx tsc --noEmit` is clean.

**Note:** `docs/api/openapi.json` is pinned `text eol=lf` in `.gitattributes`. If `openapi:check` reports staleness on a clean tree, that pin is the thing to verify before touching content.

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/lib/openapi/registry.ts precast-crm/tests/openapi.test.ts docs/api/openapi.json
git commit -m "Feat(api) · document the discrepancy routes the Android app calls"
```

---

## Task 2: Payment domain types in `:core:model`

**Files:**
- Modify: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Enums.kt`
- Create: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Payment.kt`
- Modify: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Order.kt`
- Test: `android/core/model/src/test/kotlin/uz/etalon/crm/core/model/RecordableRemainingTest.kt`

**Interfaces:**
- Consumes: `Money`, `PaymentMethod`, `PaymentStatus`, `PaymentLine`, `OrderDetail` (all existing).
- Produces: `PaymentSource`, `DiscrepancyStatus`, `PaymentRecordInput`, `PaymentQueueItem`, `CustodyChain`, `Discrepancy`, `OrderDetail.recordableRemaining`.

- [ ] **Step 1: Write the failing test for the recordable cap**

The server's cap subtracts pending payments; the existing `remaining` does not. This test pins the difference.

```kotlin
package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RecordableRemainingTest {
    @Test fun `what may still be recorded excludes payments already awaiting confirmation`() {
        val d = detailWith(total = "10000000", confirmed = "4000000", writeOff = "0", pending = listOf("1500000"))
        // Display remaining ignores the queue: 10 000 000 − 4 000 000 − 0
        assertEquals(Money.parse("6000000"), d.remaining)
        // The server would refuse anything above 10M − 4M − 1.5M − 0
        assertEquals(Money.parse("4500000"), d.recordableRemaining)
    }

    @Test fun `a write-off reduces both, and neither ever goes negative`() {
        val d = detailWith(total = "5000000", confirmed = "4000000", writeOff = "900000", pending = listOf("500000"))
        assertEquals(Money.parse("100000"), d.remaining)
        assertEquals(Money.ZERO, d.recordableRemaining)   // 5M − 4M − 0.9M − 0.5M is negative
    }

    @Test fun `a rejected payment does not hold back the balance`() {
        val d = detailWith(total = "1000000", confirmed = "0", writeOff = "0", pending = emptyList(), rejected = listOf("400000"))
        assertEquals(Money.parse("1000000"), d.recordableRemaining)
    }
}
```

Write `detailWith(...)` as a private helper in the same file that builds an `OrderDetail` with the given totals and a `PaymentLine` per amount — `PENDING_CONFIRMATION` for `pending`, `REJECTED` for `rejected`. Read the real `OrderDetail` and `PaymentLine` constructors first and fill every field; do not guess.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd android && ./gradlew.bat :core:model:testDebugUnitTest --no-daemon`
Expected: FAIL — `recordableRemaining` is unresolved.

- [ ] **Step 3: Add the enums**

In `Enums.kt`, matching the existing style exactly (every enum there has an `UNKNOWN` member and a `from` companion that falls back to it — follow that, so a future server value cannot crash a decode):

```kotlin
enum class PaymentSource { IN_OFFICE_CASH, BANK_OR_ONLINE, FROM_DRIVER_AT_DELIVERY, UNKNOWN;
    companion object { fun from(s: String?) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }

enum class DiscrepancyStatus { OPEN, RESOLVED_RECOVERED, RESOLVED_DISCOUNT, RESOLVED_WRITEOFF, DISPUTED, UNKNOWN;
    companion object { fun from(s: String?) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
```

- [ ] **Step 4: Add `recordableRemaining`**

In `Order.kt`, beside the existing `remaining`:

```kotlin
/**
 * What the server will still accept on a new payment:
 * total − confirmed − writeOff − everything already awaiting confirmation.
 * [remaining] deliberately does not subtract the queue — it is what the customer
 * still owes — so using it as a form cap 422s whenever a payment is pending.
 * Mirrors the check in src/app/api/payments/route.ts.
 */
val recordableRemaining: Money
    get() = (summary.totalPrice - summary.confirmedPaid - writeOffAmount - pendingAmount).coerceAtLeastZero()
```

- [ ] **Step 5: Create the payment domain types**

`Payment.kt`:

```kotlin
package uz.etalon.crm.core.model

import java.time.Instant

/** What the record-payment form collects. Mirrors PaymentRecordSchema. */
data class PaymentRecordInput(
    val orderId: String,
    val amount: Money,
    val method: PaymentMethod,
    val source: PaymentSource,
    val handOverNow: Boolean = false,
    val collectedByDriverId: String? = null,
    val notes: String? = null,
    val receiptUrls: List<String> = emptyList(),
    val paidOn: String? = null,
)

/** Who touched the money, in order. Rendered as the custody chain on a queue card. */
data class CustodyChain(
    val collectedBy: String?,
    val recordedBy: String?,
    val handedOverTo: String?,
    val confirmedBy: String?,
)

/** One row of GET /api/payments, with the order context the confirm queue shows. */
data class PaymentQueueItem(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val amount: Money,
    val originalAmount: Money?,
    val method: PaymentMethod,
    val status: PaymentStatus,
    val recordedAt: Instant,
    val paidOn: Instant?,
    val expectedCollection: Money?,
    val fromDriver: Boolean,
    val custody: CustodyChain,
    val receiptUrls: List<String>,
    val rejectionReason: String?,
) {
    /** Only a driver-collected payment measured against a dispatch can be short. */
    val shortfall: Money
        get() = if (fromDriver && expectedCollection != null) (expectedCollection - amount).coerceAtLeastZero() else Money.ZERO
}

data class Discrepancy(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val driverName: String?,
    val expectedAmount: Money,
    val receivedAmount: Money,
    val status: DiscrepancyStatus,
    val reportedAt: Instant,
    val resolutionNote: String?,
) {
    val gap: Money get() = (expectedAmount - receivedAmount).coerceAtLeastZero()
}
```

- [ ] **Step 6: Run the tests**

Run: `cd android && ./gradlew.bat :core:model:testDebugUnitTest --no-daemon`
Expected: PASS, all three cases.

- [ ] **Step 7: Commit**

```bash
git add android/core/model
git commit -m "Feat(android) · payment domain types and the cap the server actually enforces"
```

---

## Task 3: Payment and discrepancy endpoints in `:core:network`

**Files:**
- Modify: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/EtalonApi.kt`
- Create: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/PaymentDto.kt`
- Create: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/DiscrepancyDto.kt`
- Test: `android/core/network/src/test/kotlin/uz/etalon/crm/core/network/PaymentApiTest.kt`

**Interfaces:**
- Consumes: `BigDecimalSerializer`, `EtalonJson`, the existing `ApiException` / envelope handling.
- Produces: the nine `EtalonApi` methods listed in the contracts table; `PaymentDto`, `ReceiptDto`, `ReceiptUrlDto`, `DiscrepancyDto`, `PaymentRecordRequest`, `PaymentConfirmRequest`, `PaymentRejectRequest`, `DiscrepancyUpdateRequest`.

- [ ] **Step 1: Read the existing logistics endpoints first**

Read `EtalonApi.kt`'s four multipart methods. They are the template: `@Multipart`, `@Header("Idempotency-Key")`, `@Header("Authorization")`, `@Part file: MultipartBody.Part`. The `Authorization` header is not optional — the outbox worker pins the token and `AuthInterceptor` steps aside when the header is present.

- [ ] **Step 2: Write the failing wire tests**

`PaymentApiTest.kt`, following `LogisticsApiTest`'s MockWebServer shape. These four cases matter most:

```kotlin
@Test fun `recording a payment sends the amount as a bare exact decimal`() = runTest {
    server.enqueue(MockResponse().setBody("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"1234.56","method":"CASH","status":"PENDING_CONFIRMATION","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
    api.recordPayment(PaymentRecordRequest(orderId = "o1", amount = BigDecimal("1234.56"), method = "CASH", source = "IN_OFFICE_CASH"))
    val sent = server.takeRequest().body.readUtf8()
    assertTrue(sent.contains("\"amount\":1234.56"), sent)      // bare, unquoted, exact
    assertFalse(sent.contains("\"amount\":\"1234.56\""), sent)
}

@Test fun `a very large amount is not rendered in scientific notation`() = runTest {
    server.enqueue(MockResponse().setBody("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"0","method":"CASH","status":"CONFIRMED","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
    api.recordPayment(PaymentRecordRequest(orderId = "o1", amount = BigDecimal("999999999999.99"), method = "CASH", source = "IN_OFFICE_CASH"))
    assertTrue(server.takeRequest().body.readUtf8().contains("\"amount\":999999999999.99"))
}

@Test fun `a receipt upload carries the caller's pinned token and its idempotency key`() = runTest {
    server.enqueue(MockResponse().setBody("""{"ok":true,"data":{"id":"r1","imageUrl":"/uploads/receipts/x.jpg"}}"""))
    api.addPaymentReceipt("p1", "key-123", "Bearer tok", filePart())
    val rec = server.takeRequest()
    assertEquals("/api/payments/p1/receipts", rec.path)
    assertEquals("key-123", rec.getHeader("Idempotency-Key"))
    assertEquals("Bearer tok", rec.getHeader("Authorization"))
}

@Test fun `an ok-false body on a 200 is still a failure`() = runTest {
    server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":false,"error":"Сумма ортиқча · Amount exceeds remaining"}"""))
    val t = assertThrows<ApiException> { api.recordPayment(PaymentRecordRequest("o1", BigDecimal("1"), "CASH", "IN_OFFICE_CASH")) }
    assertEquals("Сумма ортиқча", t.uzbekMessage)
}
```

Write `filePart()` as a small helper building a `MultipartBody.Part` from a byte array, mirroring `LogisticsApiTest`.

- [ ] **Step 3: Run and watch it fail**

Run: `cd android && ./gradlew.bat :core:network:testDebugUnitTest --no-daemon`
Expected: FAIL — unresolved references.

- [ ] **Step 4: Add the request and response DTOs**

`PaymentDto.kt`. Money on the **request** side is `BigDecimal` with the serializer; money on the **response** side arrives as a JSON string and stays a `String` here, mapped to `Money` in `:core:data`.

```kotlin
@Serializable
data class PaymentRecordRequest(
    val orderId: String,
    @Serializable(with = BigDecimalSerializer::class) val amount: BigDecimal,
    val method: String,
    val source: String,
    val handOverNow: Boolean = false,
    val collectedByDriverId: String? = null,
    val notes: String? = null,
    val receiptUrls: List<String> = emptyList(),
    val paidOn: String? = null,
)

@Serializable
data class PaymentConfirmRequest(
    @Serializable(with = BigDecimalSerializer::class) val amount: BigDecimal? = null,
    val adjustmentNote: String? = null,
    val discrepancyAction: String? = null,
    val discrepancyNote: String? = null,
)

@Serializable data class PaymentRejectRequest(val reason: String)
@Serializable data class ReceiptUrlDto(val url: String)
@Serializable data class ReceiptDto(val id: String, val imageUrl: String)
```

`PaymentDto` mirrors what `GET /api/payments` includes: `id`, `orderId`, `amount` (String), `originalAmount` (String?), `method`, `status`, `recordedAt`, `paidOn`, `rejectionReason`, the four nested actor objects (`collectedByDriver`, `recordedBy`, `handedOverTo`, `confirmedBy` — each `{ id, name }`, nullable), `receipts: List<ReceiptDto>`, and a nested `order` carrying `orderNumber`, `client { name }` and `dispatch { expectedCollection }?`. **Give every nested actor and the dispatch a default of `null`** — the route's `include` returns them absent, not null, on rows that never had them.

- [ ] **Step 5: Add the nine endpoints**

```kotlin
@GET("api/payments")
suspend fun payments(@Query("orderId") orderId: String? = null, @Query("status") status: String? = null): List<PaymentDto>

@POST("api/payments")
suspend fun recordPayment(@Body body: PaymentRecordRequest): PaymentDto

@POST("api/payments/{id}/confirm")
suspend fun confirmPayment(@Path("id") id: String, @Body body: PaymentConfirmRequest): PaymentDto

@POST("api/payments/{id}/reject")
suspend fun rejectPayment(@Path("id") id: String, @Body body: PaymentRejectRequest): PaymentDto

@POST("api/payments/{id}/handover")
suspend fun handoverPayment(@Path("id") id: String): PaymentDto

@Multipart @POST("api/payments/upload-receipt")
suspend fun uploadReceipt(
    @Header("Idempotency-Key") idempotencyKey: String,
    @Header("Authorization") authorization: String,
    @Part file: MultipartBody.Part,
): ReceiptUrlDto

@Multipart @POST("api/payments/{id}/receipts")
suspend fun addPaymentReceipt(
    @Path("id") id: String,
    @Header("Idempotency-Key") idempotencyKey: String,
    @Header("Authorization") authorization: String,
    @Part file: MultipartBody.Part,
): ReceiptDto

@GET("api/discrepancies")
suspend fun discrepancies(@Query("status") status: String? = null): List<DiscrepancyDto>

@PATCH("api/discrepancies/{id}")
suspend fun updateDiscrepancy(@Path("id") id: String, @Body body: DiscrepancyUpdateRequest): DiscrepancyDto
```

- [ ] **Step 6: Run the tests**

Run: `cd android && ./gradlew.bat :core:network:testDebugUnitTest :core:network:assembleDebug --no-daemon`
Expected: PASS, including every pre-existing test.

- [ ] **Step 7: Commit**

```bash
git add android/core/network
git commit -m "Feat(android) · payment and discrepancy endpoints"
```

---

## Task 4: Two new outbox kinds for receipt uploads

Only the two upload routes are idempotency-wrapped, so only they may be queued. The kind enum is the type-level enforcement of the outbox boundary — the worker's `when` has no `else`, so adding a member is a compile error until it is handled.

**Files:**
- Modify: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/entity/OutboxEntity.kt`
- Modify: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/Migrations.kt`
- Modify: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/EtalonDatabase.kt` (version 4 → 5)
- Modify: `android/core/sync/src/main/kotlin/uz/etalon/crm/core/sync/OutboxWorker.kt`
- Test: `android/core/database/src/test/kotlin/uz/etalon/crm/core/database/EtalonDatabaseMigrationTest.kt`

**Interfaces:**
- Produces: `OutboxKind.UPLOAD_RECEIPT`, `OutboxKind.ADD_PAYMENT_RECEIPT`; `MIGRATION_4_5`.

- [ ] **Step 1: Read how the schema is versioned now**

`fallbackToDestructiveMigration` was deliberately removed in Phase 1b, because the outbox is the only durable copy of un-sent photos and cash figures. **A version bump with no `Migration` in `ALL_MIGRATIONS` now fails at open.** Read `Migrations.kt` and `EtalonDatabaseMigrationTest` before touching the version.

- [ ] **Step 2: Write the failing migration test**

Extend `EtalonDatabaseMigrationTest` with a 4 → 5 case shaped exactly like the existing 3 → 4 one: create at 4 via `MigrationTestHelper`, insert an outbox row carrying a payload, run `runMigrationsAndValidate(5, listOf(MIGRATION_4_5))`, and assert the row's `ownerId`, `filePath`, `payloadJson` and `state` all survive.

- [ ] **Step 3: Run it and watch it fail**

Run: `cd android && ./gradlew.bat :core:database:testDebugUnitTest --no-daemon`
Expected: FAIL — `MIGRATION_4_5` unresolved.

- [ ] **Step 4: Add the kinds and the migration**

`kind` is stored as a `String` precisely so a new value needs no column change, and `OutboxKind.from` already falls back to `UNKNOWN`. So `MIGRATION_4_5` has no DDL to run and exists to state that intent:

```kotlin
/** 4 → 5 adds two OutboxKind values. `kind` is a String column and unknown values
 *  already read back as UNKNOWN, so no table changes — but the migration must exist,
 *  because the destructive fallback is gone and a missing one fails at open. */
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) { /* no schema change */ }
}
```

Add both members to `OutboxKind` **before** `UNKNOWN`, and bump `@Database(version = 5)`. Export the new schema JSON — it is pinned `text eol=lf` in `.gitattributes`.

- [ ] **Step 5: Handle them in the worker**

The `when` in `OutboxWorker.send` is exhaustive with no `else`, so it will not compile until both are handled. `UPLOAD_RECEIPT` posts to `upload-receipt` and its returned URL is of no further use to the worker — the payment it was destined for has already been recorded with its own receipts, or the operator attaches it explicitly. `ADD_PAYMENT_RECEIPT` posts to `payments/{paymentId}/receipts`.

Both take the row's id as the `Idempotency-Key` and the drain's pinned `authorization`. Both require a file: a row of either kind whose file has vanished must fail permanently with the existing Uzbek missing-file message, not retry forever.

Refresh the order after a successful `ADD_PAYMENT_RECEIPT` the same way the logistics kinds do, so the detail screen picks the receipt up.

- [ ] **Step 6: Run the tests**

Run: `cd android && ./gradlew.bat :core:database:testDebugUnitTest :core:sync:testDebugUnitTest --no-daemon`
Expected: PASS, including the new migration case.

- [ ] **Step 7: Commit**

```bash
git add android/core/database android/core/sync
git commit -m "Feat(android) · queue receipt uploads, the only payment writes that may be replayed"
```

---

## Task 5: `PaymentsRepository` and `DiscrepanciesRepository`

**Files:**
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/PaymentsRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/DiscrepanciesRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/PaymentMappers.kt`
- Modify: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/OutboxRepository.kt`
- Test: `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/PaymentsRepositoryTest.kt`

**Interfaces:**
- Consumes: `EtalonApi`, `OutboxGateway`, `PermissionGate`, `runCatchingCancellable`, `ImagePrep`.
- Produces:
  ```kotlin
  suspend fun record(input: PaymentRecordInput): Result<String>        // online only, returns payment id
  suspend fun confirm(id: String, amount: Money?, adjustmentNote: String?, action: String?, note: String?): Result<Unit>
  suspend fun reject(id: String, reason: String): Result<Unit>
  suspend fun handover(id: String): Result<Unit>
  suspend fun queue(status: PaymentStatus?): Result<List<PaymentQueueItem>>
  suspend fun forOrder(orderId: String): Result<List<PaymentQueueItem>>
  suspend fun attachReceipt(paymentId: String, photo: PreparedImage): Result<String>   // QUEUED
  suspend fun uploadLooseReceipt(photo: PreparedImage): Result<String>                 // QUEUED
  ```

- [ ] **Step 1: Write the failing boundary test**

The single most important test in this slice: the online-only methods must never reach the outbox, and the two upload methods must never reach the network directly.

```kotlin
@Test fun `every online-only payment method leaves the outbox untouched`() = runTest {
    val outbox = SpyOutbox()
    val repo = PaymentsRepository(FakeApi(), outbox, AllPermissions)
    repo.record(input()); repo.confirm("p1", null, null, null, null)
    repo.reject("p1", "сабаб"); repo.handover("p1")
    repo.queue(null); repo.forOrder("o1")
    assertTrue(outbox.calls.isEmpty(), "an online-only payment write must never be queued: ${outbox.calls}")
}

@Test fun `attaching a receipt is queued and never touches the network`() = runTest {
    val outbox = SpyOutbox()
    val repo = PaymentsRepository(FailingApi(), outbox, AllPermissions)   // any API call fails the test
    assertTrue(repo.attachReceipt("p1", preparedImage()).isSuccess)
    assertEquals(listOf(OutboxKind.ADD_PAYMENT_RECEIPT), outbox.calls.map { it.kind })
}

@Test fun `recording without payment record permission is refused before the network`() = runTest {
    val api = FailingApi()
    val repo = PaymentsRepository(api, SpyOutbox(), PermissionGate { it != "payment.record" })
    val r = repo.record(input())
    assertTrue(r.isFailure)
    assertEquals(0, api.calls)
}
```

Follow `LogisticsRepositoryTest` for `SpyOutbox`, `FailingApi` and the table-driven style.

- [ ] **Step 2: Run and watch it fail**

Run: `cd android && ./gradlew.bat :core:data:testDebugUnitTest --no-daemon`

- [ ] **Step 3: Implement the repositories**

Follow `LogisticsRepository` exactly: a private `mutate` helper for the online-only writes that refreshes the affected order afterwards, `runCatchingCancellable` throughout, and a permission refusal ahead of any network call for each guarded action. Uzbek refusal messages, no English.

Structure the online-only section and the queued section under the same two comment banners `LogisticsRepository` uses, so the boundary is legible at a glance.

- [ ] **Step 4: Map the DTOs**

`PaymentMappers.kt` converts `PaymentDto` → `PaymentQueueItem` and `DiscrepancyDto` → `Discrepancy`. Money strings go through `Money.parse`; `fromDriver` is `collectedByDriver != null`; `expectedCollection` comes from the nested `order.dispatch`. Add a mapper test covering a driver-collected row with a shortfall and an in-office row with none.

- [ ] **Step 5: Run the tests**

Run: `cd android && ./gradlew.bat :core:data:testDebugUnitTest :core:data:assembleDebug --no-daemon`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add android/core/data
git commit -m "Feat(android) · payment and discrepancy repositories"
```

---

## Task 6: Status chips and the custody chain in `:core:designsystem`

**Files:**
- Modify: `android/core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/StatusChip.kt`
- Create: `android/core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/CustodyChain.kt`
- Modify: `android/core/designsystem/src/main/res/values/strings.xml`
- Test: `android/core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/StatusChipMappingTest.kt`

**Interfaces:**
- Produces: `paymentStatusTone`, `paymentStatusLabel`, `discrepancyStatusTone`, `discrepancyStatusLabel`, `PaymentStatusChip`, `DiscrepancyStatusChip`, `CustodyChain(chain: CustodyChain)`.

Status mappings live **here**, beside `orderStatusTone`, `paymentStateTone` and `shipmentStatusTone`, under `StatusChipMappingTest` — a local mapping in a feature module was a defect in Phase 1b and was moved. Tones must agree with the product's fixed meanings: confirmed is the positive family, pending is muted, rejected is the danger family.

- [ ] **Step 1: Extend the mapping test first**

Add cases asserting all four `PaymentStatus` values and all six `DiscrepancyStatus` values resolve to a tone and a non-blank Uzbek label, in the style of the existing shipment case.

- [ ] **Step 2: Run and watch it fail, then implement both mappings and the two chips.**

Reuse the existing `Кутилмоқда` string rather than adding a second copy — check `strings.xml` before adding anything.

- [ ] **Step 3: Build the custody chain row**

A single row of small labelled avatars — collected → recorded → handed over → confirmed — skipping the stages that are null, with a chevron between them. Names come through as initials; the full name is the `contentDescription`. Keep it to one line and let it truncate.

- [ ] **Step 4: Run and commit**

Run: `cd android && ./gradlew.bat :core:designsystem:testDebugUnitTest --no-daemon`

```bash
git add android/core/designsystem
git commit -m "Feat(android) · payment and discrepancy chips, and the custody chain"
```

---

## Task 7: The record-payment sheet

The highest-risk screen in the slice — every number entered becomes a payment row against a real order.

**Files:**
- Create: `android/feature/payments/build.gradle.kts`
- Create: `android/feature/payments/src/main/kotlin/uz/etalon/crm/feature/payments/record/RecordPaymentViewModel.kt`
- Create: `android/feature/payments/src/main/kotlin/uz/etalon/crm/feature/payments/record/RecordPaymentScreen.kt`
- Create: `android/feature/payments/src/main/res/values/strings.xml`
- Modify: `android/settings.gradle.kts`
- Test: `android/feature/payments/src/test/kotlin/uz/etalon/crm/feature/payments/RecordPaymentViewModelTest.kt`

**Interfaces:**
- Consumes: `PaymentsRepository`, `DriversRepository`, `OrdersRepository`, `ImagePrep`, `NumericKeypadSheet`, `PhotoCapture`.
- Produces: `RecordPaymentRoute(orderId, onDone, onCancel)`, `RecordPaymentUiState`, `validateRecord(state): String?`.

Follow the module conventions Phase 1b settled: the `@HiltViewModel` holds `ImagePrep` and the route forwards `vm.imagePrep` to `PhotoCapture` — never a route parameter, never an `@EntryPoint`. Double submission guarded at both the ViewModel and the button. `allowDecimal = false` on the cash keypad, as Task 12 of Phase 1b established for UZS.

- [ ] **Step 1: Write the failing validation tests**

`validateRecord` is a pure function returning an Uzbek message or null. It must mirror the server exactly, or a valid-looking form 422s at the gate:

```kotlin
@Test fun `an amount above what may still be recorded is refused before the network`()
@Test fun `zero and negative amounts are refused`()
@Test fun `a driver-collected payment requires a driver`()
@Test fun `a driver may only be set on a driver-collected payment`()
@Test fun `a bank or online payment cannot carry a hand-over`()
@Test fun `the cap is the recordable remaining, not the displayed remaining`()
```

The last one is the important one: build an order with a pending payment and assert an amount between `recordableRemaining` and `remaining` is refused.

Then ViewModel tests: a valid submission reaches the repository exactly once; a second tap while in flight is a no-op; a failure keeps the entered amount and the captured receipts so nothing has to be re-entered at the counter.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement the state and validation**

```kotlin
data class RecordPaymentUiState(
    val order: OrderDetail? = null,
    val amountDigits: String = "",
    val method: PaymentMethod = PaymentMethod.CASH,
    val source: PaymentSource = PaymentSource.IN_OFFICE_CASH,
    val handOverNow: Boolean = false,
    val driverId: String? = null,
    val drivers: List<Driver> = emptyList(),
    val notes: String = "",
    val receipts: List<PreparedImage> = emptyList(),
    val paidOn: LocalDate? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val isOffline: Boolean = false,
    val canAutoConfirm: Boolean = false,
    val done: Boolean = false,
) {
    val amount: Money get() = /* total, never throwing — mirror DeliveryProofUiState.amount */
    val cap: Money get() = order?.recordableRemaining ?: Money.ZERO
    val overCap: Money get() = (amount - cap).coerceAtLeastZero()
    val canSubmit: Boolean get() = !submitting && !isOffline && validateRecord(this) == null
}
```

- [ ] **Step 4: Build the sheet**

Amount through `NumericKeypadSheet` (`allowDecimal = false`), with quick chips for the full recordable remaining and half of it. Method chips: Нақд / Банк / Click / Payme / Бошқа. Source chips. The driver picker appears **only** for `FROM_DRIVER_AT_DELIVERY` and is required there; the hand-over toggle is hidden for `BANK_OR_ONLINE`. `paidOn` defaults to unset, meaning today.

Multi-receipt capture reuses `PhotoCapture` and the design system's photo strip.

Show the auto-confirm outcome before submission: with `payment.confirm`, state that the payment will be confirmed immediately; without it, that it goes to the owner's queue. The user should never be surprised by which happened.

Because recording is online-only, gate submission on the module's existing offline signal — `AppError.Network` from the last fetch — exactly as the shipments and drivers screens do, and say so in Uzbek rather than failing silently.

- [ ] **Step 5: Wire the receipts**

Upload each captured receipt through `uploadLooseReceipt` **before** recording, collecting the returned URLs into `receiptUrls`. That path is queued, so if the operator is offline the URLs will not exist — which is consistent, since recording is online-only anyway and the whole form is gated on connectivity. Note this in a comment so the next reader does not try to "fix" it into an offline flow the server cannot support.

- [ ] **Step 6: Run the tests, then commit**

Run: `cd android && ./gradlew.bat :feature:payments:testDebugUnitTest :feature:payments:assembleDebug --no-daemon`

```bash
git add android/feature/payments android/settings.gradle.kts
git commit -m "Feat(android) · record a payment against an order"
```

---

## Task 8: The confirm queue

**Files:**
- Create: `android/feature/payments/src/main/kotlin/uz/etalon/crm/feature/payments/queue/ConfirmQueueViewModel.kt`
- Create: `.../queue/ConfirmQueueScreen.kt`
- Create: `.../queue/ConfirmSheet.kt`
- Test: `android/feature/payments/src/test/kotlin/uz/etalon/crm/feature/payments/ConfirmQueueViewModelTest.kt`

**Interfaces:**
- Produces: `ConfirmQueueRoute(onOpenOrder)`, `ConfirmQueueUiState`, `confirmBlocker(item, amount, adjustmentNote, action, note): String?`.

- [ ] **Step 1: Write the failing tests for the confirm rules**

`confirmBlocker` mirrors the route's contextual requirements:

```kotlin
@Test fun `changing the amount requires a note of at least five characters`()
@Test fun `a shortfall requires both an action and a note`()
@Test fun `an in-office payment is never treated as short, whatever the dispatch expected`()
@Test fun `a bank transfer is never treated as short`()
@Test fun `an unchanged amount with no shortfall needs nothing at all`()
```

The third and fourth encode the narrow rule: only a payment with a collecting driver, measured against a dispatch's `expectedCollection`, can be short. Getting this wrong forces a confirmer to justify a discrepancy on a payment that is not short of anything.

- [ ] **Step 2: Run and watch them fail. Then implement.**

- [ ] **Step 3: Build the queue**

Three tabs — Кутилмоқда / Тасдиқланган / Рад этилган — each fetching by status. The list follows the established list shape: pull-to-refresh, retry-capable error banner, and no empty state while loading or while an error shows.

Each card shows the order number and client, the amount in mono, expected versus received with the shortfall in the danger colour when there is one, and the custody chain. Approve and Reject are buttons rather than swipe actions: a swipe that confirms money on a mis-grab is not recoverable from the phone.

- [ ] **Step 4: Build the approve sheet**

Amount adjustable through the keypad, defaulting to the recorded amount. If the amount changes, an adjustment note becomes required. If there is a shortfall, the three discrepancy actions appear — Track / Discount / Write-off — with a required note. Reject asks only for a reason of at least three characters.

Both actions are online-only and gated on the offline signal.

- [ ] **Step 5: Run and commit**

```bash
git add android/feature/payments
git commit -m "Feat(android) · the owner's payment confirmation queue"
```

---

## Task 9: Discrepancies

**Files:**
- Create: `android/feature/payments/src/main/kotlin/uz/etalon/crm/feature/payments/discrepancies/DiscrepanciesViewModel.kt`
- Create: `.../discrepancies/DiscrepanciesScreen.kt`
- Test: `.../feature/payments/DiscrepanciesViewModelTest.kt`

**Interfaces:**
- Produces: `DiscrepanciesRoute(onOpenOrder)`, `DiscrepanciesUiState`.

- [ ] **Step 1: Write the failing tests**

Resolution requires a note of at least five characters — assert a shorter one never reaches the repository. Assert the four resolution statuses map to the right server values, and that `OPEN` clears the resolver rather than setting it.

- [ ] **Step 2: Run, implement, build the list and resolve sheet.**

The list shows expected versus received with the gap in the danger colour, the driver, and the order. The resolve sheet offers Recovered / Discount / Write-off / Disputed with a required note. Online-only; gated on the offline signal.

- [ ] **Step 3: Run and commit**

```bash
git add android/feature/payments
git commit -m "Feat(android) · resolve a cash discrepancy"
```

---

## Task 10: Wire the payments tab

**Files:**
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/nav/Keys.kt`
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/nav/EtalonNavHost.kt`
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/nav/StartKey.kt`
- Modify: `android/app/build.gradle.kts`
- Test: `android/app/src/test/kotlin/uz/etalon/crm/nav/DestinationsTest.kt`

**Interfaces:**
- Produces: keys `Payments`, `RecordPayment(orderId)`, `ConfirmQueue`, `Discrepancies`.

The `PAYMENTS` destination currently resolves to `ComingSoon` through `Destination.key()`. This task makes it real.

- [ ] **Step 1: Write the failing test**

Assert `Destination.PAYMENTS.key()` is no longer a `ComingSoon`, and that a user without `payment.view` neither sees the tab nor can reach the route.

- [ ] **Step 2: Register the entries, gated on permission**

Register `Payments`, `ConfirmQueue` and `Discrepancies` only when the user has `payment.view`, and the confirm actions only with `payment.confirm` — mirroring how `Drivers` is gated at registration rather than merely hiding a button. Remember the `entryProvider` fallback: it renders the Uzbek no-access notice for keys that are legitimately absent and still fails loudly for anything else, so add the new keys to that allowance list deliberately.

- [ ] **Step 3: Reach the record sheet from an order**

Add the entry point on the order detail screen, gated on `payment.record` and on the order not being canceled or already fully paid — the two states the server refuses. A disabled button that always 422s is worse than no button.

- [ ] **Step 4: Run the whole project**

Run: `cd android && ./gradlew.bat testDebugUnitTest assembleDebug --no-daemon`
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add android/app android/feature
git commit -m "Feat(android) · the payments tab is real"
```

---

## Task 11: Screenshots and an emulator run

**Files:**
- Create: `android/feature/payments/src/test/kotlin/uz/etalon/crm/feature/payments/PaymentScreenshotTest.kt`
- Create: screenshot baselines under `android/feature/payments/screenshots/`

- [ ] **Step 1: Roborazzi baselines**

Record the record sheet, a queue card with a shortfall, and the discrepancies list, each in light and dark and at `fontScale = 1.3`. Pass a fixed clock and fixed fixtures so a baseline never changes meaning with the day it was recorded — the same trap `OrderCard` hit.

- [ ] **Step 2: Run it on the emulator**

Build, install with `installDebug` (`assembleDebug` alone installs nothing), and drive the flow on `anatome_api36`: record a payment as an operator and confirm it lands `PENDING_CONFIRMATION`; record as an owner and confirm it lands `CONFIRMED` immediately; approve one from the queue; reject one; attach a receipt offline and confirm it drains after reconnecting.

- [ ] **Step 3: Report honestly**

Anything that could not be verified is written down as unverified, not quietly omitted. A defect found here is reported, not silently fixed.

- [ ] **Step 4: Commit**

```bash
git add android/feature/payments/screenshots
git commit -m "Test(android) · payment screenshots and an emulator run"
```

---

## Self-review

**Spec coverage (§5.6).** Record sheet with amount keypad, quick chips, method chips, source, driver picker, `paidOn`, multi-receipt camera and the auto-confirm note → Task 7. Confirm queue with three tabs, expected-vs-received with shortfall, custody chain, approve/reject, adjustment and discrepancy choice → Tasks 6 and 8. Discrepancy list and resolve sheet → Task 9. Shell wiring for the `PAYMENTS` tab (§5.1) → Task 10.

**Deliberately out of scope**, with reasons: swipe-to-approve, because a mis-grab that confirms money is not recoverable from the phone — buttons instead; the handover endpoint has a repository method and no dedicated screen, since office hand-over is a desk task and `handOverNow` on the record sheet covers the field case.

**Known consequence to carry into execution.** Recording a payment is online-only, so a driver with no signal cannot record one. This is narrower than it appears: cash collected at delivery already creates a payment through the delivery-proof path, which is queued. If the business wants standalone offline recording, that is a server change — wrapping `POST /api/payments` in `withIdempotency` — and a separate decision, not something to work around on the client.

**Type consistency.** `PaymentRecordInput`, `PaymentQueueItem`, `CustodyChain` and `Discrepancy` are defined in Task 2 and used unchanged in Tasks 5, 7, 8 and 9. The repository signatures in Task 5's Interfaces block are the ones the screens call. `recordableRemaining` is defined in Task 2 and is the cap in Task 7.
