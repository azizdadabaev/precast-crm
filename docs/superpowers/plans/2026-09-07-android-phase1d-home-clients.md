# Android Phase 1d — Home and Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the last two placeholder surfaces in Phase 1 — a Home screen that answers "what is happening today" and a Clients section with phone-first search — so the Field MVP is complete and can go to a closed test track.

**Architecture:** Two new feature modules over new endpoints in `:core:network` and two read-mostly repositories in `:core:data`, following the shape Phases 1b and 1c established. Only one write path exists in this slice (create/edit a client), and it touches the field that is this product's unique customer identity.

**Tech Stack:** Kotlin 2.4, Jetpack Compose (BOM 2026.08.00), Material 3, Hilt 2.60.1, Retrofit 3.0.0, Room 2.8.4, Navigation 3, Gradle 9.6.0 / AGP 9.4.0 (Kotlin built in — never apply `org.jetbrains.kotlin.android`), JDK 25. compileSdk 37 / minSdk 36 / targetSdk 36 via `uz.etalon.buildlogic.AndroidConfig`.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` — §5.2 (Home), §5.9 (Clients), §5.1 (shell), §6.5 (formatting), §7 (delivery plan).

**Base:** branch `feat/android-phase1d`, cut from the head of `feat/android-phase1c`.

---

## Global Constraints

- **Every user-visible string is Uzbek Cyrillic.** No English, no Latin-script Uzbek, no Russian. A validation message written inline in a ViewModel is user-visible.
- **Do not declare a string resource name that already exists in another module.** Android merges by name across the APK and the module nearer `:app` wins, so a duplicate silently relabels another module's UI. This defect has been caught twice in this project. Grep `:core:designsystem`, `:core:ui`, `:app` and every `:feature:*` before adding a name; scope names to your module where there is any doubt.
- **Money is the `Money` value class over `BigDecimal`.** Never `Double`, never `Long`. **The dashboard is the trap in this slice**: unlike every other endpoint so far, it returns money as bare JSON *numbers*, not strings (`Math.round(...)` in `dashboard-data.ts`). Decoding those through `Double` reintroduces exactly the float-on-a-money-path defect this project has already fixed twice. Read them as a `JsonPrimitive` and build a `BigDecimal` from its `content`.
- **Phone is the unique client identity; names may repeat.** Never flag a duplicate name. Always normalise a phone before writing it. See `reference_client_identity_rule` behaviour in `src/lib/phone.ts` and the existing Kotlin `formatPhone`.
- **Permissions are real, not cosmetic.** Gate nav registration the way `Drivers` and the payment routes are gated, and refuse in the repository too. `client.view` to read, `client.create` and `client.edit` to write, `dashboard.viewBasic` **or** `dashboard.view` for the tiles.
- **Read screens still follow the settled list shape**: pull-to-refresh, a retry-capable error banner, and no empty state while loading **or** while an error shows. This exact defect has been found three times in this project.
- Touch targets at least 48dp; tabular figures on every number; every colour from a real theme token; no hard-coded hex; both themes legible.
- Never swallow `CancellationException`; use `runCatchingCancellable`.
- No secrets; no logging of tokens, cash figures, phone numbers or client data.

---

## Scope boundary — read this before Task 6

The spec's §5.2 describes three tiers of Home. **This slice builds the first two only:**

- **Everyone** — the «Бугун» column: today's scheduled deliveries, the operator's own outbox status, quick actions.
- **`dashboard.viewBasic`** — operational tiles: today's deliveries, open discrepancies, loaded volume this month.
- **`dashboard.view` (owner) — NOT in this slice.** The editorial section (month headline, twelve-month area chart, money tiles, payment donut, top clients) is Phase 2's "owner editorial home" per §7's delivery table. Do not build charts. `GET /api/dashboard` returns the data for it; ignore those fields.

An owner opening Home in this slice sees the same Today column and tiles everyone else sees. That is correct for Phase 1.

---

## Server contracts (verified — do not guess a field name)

| Route | Permission | Notes |
|---|---|---|
| `GET /api/dashboard` | `dashboard.viewBasic` **or** `dashboard.view` (`withPermissionAny`) | Returns the whole `DashboardPayload`; this slice uses a subset |
| `GET /api/clients` | `client.view` | `?q=&phone=` — script-insensitive search |
| `POST /api/clients` | `client.create` | `ClientCreateSchema` |
| `GET /api/clients/{id}` | `client.view` | |
| `PATCH /api/clients/{id}` | `client.edit` | |
| `GET /api/clients/export` | check the route | Builds a contacts text blob |

`GET /api/clients`, `POST /api/clients`, `GET|PATCH /api/clients/{id}` are already registered in the OpenAPI contract. `GET /api/dashboard` and `GET /api/clients/export` are **not** — Task 1 adds them.

**The `DashboardPayload` fields this slice uses** (from `src/lib/dashboard-data.ts:103`), all money as bare numbers:
- `todayDeliveries: { count, totalArea, date, orders: [{ id, orderNumber, clientName, totalArea }] }`
- `openDiscrepancies: { count, totalAmount }`
- `outstandingReceivables: { total, orderCount, trend }`
- `ordersByPaymentState: { paid, partial, awaiting }`

Everything else on that payload is Phase 2's. Model only what you render.

---

## Task 1: Register the dashboard and client-export routes in the OpenAPI contract

**Files:** Modify `precast-crm/src/lib/openapi/registry.ts`, `precast-crm/tests/openapi.test.ts`.

- [ ] **Step 1:** Read the client registrations already in `registry.ts` and the `withPermissionAny` usage in `src/app/api/dashboard/route.ts`. Read `src/app/api/clients/export/route.ts` for its actual response shape and query parameters.
- [ ] **Step 2:** Raise the expected path count in `tests/openapi.test.ts` by the number of **new path keys** you actually add, and run it to watch it fail. Count the keys; do not assume two.
- [ ] **Step 3:** Register both routes, matching the neighbouring style — `security: bearer`, the `Any` placeholder for unmodelled response shapes.
- [ ] **Step 4:** Regenerate (`npx tsx scripts/generate-openapi.ts`), then `npm run openapi:check`, `npx vitest run tests/openapi.test.ts`, `npx tsc --noEmit`. All clean. Report the real path count.
- [ ] **Step 5:** Commit — `Feat(api) · document the dashboard and client-export routes`.

---

## Task 2: Domain types in `:core:model`

**Files:** Create `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Client.kt` and `.../Dashboard.kt`. Test: `.../core/model/DashboardMoneyTest.kt`.

**Interfaces produced:**
```kotlin
data class ClientSummary(val id: String, val name: String, val phone: String, val address: String?, val orderCount: Int)
data class ClientDetail(val id: String, val name: String, val phone: String, val address: String?, val notes: String?, val orders: List<ClientOrderLine>)
data class ClientOrderLine(val id: String, val orderNumber: String, val status: OrderStatus, val totalPrice: Money, val scheduledAt: Instant)
data class ClientInput(val name: String, val phone: String, val address: String?, val notes: String?)

data class TodayDelivery(val orderId: String, val orderNumber: String, val clientName: String, val area: BigDecimal)
data class HomeSummary(
    val today: List<TodayDelivery>,
    val todayArea: BigDecimal,
    val openDiscrepancies: Int,
    val openDiscrepancyTotal: Money,
    val receivables: Money,
    val receivableOrders: Int,
    val paidOrders: Int, val partialOrders: Int, val awaitingOrders: Int,
)
```

- [ ] **Step 1: Write the failing test that pins the money rule.** The dashboard sends money as a bare JSON number. This test proves the decode never passes through a `Double`:

```kotlin
@Test fun `a dashboard figure at the column ceiling survives without scientific notation`() {
    // 999 999 999 999 as a Double stringifies to 9.99999999999E11.
    val json = """{"total":999999999999,"orderCount":3}"""
    assertEquals(Money.parse("999999999999"), decodeReceivables(json).total)
}
```

Name the decode helper whatever Task 3's DTO layer will call; this test lives with the type it protects.

- [ ] **Step 2:** Run it, watch it fail.
- [ ] **Step 3:** Write the types above. `HomeSummary` models only the fields this slice renders — nothing from the editorial dashboard.
- [ ] **Step 4:** Run the tests; they pass.
- [ ] **Step 5:** Commit — `Feat(android) · home and client domain types`.

---

## Task 3: Endpoints and DTOs in `:core:network`

**Files:** Modify `EtalonApi.kt`; create `dto/ClientDto.kt`, `dto/DashboardDto.kt`. Test: `ClientApiTest.kt`, `DashboardApiTest.kt`.

**Endpoints:**
```kotlin
@GET("api/clients") suspend fun clients(@Query("q") q: String? = null, @Query("phone") phone: String? = null): List<ClientRowDto>
@POST("api/clients") suspend fun createClient(@Body body: ClientWriteRequest): ClientRowDto
@GET("api/clients/{id}") suspend fun client(@Path("id") id: String): ClientDetailDto
@PATCH("api/clients/{id}") suspend fun updateClient(@Path("id") id: String, @Body body: ClientWriteRequest): ClientRowDto
@GET("api/dashboard") suspend fun dashboard(): DashboardDto
```

- [ ] **Step 1: Write the failing wire tests.** Two matter most:
  - a dashboard figure of `999999999999` decodes to an exact `Money`, with no scientific notation anywhere in the parsed value;
  - a client row whose `address` and `notes` are absent decodes without throwing (the list route does not always select them — **read the route and confirm which fields can be missing**, then default those and only those).
- [ ] **Step 2:** Run, watch them fail.
- [ ] **Step 3:** Write the DTOs. Money on the dashboard is a `JsonPrimitive` mapped through `BigDecimal(content)` — **never `Double`**. Follow how `BigDecimalSerializer` is written for the request side and mirror the discipline on the response side.
- [ ] **Step 4:** Add the five endpoints. Match the existing conventions exactly; this module's tests are JUnit 5.
- [ ] **Step 5:** `:core:network:testDebugUnitTest :core:network:assembleDebug` green, including every pre-existing test.
- [ ] **Step 6:** Commit — `Feat(android) · client and dashboard endpoints`.

---

## Task 4: `ClientsRepository` and `HomeRepository` in `:core:data`

**Files:** Create `ClientsRepository.kt`, `HomeRepository.kt`, `mapper/ClientMappers.kt`, `mapper/DashboardMappers.kt`. Test: `ClientsRepositoryTest.kt`.

**Interfaces produced:**
```kotlin
suspend fun list(query: String?): Result<List<ClientSummary>>
suspend fun detail(id: String): Result<ClientDetail>
suspend fun create(input: ClientInput): Result<String>
suspend fun update(id: String, input: ClientInput): Result<Unit>
suspend fun home(): Result<HomeSummary>
```

Everything here is **online-only** — none of these routes is `withIdempotency`-wrapped, so nothing may be queued. Follow `LogisticsRepository`'s two-banner structure so the boundary reads at a glance, even though this slice has no queued half.

- [ ] **Step 1: Write the failing tests.** The three that matter:
  - each write refuses on its permission (`client.create`, `client.edit`) **before** the network — use a recording API double and assert no call was made, not merely that the result failed;
  - `create` normalises the phone before sending — assert the exact digits that reach the request for an input typed as `+998 90 111 22 33`, with spaces;
  - nothing in this repository reaches the outbox.
- [ ] **Step 2:** Run, watch them fail.
- [ ] **Step 3:** Implement, following `LogisticsRepository` and `PaymentsRepository` exactly — `runCatchingCancellable`, permission refusal ahead of the network, Uzbek refusal messages.
- [ ] **Step 4:** `:core:data:testDebugUnitTest :core:data:assembleDebug` green.
- [ ] **Step 5:** Commit — `Feat(android) · client and home repositories`.

---

## Task 5: `:feature:clients` — list, search and detail

**Files:** Create the module, `list/ClientsViewModel.kt`, `list/ClientsScreen.kt`, `detail/ClientDetailViewModel.kt`, `detail/ClientDetailScreen.kt`, `res/values/strings.xml`. Modify `android/settings.gradle.kts`. Test: `ClientsViewModelTest.kt`.

- [ ] **Step 1: Write the failing tests** — the list shape (no empty state while loading or while an error shows), search debouncing if you add any, and that a search by phone works with the separators a human types.
- [ ] **Step 2:** Run, watch them fail.
- [ ] **Step 3: Build the list.** Phone-first search: the field accepts a pasted or typed phone with any separators, and a name. Card rows show name, phone and order count. Follow `ConfirmQueueScreen` for the list shape — it is the cleanest example in the codebase.
- [ ] **Step 4: Build the detail.** Name, phone with a tap-to-call affordance (`ACTION_DIAL`, never `ACTION_CALL` — no `CALL_PHONE` permission), address, and the client's orders as rows that open the order. Reuse the design system's card, chip and money components; write no local status mapping.
- [ ] **Step 5:** `:feature:clients:testDebugUnitTest :feature:clients:assembleDebug` green.
- [ ] **Step 6:** Commit — `Feat(android) · find a client by phone and open their orders`.

---

## Task 6: `:feature:clients` — create and edit

The only write path in this slice, and it writes the field that identifies a customer.

**Files:** Create `edit/ClientEditViewModel.kt`, `edit/ClientEditScreen.kt`. Test: `ClientEditViewModelTest.kt`.

- [ ] **Step 1: Write the failing validation tests.** `validateClient(state): String?` is a pure function returning an Uzbek message or null:
  - a blank name is refused;
  - a phone that is not nine local digits is refused — read `src/lib/phone.ts` for the real rule rather than assuming;
  - **a duplicate name is never refused** — two clients may legitimately share a name, and this product identifies them by phone;
  - the address, when set, is composed in the stored `"<Viloyat>, <Tuman>, <street>"` convention (see `src/lib/regions/index.ts`), so it parses the same way everywhere else in the app reads it.
- [ ] **Step 2:** Run, watch them fail.
- [ ] **Step 3: Build the sheet.** Name, phone with a `+998` prefix that is display-only (the value sent is twelve digits — the drivers screen already does this correctly; copy it), the address as viloyat → tuman → street, and notes. Double submission guarded at both the ViewModel and the button. Gate on `client.create` / `client.edit` and on the module's existing offline signal.
- [ ] **Step 4:** Green, then commit — `Feat(android) · add and edit a client`.

---

## Task 7: `:feature:home` — the Today column and the basic tiles

**Files:** Create the module, `HomeViewModel.kt`, `HomeScreen.kt`, `res/values/strings.xml`. Modify `android/settings.gradle.kts`. Test: `HomeViewModelTest.kt`.

Re-read the **Scope boundary** section above before starting. No charts.

- [ ] **Step 1: Write the failing tests** — the list shape; that a user with neither `dashboard.viewBasic` nor `dashboard.view` still gets the Today column and simply no tiles; and that the tiles are absent rather than showing zeros when the permission is missing.
- [ ] **Step 2:** Run, watch them fail.
- [ ] **Step 3: Build it.** The «Бугун» column for everyone: today's scheduled deliveries as rows that open the order, and the operator's own outbox status via `OutboxRepository.observePendingCount` — which is already owner-scoped, so it shows only this operator's queue. Then the tiles, gated on the dashboard permission: today's deliveries, open discrepancies, receivables.
- [ ] **Step 4:** Green, then commit — `Feat(android) · a home screen that answers what is happening today`.

---

## Task 8: Wire both tabs, and run it on the emulator

**Files:** Modify `android/app/src/main/kotlin/uz/etalon/crm/nav/Keys.kt`, `.../nav/EtalonNavHost.kt`, `.../nav/StartKey.kt`, `android/app/build.gradle.kts`. Test: `DestinationsTest.kt`.

- [ ] **Step 1: Write the failing test** — `Destination.HOME.key()` and the clients destination are no longer `ComingSoon`, and a user without `client.view` cannot reach the clients route.
- [ ] **Step 2: Register the entries, gated on permission**, following how the payment routes are gated. Add the new keys to the `gatingPermission` map so the `entryProvider` fallback shows the Uzbek no-access notice for a legitimately withheld key and still crashes loudly for an unregistered one.
- [ ] **Step 3:** `HOME` now has a screen, so it appears on the bottom bar for everyone — confirm the placeholder filter added in Phase 1c does the right thing, and that the bar's four-item cap behaves. This is the first slice where the cap can actually bind; if it does, restore the exact-size assertion Phase 1c had to drop.
- [ ] **Step 4:** Whole project green: `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
- [ ] **Step 5: Run it.** `installDebug` (not `assembleDebug`, which installs nothing), then on `anatome_api36`: open Home and confirm the Today column matches the seeded orders; search a client by a pasted phone with separators; open a client and tap through to an order; create a client and confirm the stored phone is twelve digits; edit one. Record what you could not verify rather than omitting it.
- [ ] **Step 6:** Commit — `Feat(android) · the home and clients tabs are real`.

---

## Self-review

**Spec coverage.** §5.2's Today column and `dashboard.viewBasic` tiles → Tasks 7 and 8; the owner editorial tier is deliberately deferred to Phase 2 per §7, and the Scope boundary section says so where an implementer will read it. §5.9's phone-first search, region-aware address, card rows with order counts, detail with call and orders, and the create/edit sheet → Tasks 5 and 6. §5.1 shell wiring → Task 8.

**Deliberately out of scope**, with reasons: the contacts export (`/api/clients/export` is documented in Task 1 but no screen consumes it — an Android share-sheet flow is its own small slice, and the web already covers the need); client drafts, which belong with the calculator in Phase 2.

**Type consistency.** `ClientSummary`, `ClientDetail`, `ClientInput`, `HomeSummary` and `TodayDelivery` are defined in Task 2 and used unchanged in Tasks 4 through 7. The repository signatures in Task 4 are the ones the screens call.

**The one thing most likely to go wrong.** The dashboard returns money as bare JSON numbers, and every other endpoint in this project returns money as strings. An implementer who pattern-matches on the existing DTOs will write `Double` without noticing. Task 2 and Task 3 both open with a test at the `Decimal(14,2)` ceiling for exactly that reason.
