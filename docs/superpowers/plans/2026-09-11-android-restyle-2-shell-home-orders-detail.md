# Android Restyle — Phase 2: Shell, Home, Orders, Order Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the signed-in shell and the three most-used screens — Home, Orders, Order detail — so that each one matches its prototype capture button for button, using only the phase-1 components.

**Architecture:** The floating navy nav pill replaces `NavigationSuiteScaffold`; the five cells are the permission-filtered `Destination` entries. Home, Orders and Order detail are recomposed from `KpiCard`, `NavySheet`, `OrderRow`, `MonthHeader`, `SearchField`, `EtalonFilterChip`, `SegmentedControl`, `DetailPanel`, `ProgressCard`, `StepTimeline`, `StickyActionBar` and the buttons. Two additive server changes supply the numbers the prototype shows (per-status counts, month sums, debts on Home rows). Every screen is recorded as a Roborazzi baseline and reviewed side by side with its capture.

**Tech Stack:** Kotlin 2.4.10, Compose BOM 2026.08.00, Material3 1.4.0, Navigation 3, Hilt, Retrofit + kotlinx.serialization, Room, Roborazzi 1.73.0 / Robolectric 4.16.1; web: Next.js 14, Prisma, vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` (design doc — §4 shell, §5.1 screens, §7 numbers, §8 testing) argued from `docs/superpowers/specs/2026-09-10-etalon-mobile-design-system-v1.1.md` (§2 components, §3.1–3.3 screens). **Visual oracle:** `docs/android/restyle-prototype/2b-home.png`, `2b-orders.png`, `2b-order-detail.png`. Where the capture and the design doc disagree, the design doc wins; where the capture shows data the app does not have, the rulings below say what stands in.

## Global Constraints

- **The capture is the acceptance test.** A task is not done until its baseline, laid beside its `2b-*.png`, has every element of the capture in the capture's place — app bar, title, cards, rows, buttons, sheet, nav — with only the differences the rulings below allow. The reviewer opens both images.
- Light only (D6). No `darkTheme` parameter, no `*_dark.png` baselines — new screenshot tests record `_light` and `_font13` only.
- No raw hex outside `EtalonColors.kt` (`NoRawHexTest` is the gate); every colour, shape, space and text style is an `EtalonColors` / `EtalonShapes` / `EtalonSpace` / `EtalonType` token. `MaterialTheme.colorScheme.*`, `MaterialTheme.typography.*` and the `LegacyTokens` shim (`LocalEtalonColors`, `EtalonType.mono*`) must not appear in any file this plan touches.
- 48 dp touch targets (D7): every tappable element sits in `minimumInteractiveComponentSize()` or is ≥ 48 dp.
- Numbers per D8: `formatMoney` (bare, thin-space groups) in rows, `MoneyHeroText` / `formatMoneyHero` on heroes, `formatArea` for m², counts with «та» only where the spec writes them. Money is `Money` end to end; the one permitted `BigDecimal → Float` crossing is a progress-bar fraction, and it is computed with `BigDecimal.divide(…, 4, HALF_UP)` first.
- All UI strings Uzbek Cyrillic in `strings.xml`. The only Latin on any screen is the wordmark «ETALON» (ruling R4).
- No new dependency (Android or web). `DatePickerDialog` is Material3 1.4.0 and already on the classpath.
- Server changes are **additive and backward-compatible**: new optional query params, new response fields; no existing field renamed, no existing test weakened. `cd precast-crm && npx tsc --noEmit && npx vitest run` green.
- Android verification, from `android/` with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`:
  `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks` — `--rerun-tasks` is mandatory: without it a warm `verifyRoborazziDebug` compares zero images and `NoRawHexTest` does not run.
- Recording: `.\gradlew.bat :feature:<module>:recordRoborazziDebug --rerun-tasks`, then look at every PNG the task produced before committing it.
- **Never `git stash`** (the stack is shared with other sessions). Set work aside with a temporary commit if you must.
- Existing tests stay green untouched, except tests that name a component or function this plan deletes (`OrderCardScreenshotTest`, `DestinationsTest`, the six `order_detail_bar_*` baselines) — those are replaced, never weakened.
- Every screen keeps its existing behaviour: permissions, outbox banners, pull-to-refresh, the next-step rule, the record-payment door, the shipments door, photo delete, the dialer hand-off. The restyle moves and redraws; it does not remove a capability.

## Rulings (recorded here so no implementer has to guess)

- **R1 — Server fields.** `GET /api/orders` gains `facets` (counts by status and by payment, plus total area, for the `q`/`day` filter ignoring `status`/`payment`/`page`), a `payment=debt|paid` filter and `sort=desc`. `GET /api/dashboard` `todayDeliveries.orders[]` gains `status`, `clientAddress`, `totalPrice`, `remaining`; `recentOrders[]` gains `status`, `scheduledAt`, `remaining`. All additive; the web UI ignores them.
- **R2 — Home KPI cards.** The capture's three cards map to real data: **Қарздорлик** (red; `outstandingReceivables`; footnote «N буюртмада қолди»; **no sparkline** — the server has no receivables series and the card must not decorate with an unrelated one); **Ойлик тушум** (green; `collectedThisMonth` with its trend and `collectedByMonth` as the bars — «ойлик», not the capture's «ҳафталик», because the server's period is the calendar month); **Бугунги етказиш** (indigo; today's m² and count — the third card, off-screen in the capture).
- **R3 — Bell and avatar.** The bell is the outbox: badge when this operator has unsent rows, tap opens a small white sheet stating the count. The avatar opens the account sheet: name, role, «Ҳайдовчилар» (`driver.view`), «Нақд пул тафовутлари» (`discrepancy.view` — its only door until phase 3 links it from Payments), «PIN ни ўзгартириш», «Чиқиш» (with the existing unsent-data confirmation). «Яна», `MoreScreen`, and the `ComingSoon` placeholders go.
- **R4 — Brand row.** «ETALON» stays as drawn (it is the wordmark); the tagline is «Йиғма монолит» (the company's own Uzbek line), never «Beam & block flooring».
- **R5 — Orders order and paging.** The capture lists newest first (Сентябрь → Июль → Июнь); the mobile passes `sort=desc`. Pages of 50, appended on scroll; chip and segment counts come from `facets`, not from the loaded rows. Groups are by `scheduledAt` month in Tashkent time; the month sum is the sum of `totalPrice` (Money arithmetic).
- **R6 — Filter button.** The capture's filter icon button opens the day picker (`day=` is a filter the API already has); it carries a badge while a day is set. Chips stay visible regardless.
- **R7 — Detail panel.** No «Хона қўшиш» tile and no ↗ on room tiles: there is no order editing on mobile (thin 2c later). Sticky bar = `SecondaryButton` for the existing next step (`Юклаш` / `Етказилди` / `Жўнатмалар`, disabled with the reason when blocked) + `PrimaryButton` «Тўлов қайд қилиш» when `canRecordPayment`; a lone button fills the width; no bar when neither applies. Payments, shipments (still a door to the existing shipment screens — the inline NavySheet with load/dispatch actions is phase 5), photos and events stay, each as a white card under the «Етказиш» card.
- **R8 — Nav on stack routes.** The pill shows on every signed-in screen, as the bar does today. The active cell for a stack route is the tab it belongs to: order-scoped routes → Буюртма; Drivers / Discrepancies / ChangePin → Бош. The ≥ 600 dp rail is dropped (phones only).
- **R9 — Order number.** Rows and the panel show `formatOrderNo`: «№ 09‑0003» — the year prefix dropped, the hyphen U+2011 (non-breaking) so a number never wraps. The design-system sheets' sample ids use U+2212 and stay as they are.

---

## File map

**Web (`precast-crm/`)**
- Create `src/lib/order-facets.ts` — pure `facetsFrom(statusGroups, paymentGroups)`.
- Create `src/lib/order-facets.test.ts`.
- Modify `src/app/api/orders/route.ts` — `payment`, `sort`, `facets`.
- Modify `src/lib/dashboard-data.ts` — today/recent row fields.

**Android**
- `core/network/…/dto/OrderDto.kt` (+`OrderFacetsDto`), `dto/DashboardDto.kt`, `EtalonApi.kt` (params).
- `core/model/…/Order.kt` (+`OrderFacets`, `PaymentFilter`), `Dashboard.kt` (fields, `RecentOrder`, `MonthCollected`).
- `core/data/…/OrdersRepository.kt` (`OrdersFilter` fields, `facets()`), `mapper/OrderMappers.kt`, `mapper/DashboardMappers.kt`.
- `core/ui/…/format/Formatters.kt` (+`formatLongDate`, `formatMonthYear`, `formatOrderNo`) and `FormattersTest.kt`.
- `core/designsystem/…/icon/EtalonIcons.kt` + `res/drawable/ic_lu_file_text.xml` (one new Lucide glyph).
- `app/…/shell/Destinations.kt`, `shell/AccountSheet.kt` (new, replaces `MoreScreen.kt`), `nav/Keys.kt`, `nav/StartKey.kt` (+`tabFor`), `nav/EtalonNavHost.kt`, `app/src/test/…/shell/DestinationsTest.kt`, `nav/TabForTest.kt` (new).
- `feature/home/…/HomeScreen.kt`, `HomeViewModel.kt`, `OutboxSheet.kt` (new), `res/values/strings.xml`, `src/test/…/HomeScreenshotTest.kt` (new), `HomeViewModelTest.kt`.
- `feature/orders/…/list/OrdersListScreen.kt`, `OrdersListViewModel.kt`, `list/OrderGroups.kt` (new), `list/OrderCard.kt` (**deleted**), `detail/OrderDetailScreen.kt`, `detail/Timeline.kt` (new), `res/values/strings.xml`, tests: `OrdersListScreenshotTest.kt` (new), `OrderDetailScreenshotTest.kt` (rewritten), `OrderGroupsTest.kt`, `TimelineTest.kt` (new), `OrderCardScreenshotTest.kt` (**deleted**), `OrdersListViewModelTest.kt`.

---

### Task 1: Server — order facets, payment/sort params, richer dashboard rows

**Files:**
- Create: `precast-crm/src/lib/order-facets.ts`, `precast-crm/src/lib/order-facets.test.ts`
- Modify: `precast-crm/src/app/api/orders/route.ts`, `precast-crm/src/lib/dashboard-data.ts`

**Interfaces:**
- Produces: `GET /api/orders?…&payment=debt|paid&sort=desc` → `{ items, total, page, pageSize, totalPages, facets: { byStatus: Record<OrderStatus, number>, byPayment: { debt: number, paid: number }, total: number, totalArea: number } }`. `facets` describes the `q`/`day` filter with `status`, `payment` and `page` ignored.
- Produces: `todayDeliveries.orders[i]` = `{ id, orderNumber, clientName, totalArea, status, clientAddress: string | null, totalPrice: number, remaining: number }`; `recentOrders[i]` gains `status: OrderStatus`, `scheduledAt: string (ISO)`, `remaining: number`.

- [ ] **Step 1: Write the failing test for the pure helper**

`precast-crm/src/lib/order-facets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { facetsFrom } from "./order-facets";

describe("facetsFrom", () => {
  it("folds Prisma groupBy rows into the mobile facets, zero-filling absent statuses", () => {
    const f = facetsFrom(
      [
        { status: "PLACED", _count: { _all: 1 }, _sum: { totalArea: "36.5" } },
        { status: "DISPATCHED", _count: { _all: 2 }, _sum: { totalArea: "121.3" } },
      ],
      [
        { paymentState: "FULLY_PAID", _count: { _all: 3 } },
        { paymentState: "PARTIALLY_PAID", _count: { _all: 4 } },
        { paymentState: "AWAITING_PAYMENT", _count: { _all: 2 } },
      ],
    );
    expect(f.byStatus).toEqual({
      DRAFT: 0, PLACED: 1, IN_PRODUCTION: 0, LOADED: 0, DISPATCHED: 2, DELIVERED: 0, CANCELED: 0,
    });
    expect(f.byPayment).toEqual({ debt: 6, paid: 3 });
    expect(f.total).toBe(3);
    expect(f.totalArea).toBe(157.8);
  });

  it("is all zeros for an empty result", () => {
    const f = facetsFrom([], []);
    expect(f.total).toBe(0);
    expect(f.totalArea).toBe(0);
    expect(f.byPayment).toEqual({ debt: 0, paid: 0 });
  });
});
```

- [ ] **Step 2: Run it — expect "Cannot find module './order-facets'"**

`cd precast-crm && npx vitest run src/lib/order-facets.test.ts`

- [ ] **Step 3: Implement the helper**

`precast-crm/src/lib/order-facets.ts`:
```ts
import type { OrderStatus, OrderPaymentState } from "@prisma/client";

const STATUSES: OrderStatus[] = [
  "DRAFT", "PLACED", "IN_PRODUCTION", "LOADED", "DISPATCHED", "DELIVERED", "CANCELED",
];

type StatusGroup = { status: OrderStatus; _count: { _all: number }; _sum: { totalArea: unknown } };
type PaymentGroup = { paymentState: OrderPaymentState; _count: { _all: number } };

export interface OrderFacets {
  byStatus: Record<OrderStatus, number>;
  /** `debt` = every order that is not FULLY_PAID (the mobile's «Қарз» segment); `paid` = FULLY_PAID. */
  byPayment: { debt: number; paid: number };
  total: number;
  /** m², one decimal, like the dashboard's `todayDeliveries.totalArea`. */
  totalArea: number;
}

/**
 * Folds two `prisma.order.groupBy` results into the shape the Android orders list draws its chip
 * and segment counts from. Pure so it is unit-tested without a database; the route runs the
 * queries. `totalArea` arrives as Prisma `Decimal` (or a string in tests) and is summed via
 * `Number()` — it is an area, never money.
 */
export function facetsFrom(statusGroups: StatusGroup[], paymentGroups: PaymentGroup[]): OrderFacets {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  let total = 0;
  let area = 0;
  for (const g of statusGroups) {
    byStatus[g.status] = g._count._all;
    total += g._count._all;
    area += Number(g._sum.totalArea ?? 0);
  }
  let paid = 0;
  let debt = 0;
  for (const g of paymentGroups) {
    if (g.paymentState === "FULLY_PAID") paid += g._count._all;
    else debt += g._count._all;
  }
  return { byStatus, byPayment: { debt, paid }, total, totalArea: Math.round(area * 10) / 10 };
}
```

- [ ] **Step 4: Run the test — expect PASS**

- [ ] **Step 5: Wire the route**

In `precast-crm/src/app/api/orders/route.ts`, after `const day = …`:
```ts
  const payment = searchParams.get("payment");
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc";
```
Build the `where` exactly as today, then **before** `if (status) where.status = status;` capture the facet base:
```ts
  // Facets describe the q/day filter with status/payment/page ignored, so the chips can show
  // how many orders each status holds while one status is selected.
  const facetWhere: Record<string, unknown> = { ...where };
  if (status) where.status = status;
  if (payment === "paid") where.paymentState = "FULLY_PAID";
  else if (payment === "debt") where.paymentState = { not: "FULLY_PAID" };
```
(Move the existing `if (status) where.status = status;` line down to here so `facetWhere` is copied before it.) Replace the `Promise.all` with:
```ts
  const [total, items, statusGroups, paymentGroups] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ scheduledAt: sort }, { placedAt: "desc" }],
      include: { client: true, project: { select: { id: true, name: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.groupBy({ by: ["status"], where: facetWhere, _count: { _all: true }, _sum: { totalArea: true } }),
    prisma.order.groupBy({ by: ["paymentState"], where: facetWhere, _count: { _all: true } }),
  ]);

  return ok({
    items, total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    facets: facetsFrom(statusGroups, paymentGroups),
  });
```
Add `import { facetsFrom } from "@/lib/order-facets";`. Update the route's doc comment: `Response: { items, total, page, pageSize, totalPages, facets }`, and name the two new params.

- [ ] **Step 6: Dashboard rows**

In `precast-crm/src/lib/dashboard-data.ts`: the `todayOrders` query's `select` must include `status`, `totalPrice`, `confirmedPaid`, `writeOffAmount` and `client: { select: { name: true, address: true } }` (extend the existing select; do not drop a field). In the payload type:
```ts
    orders: Array<{
      id: string; orderNumber: string; clientName: string; totalArea: number;
      status: OrderStatus; clientAddress: string | null; totalPrice: number; remaining: number;
    }>;
```
and in the mapping:
```ts
      orders: todayOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        clientName: o.client.name,
        totalArea: Math.round(Number(o.totalArea) * 10) / 10,
        status: o.status,
        clientAddress: o.client.address ?? null,
        totalPrice: Math.round(Number(o.totalPrice)),
        remaining: Math.round(remainingBalance(Number(o.totalPrice), Number(o.confirmedPaid), Number(o.writeOffAmount))),
      })),
```
For `recentOrders`: extend its query's select with `status`, `scheduledAt`, `confirmedPaid`, `writeOffAmount` (keep everything it selects now), add to the type `status: OrderStatus; scheduledAt: string; remaining: number;` (and the `clientPhone: string; clientAddress: string | null;` the mapper already emits), and to the mapping:
```ts
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    remaining: Math.round(remainingBalance(Number(r.totalPrice), Number(r.confirmedPaid), Number(r.writeOffAmount))),
```
Import `remainingBalance` from `@/lib/payment-state` and `OrderStatus` from `@prisma/client` if not already imported.

- [ ] **Step 7: Verify**

`cd precast-crm && npx tsc --noEmit && npx vitest run` — all green (1627+ tests). If the local dev server is running (`http://localhost:3000`), `curl -s "http://localhost:3000/api/orders?pageSize=1&sort=desc" -H "Cookie: …"` is optional; the type check is the gate.

- [ ] **Step 8: Commit**

`git add precast-crm/src/lib/order-facets.ts precast-crm/src/lib/order-facets.test.ts precast-crm/src/app/api/orders/route.ts precast-crm/src/lib/dashboard-data.ts`
`git commit -m "Feat(api) · order facets, payment and sort params, richer dashboard rows for the mobile"`

---

### Task 2: Android wire and data layer for the new fields

**Files:**
- Modify: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/OrderDto.kt`, `dto/DashboardDto.kt`, `EtalonApi.kt`
- Modify: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Order.kt`, `Dashboard.kt`
- Modify: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/OrdersRepository.kt`, `mapper/OrderMappers.kt`, `mapper/DashboardMappers.kt`
- Test: `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/DashboardMappersTest.kt` (extend), `OrderFacetsMapperTest.kt` (new), `android/core/network/src/test/kotlin/uz/etalon/crm/core/network/DashboardApiTest.kt` (extend)

**Interfaces:**
- Produces (model):
```kotlin
enum class PaymentFilter { DEBT, PAID }
data class OrderFacets(val byStatus: Map<OrderStatus, Int>, val debt: Int, val paid: Int, val total: Int, val totalArea: BigDecimal)
data class TodayDelivery(val orderId: String, val orderNumber: String, val clientName: String, val clientAddress: String?, val area: BigDecimal, val status: OrderStatus, val totalPrice: Money, val remaining: Money)
data class RecentOrder(val orderId: String, val orderNumber: String, val clientName: String, val status: OrderStatus, val scheduledAt: Instant, val totalPrice: Money, val remaining: Money)
data class MonthCollected(val month: String, val collected: Money)
data class Trend(val deltaPct: BigDecimal, val up: Boolean)   // direction != 'down'; 'flat' renders as up-with-0
// HomeSummary gains: val recent: List<RecentOrder>, val collectedThisMonth: Money, val collectedTrend: Trend?, val collectedByMonth: List<MonthCollected>
```
- Produces (data): `OrdersFilter(q, status, day, page, payment: PaymentFilter? = null, sort: String = "desc", pageSize: Int = 20)` with `listKey` covering every field; `OrdersRepository.facets(filter): Flow<OrderFacets?>` keyed by `q|day` and written by `refreshList`.
- Produces (api): `orders(q, status, day, page, pageSize, payment: String?, sort: String)`.

- [ ] **Step 1: DTOs**

`OrderDto.kt`:
```kotlin
@Serializable data class OrderFacetsDto(
    val byStatus: Map<String, Int> = emptyMap(),
    val byPayment: OrderFacetsPaymentDto = OrderFacetsPaymentDto(),
    val total: Int = 0,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal = BigDecimal.ZERO,
)
@Serializable data class OrderFacetsPaymentDto(val debt: Int = 0, val paid: Int = 0)
@Serializable data class OrdersPageDto(
    val items: List<OrderSummaryDto>, val total: Int, val page: Int, val pageSize: Int, val totalPages: Int,
    /** Absent from a server older than Task 1; the list then shows no counts rather than failing to decode. */
    val facets: OrderFacetsDto? = null,
)
```
`DashboardDto.kt` — extend `TodayDeliveryOrderDto` with `val status: String = "PLACED"`, `val clientAddress: String? = null`, `@Serializable(with = BigDecimalSerializer::class) val totalPrice: BigDecimal = BigDecimal.ZERO`, `@Serializable(with = BigDecimalSerializer::class) val remaining: BigDecimal = BigDecimal.ZERO` (KDoc: defaults exist only so an older server still decodes; Task 1 ships the fields). Add:
```kotlin
@Serializable data class RecentOrderDto(
    val id: String, val orderNumber: String, val clientName: String,
    val status: String = "PLACED", val scheduledAt: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val totalPrice: BigDecimal,
    @Serializable(with = BigDecimalSerializer::class) val remaining: BigDecimal = BigDecimal.ZERO,
)
@Serializable data class TrendDto(@Serializable(with = BigDecimalSerializer::class) val deltaPct: BigDecimal, val direction: String)
@Serializable data class CollectedThisMonthDto(@Serializable(with = BigDecimalSerializer::class) val total: BigDecimal, val trend: TrendDto? = null)
@Serializable data class MonthCollectedDto(val month: String, @Serializable(with = BigDecimalSerializer::class) val collected: BigDecimal)
```
and on `DashboardDto`: `val recentOrders: List<RecentOrderDto> = emptyList()`, `val collectedThisMonth: CollectedThisMonthDto? = null`, `val collectedByMonth: List<MonthCollectedDto> = emptyList()`.

`EtalonApi.orders` gains `@Query("payment") payment: String? = null, @Query("sort") sort: String = "asc"`.

- [ ] **Step 2: Failing tests**

`DashboardApiTest.kt` — add a case that decodes a payload carrying `recentOrders`, `collectedThisMonth { total: 13500000, trend: { deltaPct: 8.2, direction: "up", polarity: "positive" } }`, `collectedByMonth` (two entries) and a today row with `status`, `clientAddress`, `totalPrice: 18420000`, `remaining: 18420000` (bare numbers), asserting the `BigDecimal`s; and a case that the pre-Task-1 payload (no new keys) still decodes with the defaults.

`OrderFacetsMapperTest.kt` (`:core:data`):
```kotlin
class OrderFacetsMapperTest {
    @Test fun `unknown statuses are dropped and known ones keyed by enum`() {
        val f = OrderFacetsDto(byStatus = mapOf("PLACED" to 1, "DISPATCHED" to 2, "BOGUS" to 9), byPayment = OrderFacetsPaymentDto(6, 3), total = 3, totalArea = BigDecimal("157.8")).toDomain()
        assertEquals(mapOf(OrderStatus.PLACED to 1, OrderStatus.DISPATCHED to 2), f.byStatus)
        assertEquals(6, f.debt); assertEquals(3, f.paid); assertEquals(3, f.total)
        assertEquals(BigDecimal("157.8"), f.totalArea)
    }
}
```
`DashboardMappersTest.kt` — extend: `RecentOrderDto` with `scheduledAt = null` maps to `Instant.EPOCH`? **No** — a recent order always has a schedule; map `scheduledAt = null` to `placedAt`-less fallback is not available, so the mapper drops such a row (`mapNotNull`) and the test asserts it is dropped. Trend `direction = "down"` → `up = false`; `"flat"` → `up = true` with `deltaPct` as sent.

- [ ] **Step 3: Models and mappers**

Add the model types from Interfaces. `OrderFacetsDto.toDomain()`:
```kotlin
fun OrderFacetsDto.toDomain() = OrderFacets(
    byStatus = byStatus.mapNotNull { (k, v) -> OrderStatus.entries.firstOrNull { it.name == k }?.let { it to v } }.toMap(),
    debt = byPayment.debt, paid = byPayment.paid, total = total, totalArea = totalArea,
)
```
`TodayDeliveryOrderDto.toDomain()` adds `clientAddress`, `status = OrderStatus.from(status)`, `totalPrice = Money(totalPrice)`, `remaining = Money(remaining)`. `RecentOrderDto.toDomain(): RecentOrder?` returns null when `scheduledAt == null`. `DashboardDto.toDomain()` fills `recent`, `collectedThisMonth = Money(collectedThisMonth?.total ?: BigDecimal.ZERO)`, `collectedTrend = collectedThisMonth?.trend?.let { Trend(it.deltaPct, it.direction != "down") }`, `collectedByMonth = collectedByMonth.map { MonthCollected(it.month, Money(it.collected)) }`.

- [ ] **Step 4: Repository**

`OrdersFilter`:
```kotlin
data class OrdersFilter(
    val q: String? = null, val status: OrderStatus? = null, val day: LocalDate? = null, val page: Int = 1,
    val payment: PaymentFilter? = null, val sort: String = "asc", val pageSize: Int = 20,
) {
    val listKey: String get() = "q=${q.orEmpty()}|status=${status?.name.orEmpty()}|day=${day?.toString().orEmpty()}|payment=${payment?.name.orEmpty()}|sort=$sort|size=$pageSize|page=$page"
    /** Facets ignore status, payment and page — this is the key they are stored under. */
    val facetKey: String get() = "q=${q.orEmpty()}|day=${day?.toString().orEmpty()}"
}
```
Add `private val facetsByKey = MutableStateFlow<Map<String, OrderFacets>>(emptyMap())`, cleared where `listOutcomes` is cleared on sign-out. In `refreshList`, pass `payment = filter.payment?.name?.lowercase()`, `sort = filter.sort`, `pageSize = filter.pageSize` to `api.orders(...)`, and after the epoch check: `page.facets?.let { f -> facetsByKey.update { m -> m + (filter.facetKey to f.toDomain()) } }`. Add:
```kotlin
fun facets(filter: OrdersFilter): Flow<OrderFacets?> = facetsByKey.map { it[filter.facetKey] }.distinctUntilChanged()
```
Keep the existing default `sort = "asc"` on the filter so every existing caller and test is unchanged; the orders list ViewModel (Task 6) is the one that asks for `"desc"`.

- [ ] **Step 5: Verify** — `.\gradlew.bat :core:network:testDebugUnitTest :core:data:testDebugUnitTest :core:model:testDebugUnitTest --no-daemon --rerun-tasks` green; then the full standard command.

- [ ] **Step 6: Commit** — `Feat(android) · facets, payment filter and richer dashboard rows on the wire`

---

### Task 3: Formatters — long date, month header, order number

**Files:**
- Modify: `android/core/ui/src/main/kotlin/uz/etalon/crm/core/ui/format/Formatters.kt`
- Test: `android/core/ui/src/test/kotlin/uz/etalon/crm/core/ui/format/FormattersTest.kt`

**Interfaces:**
- Produces: `formatLongDate(t: Instant): String` → «Сешанба, 9 сентябрь»; `formatMonthYear(ym: YearMonth): String` → «Сентябрь 2026»; `formatOrderNo(orderNumber: String): String` → «№ 09‑0003» (U+2011 between 09 and 0003; the leading `2026-` dropped; a number without a hyphen is returned as «№ » + itself).

- [ ] **Step 1: Failing tests**
```kotlin
@Test fun longDateIsWeekdayDayMonthInUzbekCyrillic() {
    assertEquals("Чоршанба, 9 сентябрь", formatLongDate(Instant.parse("2026-09-08T19:30:00Z"))) // 00:30 on Wed 9 Sep 2026 in Tashkent — the capture's «Сешанба» is the designer's fiction; the real calendar wins
}
@Test fun monthYearHeader() { assertEquals("Сентябрь 2026", formatMonthYear(YearMonth.of(2026, 9))) }
@Test fun orderNoDropsTheYearAndUsesANonBreakingHyphen() {
    assertEquals("№ 09\u20110003", formatOrderNo("2026-09-0003"))
    assertEquals("№ X17", formatOrderNo("X17"))
}
```
- [ ] **Step 2: Run — fail on unresolved references**
- [ ] **Step 3: Implement**
```kotlin
val UZ_MONTHS_FULL = listOf("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь")
/** Monday first, matching java.time's DayOfWeek ordinal. */
val UZ_WEEKDAYS = listOf("Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба", "Якшанба")

/** Home's subtitle: «Сешанба, 9 сентябрь». */
fun formatLongDate(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${UZ_WEEKDAYS[z.dayOfWeek.value - 1]}, ${z.dayOfMonth} ${UZ_MONTHS_FULL[z.monthValue - 1]}"
}

/** A month group header on the orders list: «Сентябрь 2026». */
fun formatMonthYear(ym: YearMonth): String =
    UZ_MONTHS_FULL[ym.monthValue - 1].replaceFirstChar { it.uppercase() } + " " + ym.year

private const val NB_HYPHEN = '\u2011'

/** «№ 09‑0003» for `2026-09-0003`: the year is dropped (it is on every row of a list), the
 *  remaining hyphen is U+2011 so a number never breaks across lines. */
fun formatOrderNo(orderNumber: String): String {
    val rest = orderNumber.substringAfter('-', orderNumber)
    return "№ " + rest.replace('-', NB_HYPHEN)
}
```
- [ ] **Step 4: Run — pass.** Then `:core:ui:testDebugUnitTest --rerun-tasks`.
- [ ] **Step 5: Commit** — `Feat(android) · long date, month header and order-number formatters`

---

### Task 4: Shell — the nav pill, five destinations, the account sheet

**Files:**
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/shell/Destinations.kt`, `nav/Keys.kt`, `nav/StartKey.kt`, `nav/EtalonNavHost.kt`, `app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/kotlin/uz/etalon/crm/shell/AccountSheet.kt`; `android/core/designsystem/src/main/res/drawable/ic_lu_file_text.xml`; `android/app/src/test/kotlin/uz/etalon/crm/nav/TabForTest.kt`
- Delete: `android/app/src/main/kotlin/uz/etalon/crm/shell/MoreScreen.kt`
- Modify: `android/core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/icon/EtalonIcons.kt`
- Test: `android/app/src/test/kotlin/uz/etalon/crm/shell/DestinationsTest.kt` (rewrite)

**Interfaces:**
- Consumes: `BottomNav(items: List<BottomNavItem>, selectedIndex: Int, onSelect: (Int) -> Unit)`, `BottomNavScrim()`, `EtalonIcons.*`, `Avatar`, `EtalonIconButton`.
- Produces: `enum class Destination { HOME, ORDERS, CALCULATOR, PAYMENTS, CLIENTS }` in bar order; `destinationsFor(me): List<Destination>`; `tabFor(key: NavKey): Destination?`; `HomeRoute(me, onOpenOrder, onOpenOrders, onOpenAccount)` (Task 5 implements it — this task wires the call site with the new signature, so Tasks 4 and 5 land as ONE dispatch; see the note at the end of Task 5); `AccountSheet(me, pendingUploads, onDrivers, onDiscrepancies, onChangePin, onSignOut, onDismiss)`.

- [ ] **Step 1: The orders glyph.** Add `ic_lu_file_text.xml` — Lucide `file-text` as a 24 dp VectorDrawable, 2 dp stroke, `?attr/colorControlNormal`-free (tint is applied by `Icon`), same structure as the existing `ic_lu_*.xml` files (open one and copy its header). Add `val FileText = R.drawable.ic_lu_file_text` to `EtalonIcons`. Add it to the icon sheet test's list if `IconRenderTest` enumerates members (it does — extend the list).

- [ ] **Step 2: Failing tests**

Rewrite `DestinationsTest.kt`:
```kotlin
@Test fun `the bar holds the five cells in order, filtered by permission`() {
    assertEquals(listOf(Destination.HOME, Destination.ORDERS, Destination.CALCULATOR, Destination.PAYMENTS, Destination.CLIENTS),
        destinationsFor(me("order.view", "calculator.use", "payment.view", "client.view")))
}
@Test fun `a driver sees home and orders only`() {
    assertEquals(listOf(Destination.HOME, Destination.ORDERS), destinationsFor(me("order.view", "payment.record")))
}
@Test fun `home needs no permission`() { assertEquals(listOf(Destination.HOME), destinationsFor(me())) }
```
`TabForTest.kt`:
```kotlin
@Test fun `order routes light the orders cell`() {
    listOf(OrderDetail("o"), LoadTruck("o", false), Shipments("o"), ShipmentLoad("o", "s"), Dispatch("o"), DeliveryProof("o"), DeliveryLocation("o"), RecordPayment("o"))
        .forEach { assertEquals(Destination.ORDERS, tabFor(it), it.toString()) }
}
@Test fun `home-sheet routes light the home cell`() {
    listOf(Drivers, Discrepancies, ChangePin(false)).forEach { assertEquals(Destination.HOME, tabFor(it), it.toString()) }
}
@Test fun `tabs map to themselves`() {
    assertEquals(Destination.CLIENTS, tabFor(ClientDetail("c"))); assertEquals(Destination.PAYMENTS, tabFor(Payments)); assertEquals(Destination.CALCULATOR, tabFor(Calculator))
}
```

- [ ] **Step 3: Destinations**

`Destinations.kt` becomes:
```kotlin
/** The five nav-pill cells (design doc D3, §4), in bar order. Every one has a screen. */
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    CLIENTS(R.string.nav_clients, R.string.nav_clients_short, "client.view"),
}

/** The permitted cells, in bar order. A role lacking a permission simply has fewer cells (§4). */
fun destinationsFor(me: Me): List<Destination> =
    Destination.entries.filter { it.requires == null || me.can(it.requires) }
```
Remove `moreDestinationsFor`, `allowedFor`, `hasScreen`, `MAX_BEFORE_MORE`. In `Keys.kt` delete `More` and `ComingSoon`. In `StartKey.kt`, `Destination.key()` loses its `else`/`MORE` branches, and add:
```kotlin
/** Which cell is lit while [key] is on top of the stack (ruling R8). */
internal fun tabFor(key: NavKey): Destination? = when (key) {
    is Home, is Drivers, is Discrepancies, is ChangePin -> Destination.HOME
    is Orders, is OrderDetail, is LoadTruck, is Shipments, is ShipmentLoad, is Dispatch,
    is DeliveryProof, is DeliveryLocation, is RecordPayment -> Destination.ORDERS
    is Calculator -> Destination.CALCULATOR
    is Payments -> Destination.PAYMENTS
    is Clients, is ClientDetail -> Destination.CLIENTS
    else -> null
}
```
Delete the unused `nav_inbox*`, `nav_production*`, `nav_gazoblok*`, `nav_more*`, `coming_soon` strings; keep `no_access`, the role strings, `more_*` (renamed below) and the sign-out strings.

- [ ] **Step 4: Account sheet**

`shell/AccountSheet.kt` (replaces `MoreScreen.kt`; `roleLabel` and `MoreViewModel` move here, the ViewModel renamed `AccountViewModel`):
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSheet(
    me: Me, pendingUploads: Int,
    onDrivers: () -> Unit, onDiscrepancies: () -> Unit, onChangePin: () -> Unit, onSignOut: () -> Unit, onDismiss: () -> Unit,
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = EtalonColors.surface, shape = EtalonShapes.sheetTop, dragHandle = null) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(me.name, size = 40.dp)
                Column {
                    Text(me.name, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(stringResource(roleLabel(me.role)), style = EtalonType.meta, color = EtalonColors.ink2)
                }
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)
            if (me.can(PERM_DRIVER_VIEW)) AccountRow(EtalonIcons.Users, stringResource(R.string.account_drivers), onDrivers)
            if (me.can(PERM_DISCREPANCY_VIEW)) AccountRow(EtalonIcons.CircleAlert, stringResource(R.string.account_discrepancies), onDiscrepancies)
            AccountRow(EtalonIcons.Pencil, stringResource(R.string.account_change_pin), onChangePin)
            AccountRow(EtalonIcons.X, stringResource(R.string.account_sign_out), onClick = { if (pendingUploads > 0) confirmSignOut = true else onSignOut() }, tint = EtalonColors.red)
            Spacer(Modifier.navigationBarsPadding().height(8.dp))
        }
    }
    if (confirmSignOut) {
        ConfirmSheet( /* the designsystem one: title = sign_out_pending_title, body = sign_out_pending_message(pendingUploads),
                        confirm = account_sign_out → { confirmSignOut = false; onSignOut() }, cancel = app_action_cancel */ )
    }
}

@Composable
private fun AccountRow(@DrawableRes icon: Int, label: String, onClick: () -> Unit, tint: Color = EtalonColors.ink) = Row(
    Modifier.fillMaxWidth().minimumInteractiveComponentSize().clickable(onClick = onClick, role = Role.Button).padding(vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
) {
    Icon(painterResource(icon), null, Modifier.size(20.dp), tint = tint)
    Text(label, style = EtalonType.body, color = tint)
}
```
Read `ConfirmSheet.kt`'s real signature (Task 11 of phase 1) and call it with those parameters; the comment above is the mapping, not the code. Strings: rename `more_drivers → account_drivers`, `more_discrepancies → account_discrepancies`, `more_change_pin → account_change_pin`, `more_sign_out → account_sign_out` (values unchanged: «Ҳайдовчилар», «Нақд пул тафовутлари», «PIN ни ўзгартириш», «Чиқиш»).

- [ ] **Step 5: The shell**

In `EtalonNavHost.kt` replace `NavigationSuiteScaffold` with:
```kotlin
    val destinations = destinationsFor(me)
    val current = backStack.lastOrNull()
    val selected = destinations.indexOf(current?.let(::tabFor))
    var showAccount by remember { mutableStateOf(false) }
    val labels = destinations.map { stringResource(it.shortLabelRes) }
    val descriptions = destinations.map { stringResource(it.labelRes) }
    val items = remember(destinations, labels) { destinations.mapIndexed { i, d -> BottomNavItem(d.icon(), labels[i], descriptions[i]) } }

    Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
        NavDisplay( … exactly as today, with the More/ComingSoon entries removed and the Home entry changed to:
            entry<Home> {
                HomeRoute(
                    me = me,
                    onOpenOrder = { backStack.add(OrderDetail(it)) },
                    onOpenOrders = { switchTab(backStack, Orders) },
                    onOpenAccount = { showAccount = true },
                )
            }
        )
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
            BottomNavScrim()
            BottomNav(items = items, selectedIndex = selected, onSelect = { i -> switchTab(backStack, destinations[i].key()) })
        }
    }
    if (showAccount) {
        val vm: AccountViewModel = hiltViewModel()
        val pending by vm.pendingUploads.collectAsStateWithLifecycle()
        AccountSheet(
            me = me, pendingUploads = pending,
            onDrivers = { showAccount = false; backStack.add(Drivers) },
            onDiscrepancies = { showAccount = false; backStack.add(Discrepancies) },
            onChangePin = { showAccount = false; backStack.add(ChangePin(forced = false)) },
            onSignOut = { showAccount = false; onSignOut() },
            onDismiss = { showAccount = false },
        )
    }
```
with `private fun switchTab(backStack: NavBackStack<NavKey>, target: NavKey) { backStack.add(target); while (backStack.size > 1) backStack.removeAt(0) }` (the existing add-then-trim comment moves with it) and
```kotlin
private fun Destination.icon(): Int = when (this) {
    Destination.HOME -> EtalonIcons.House
    Destination.ORDERS -> EtalonIcons.FileText
    Destination.CALCULATOR -> EtalonIcons.Calculator
    Destination.PAYMENTS -> EtalonIcons.Wallet
    Destination.CLIENTS -> EtalonIcons.Users
}
```
`BottomNav` with `selectedIndex = -1` must light nothing — check `BottomNav.kt`; if it indexes the list, guard with `if (selected >= 0)` … no: read it, and if it throws on -1, change the component to treat any out-of-range index as "no active cell" (a one-line fix in `:core:designsystem`, ledgered). Remove the `material.icons` and `NavigationSuiteScaffold` imports and the `androidx.compose.material3.adaptive` dependency from `app/build.gradle.kts` if nothing else uses it (grep first).

- [ ] **Step 6: Verify** — `:app:testDebugUnitTest --rerun-tasks` green (DestinationsTest, TabForTest, MainViewModelTest); the full standard command is run at the end of Task 5 because `HomeRoute`'s new signature lands there.

- [ ] **Step 7: Commit** together with Task 5 (one dispatch, two commits are fine: `Feat(android) · nav pill shell, five cells, account sheet` then Task 5's).

---

### Task 5: Home — app bar, KPI row, today sheet, recent orders

**Files:**
- Modify: `android/feature/home/src/main/kotlin/uz/etalon/crm/feature/home/HomeScreen.kt`, `HomeViewModel.kt`, `android/feature/home/src/main/res/values/strings.xml`
- Create: `android/feature/home/src/main/kotlin/uz/etalon/crm/feature/home/OutboxSheet.kt`, `android/feature/home/src/test/kotlin/uz/etalon/crm/feature/home/HomeScreenshotTest.kt`
- Test: `HomeViewModelTest.kt` (extend)

**Interfaces:**
- Consumes: `KpiMoneyCard`, `KpiCard`, `KpiAccent`, `NavySheet`, `OrderRow`, `Avatar`, `EtalonIconButton`, `ErrorBanner`, `EmptyState`-free (empty states are text on the sheet), `formatLongDate`, `formatScheduleDate`, `formatAddressLine`, `formatArea`, `formatMoney`, `HomeSummary.recent/collectedThisMonth/collectedTrend/collectedByMonth`.
- Produces: `HomeRoute(me: Me, onOpenOrder: (String) -> Unit, onOpenOrders: () -> Unit, onOpenAccount: () -> Unit)`; `HomeScreen(s, me, now: Instant, onRefresh, onOpenOrder, onOpenOrders, onOpenAccount, onOpenOutbox)`; `HomeTiles` gains `collectedThisMonth: Money, collectedTrend: Trend?, collectedByMonth: List<Money>`; `HomeUiState` gains `recent: List<RecentOrder>`.

- [ ] **Step 1: Strings** (`feature/home/res/values/strings.xml`; keep the existing ones):
```xml
<string name="home_brand">ETALON</string>
<string name="home_tagline">Йиғма монолит</string>
<string name="home_title">Бошқарув</string>
<string name="home_subtitle_suffix">барча буюртмалар бир жойда</string>
<string name="home_kpi_receivables">Қарздорлик</string>
<string name="home_kpi_receivables_note">%1$d буюртмада қолди</string>
<string name="home_kpi_collected">Ойлик тушум</string>
<string name="home_kpi_collected_up">↑ %1$s ўтган ойга нисбатан</string>
<string name="home_kpi_collected_down">↓ %1$s ўтган ойга нисбатан</string>
<string name="home_kpi_today">Бугунги етказиш</string>
<string name="home_kpi_today_note">%1$d буюртма</string>
<string name="home_recent">Сўнгги буюртмалар</string>
<string name="home_recent_all">Барчаси</string>
<string name="home_recent_empty">Ҳали буюртма йўқ</string>
<string name="home_paid">тўланган</string>
<string name="home_debt">қолди %1$s</string>
<string name="home_bell">Юборилмаган маълумотлар</string>
<string name="home_account">Ҳисоб қайдномаси</string>
```
Delete `home_tile_today`, `home_tile_discrepancies`, `home_tile_receivables` (their cards are gone). Keep `home_today_section`? No — the sheet title is `home_kpi_today`'s twin «Бугунги етказиш»; delete `home_today_section` and keep `home_today_empty`, `home_today_no_access`, `home_outbox_clear`.

- [ ] **Step 2: ViewModel** — `HomeTiles` and `HomeUiState` per Interfaces; `load()` fills them from `HomeSummary` (`collectedByMonth = s.collectedByMonth.map { it.collected }`, `recent = s.recent`). Extend `HomeViewModelTest` with one case: a summary carrying two recent orders and a 12-entry series yields `state.recent.size == 2` and `tiles.collectedByMonth.size == 12`; the Forbidden case still clears `recent`.

- [ ] **Step 3: Failing screenshot test** — `HomeScreenshotTest.kt`, same harness as `OrderDetailScreenshotTest` (Robolectric NATIVE, sdk 36, `w411dp-h891dp`), fixtures that reproduce the capture: receivables `53 268 760` over 6 orders; collected `13 500 000`, trend `8.2` up, series of 12 with the last the highest; today = 3 rows (Tashkent Tower LLC «Тошкент, Юнусобод», 108,2 м², 18 420 000 / 18 420 000 IN_PRODUCTION; Yusupov & Sons «Бухоро, Эски шаҳар» 78,7 м² 13 350 000 / 7 350 000 DISPATCHED; BuildPro Group «Тошкент, Мирзо-Улуғбек» 42,6 м² 7 340 840 / 4 340 840 DISPATCHED); recent = 4 (Fergana Dom PLACED 4 сен 6 210 000 / 6 210 000; Tashkent Tower IN_PRODUCTION 2 сен; Yusupov DISPATCHED; Karimov LLC DELIVERED remaining 0). `now = Instant.parse("2026-09-08T19:30:00Z")` (Wednesday 9 Sep 2026 in Tashkent; the subtitle reads «Чоршанба, 9 сентябрь»). Tests: `home_light`, `home_empty_light` (today empty, recent empty), `home_no_access_light` (`hasDashboardAccess=false`), `home_font13` (1.3). Baselines under `feature/home/screenshots/`.

- [ ] **Step 4: The screen**

```kotlin
@Composable
fun HomeRoute(me: Me, onOpenOrder: (String) -> Unit, onOpenOrders: () -> Unit, onOpenAccount: () -> Unit, vm: HiltHomeViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showOutbox by remember { mutableStateOf(false) }
    HomeScreen(s, me, Instant.now(), vm::refresh, onOpenOrder, onOpenOrders, onOpenAccount, onOpenOutbox = { showOutbox = true })
    if (showOutbox) OutboxSheet(pending = s.pendingUploads, onDismiss = { showOutbox = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(s: HomeUiState, me: Me, now: Instant, onRefresh: () -> Unit, onOpenOrder: (String) -> Unit, onOpenOrders: () -> Unit, onOpenAccount: () -> Unit, onOpenOutbox: () -> Unit) {
    PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize().background(EtalonColors.page)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = EtalonSpace.underNav), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { AppBarRow(me, s.pendingUploads > 0, onOpenOutbox, onOpenAccount) }
            item { TitleBlock(now) }
            s.error?.let { e -> item { ErrorBanner(e, onRetry = onRefresh, modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin)) } }
            s.tiles?.let { t -> item { KpiRow(t) } }
            item { TodaySheet(s, onOpenOrder) }
            item { RecentSection(s.recent, now, onOpenOrder, onOpenOrders) }
        }
    }
}
```
`AppBarRow`: `Row(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin), verticalAlignment = CenterVertically)` — `Box(Modifier.size(34.dp).clip(EtalonShapes.md).background(Brush.linearGradient(listOf(EtalonColors.indigo, EtalonColors.indigoTint))))`, 10 dp, `Column { Text(home_brand, EtalonType.titleSm.copy(fontWeight = W800, fontSize = 14.sp), ink); Text(home_tagline, EtalonType.meta, ink2) }`, `Spacer(weight 1f)`, `EtalonIconButton(EtalonIcons.Bell, stringResource(home_bell), onOpenOutbox, badge = hasPending, size = 36.dp)`, 8 dp, `Avatar(me.name, Modifier.clickable(role = Button, onClickLabel = home_account) { onOpenAccount() }.minimumInteractiveComponentSize(), size = 36.dp)`.

`TitleBlock`: `Column(padding horizontal headerMargin) { Text(home_title, EtalonType.displayTitle, ink); Text("${formatLongDate(now)} · ${stringResource(home_subtitle_suffix)}", EtalonType.body, ink2) }`.

`KpiRow`: `LazyRow(contentPadding = PaddingValues(horizontal = EtalonSpace.cardMargin), horizontalArrangement = spacedBy(12.dp))` with three items:
```kotlin
KpiMoneyCard(stringResource(home_kpi_receivables), t.receivables, KpiAccent.RED, EtalonIcons.CircleAlert,
    footnote = stringResource(home_kpi_receivables_note, t.receivableOrders), footnotePositive = false)
KpiMoneyCard(stringResource(home_kpi_collected), t.collectedThisMonth, KpiAccent.GREEN, EtalonIcons.TrendingUp,
    footnote = t.collectedTrend?.let { stringResource(if (it.up) home_kpi_collected_up else home_kpi_collected_down, formatPercent(it.deltaPct, 1)) },
    footnotePositive = t.collectedTrend?.up, bars = sparkline(t.collectedByMonth), currentBar = sparkline(t.collectedByMonth).lastIndex)
KpiCard(stringResource(home_kpi_today), formatArea(t.todayArea), accent = KpiAccent.INDIGO, icon = EtalonIcons.Package,
    footnote = stringResource(home_kpi_today_note, t.todayCount))
```
with `private fun sparkline(series: List<Money>): List<Float>` = last 6 values divided by the max (`BigDecimal.divide(max, 4, HALF_UP).toFloat()`), empty when the max is zero — the one permitted crossing, geometry only.

`TodaySheet`: `NavySheet(title = stringResource(home_kpi_today), modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin), fillsToBottom = false, trailing = { CountPill(s.today.size) })` whose content is: no-access → `Text(home_today_no_access, EtalonType.body, onDarkMuted, padding 8)`; empty → `Text(home_today_empty, …)`; else `s.today.forEach { d -> OrderRow(clientName = d.clientName, status = d.status, metaLine = listOfNotNull(formatAddressLine(d.clientAddress), formatArea(d.area)).joinToString(" · "), total = d.totalPrice, debt = d.remaining, paidLabel = stringResource(home_paid), debtLabel = { stringResource(home_debt, formatMoney(it)) }, onDark = true, onClick = { onOpenOrder(d.orderId) }) }`. Hmm — the capture's today rows carry **no status tag** (avatar · name · meta). `OrderRow` takes a non-null `OrderStatus` today; the phase-1 carry list asked for a nullable status. **Make `status: OrderStatus?` on `OrderRow`** (null draws no tag; the meta line moves up beside the avatar) — a signature widening in `:core:designsystem`, re-record `ds_rows_light.png`, ledger it. Today rows pass `status = null`; recent rows pass the status.
`CountPill(n)`: `Text("$n", EtalonType.tag, onDark, Modifier.clip(pill).background(EtalonColors.navy2).padding(horizontal = 8.dp, vertical = 2.dp))`.

`RecentSection`: `Row(padding horizontal headerMargin, SpaceBetween) { Text(home_recent, EtalonType.sectionTitle, ink); Text(home_recent_all, EtalonType.label, EtalonColors.indigo, Modifier.minimumInteractiveComponentSize().clickable(role = Button) { onOpenOrders() }) }` then `Column(Modifier.padding(horizontal = cardMargin).clip(xl).background(surface).border(hairline, surfaceBorder, xl).padding(horizontal = 6.dp, vertical = 4.dp))` with `recent.take(4)` as `OrderRow(onDark = false, status = r.status, metaLine = formatScheduleDate(r.scheduledAt, now), total = r.totalPrice, debt = r.remaining, …)` or `Text(home_recent_empty, body, ink3, padding 12)`.

`OutboxSheet.kt`: `ModalBottomSheet(surface, sheetTop)` with `Text(home_bell, sectionTitle)` and the count line — `pluralStringResource(DesignSystemR.plurals.outbox_pending, n, n)` or `home_outbox_clear` — and a `SecondaryButton(app «Ёпиш» → add string home_close = «Ёпиш»)`.

Remove `HomeTilesSection`, `HomeTile`, `TodayDeliveryRow`, the `SectionLabel`/`StatusStripeCard`/`toneColor`/`MaterialTheme`/`LocalEtalonColors` imports.

- [ ] **Step 5: Record, look, verify** — `:feature:home:recordRoborazziDebug --rerun-tasks`; open `home_light.png` beside `2b-home.png`: logo square, wordmark + tagline, bell with dot, avatar; «Бошқарув» + subtitle; two KPI cards with the third peeking; navy sheet with «3» pill and three rows with red «қолди …»; «Сўнгги буюртмалар» + «Барчаси»; white card with tagged rows; nav pill drawn by the shell is NOT in this baseline (the screen test renders the screen alone — state that in the test KDoc). Then the full standard command with `--rerun-tasks`.

- [ ] **Step 6: Install on the emulator** if one is running: `.\gradlew.bat :app:installDebug --no-daemon`, open Home, and save `adb exec-out screencap -p > <workspace>/home-emulator.png` for the owner. Note in the report if no emulator is up.

- [ ] **Step 7: Commit** — `Feat(android) · Home rebuilt to the prototype: KPI row, today sheet, recent orders`

> Tasks 4 and 5 are ONE dispatch (the shell's `HomeRoute` call and Home's signature change together); the reviewer receives both.

---

### Task 6: Orders list ViewModel — facets, month groups, paging, payment segment, day filter

**Files:**
- Modify: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/list/OrdersListViewModel.kt`
- Create: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/list/OrderGroups.kt`, `android/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/OrderGroupsTest.kt`
- Test: `OrdersListViewModelTest.kt` (extend)

**Interfaces:**
- Produces:
```kotlin
data class MonthGroup(val month: YearMonth, val total: Money, val rows: List<OrderSummary>)
fun groupByMonth(rows: List<OrderSummary>): List<MonthGroup>   // order of first appearance, Tashkent zone
data class OrdersListUiState(
    val query: String = "", val status: OrderStatus? = null, val payment: PaymentFilter? = null, val day: LocalDate? = null,
    val groups: List<MonthGroup> = emptyList(), val facets: OrderFacets? = null,
    val isRefreshing: Boolean = false, val loadingMore: Boolean = false, val hasMore: Boolean = false,
    val error: String? = null, val hasCache: Boolean = false,
)
// ViewModel: setQuery, setStatus, setPayment(PaymentFilter?), setDay(LocalDate?), refresh, loadMore
interface OrdersSource { fun list(f): Flow<Resource<List<OrderSummary>>>; suspend fun refreshList(f); fun facets(f): Flow<OrderFacets?> }
```

- [ ] **Step 1: Failing tests**

`OrderGroupsTest.kt`:
```kotlin
@Test fun `groups keep server order and sum money per month`() {
    val sep1 = order("2026-09-0005", "2026-09-30T18:59:00Z", "6210000.00")   // 23:59 on the 30th in Tashkent
    val sep2 = order("2026-09-0004", "2026-09-02T05:00:00Z", "18420000.00")
    val jul  = order("2026-07-0001", "2026-07-27T05:00:00Z", "29000000.00")
    val g = groupByMonth(listOf(sep1, sep2, jul))
    assertEquals(listOf(YearMonth.of(2026, 9), YearMonth.of(2026, 7)), g.map { it.month })
    assertEquals(Money.parse("24630000.00"), g[0].total)
    assertEquals(listOf(sep1, sep2), g[0].rows)
}
@Test fun `a UTC evening on the last day belongs to the next month in Tashkent`() {
    val g = groupByMonth(listOf(order("x", "2026-08-31T19:30:00Z", "1.00")))
    assertEquals(YearMonth.of(2026, 9), g.single().month)
}
```
`OrdersListViewModelTest.kt` — add: `loadMore` appends page 2's rows after page 1's and `hasMore` is false once `items.size >= facets.total`; `setPayment(DEBT)` resets to page 1 and the filter carries `payment = DEBT`; `setDay` likewise; `facets` reach the state.

- [ ] **Step 2: Implement `OrderGroups.kt`**
```kotlin
fun groupByMonth(rows: List<OrderSummary>): List<MonthGroup> =
    rows.groupBy { YearMonth.from(it.scheduledAt.atZone(TASHKENT)) }     // LinkedHashMap: first-appearance order
        .map { (m, rs) -> MonthGroup(m, rs.fold(Money.ZERO) { a, o -> a + o.totalPrice }, rs) }
```
(`TASHKENT` is the `ZoneId` `Formatters.kt` already defines — make it `public` if it is private, in `:core:ui`.)

- [ ] **Step 3: ViewModel**

Filters: `query`, `status`, `payment`, `day`, `pages: MutableStateFlow(1)`. `base: Flow<OrdersFilter> = combine(query.debounce(300), status, payment, day) { q, s, p, d -> OrdersFilter(q = q.ifBlank { null }, status = s, payment = p, day = d, sort = "desc", pageSize = PAGE_SIZE) }.distinctUntilChanged().onEach { pages.value = 1; refresh(it, 1) }`. The rows: `base.flatMapLatest { f -> pages.flatMapLatest { n -> combine((1..n).map { p -> source.list(f.copy(page = p)) }) { arr -> merge(arr.toList()) } } }` where `merge` returns `Resource.Success(all rows concatenated)` when every page is Success/Loading-with-cache, `Resource.Error(rows so far, e)` on the first error, `Resource.Loading(rows so far or null)` otherwise. `facets = base.flatMapLatest { source.facets(it) }`. `loadMore()`: if `!loadingMore && hasMore` → `pages.value += 1` and `refreshList(f.copy(page = n))`. `hasMore = facets?.let { rows.size < it.total } ?: (rows.size >= PAGE_SIZE * pages)`. `PAGE_SIZE = 50`. Keep the existing "re-arm one refresh when the cache empties under a live collector" logic per page flow — copy it into the per-page `source.list` wrapper unchanged.

- [ ] **Step 4: Run — pass.** `:feature:orders:testDebugUnitTest --rerun-tasks`.

- [ ] **Step 5: Commit** — `Feat(android) · orders list state: facets, month groups, paging, payment and day filters`

---

### Task 7: Orders list screen

**Files:**
- Modify: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/list/OrdersListScreen.kt`, `android/feature/orders/src/main/res/values/strings.xml`, `android/app/src/main/kotlin/uz/etalon/crm/nav/EtalonNavHost.kt` (the Orders entry gains `onNewOrder`)
- Delete: `list/OrderCard.kt`, `src/test/…/OrderCardScreenshotTest.kt`, `feature/orders/screenshots/order_card_*.png`
- Create: `src/test/…/OrdersListScreenshotTest.kt`

**Interfaces:**
- Consumes: `SearchField`, `EtalonFilterChip(label, selected, onClick, count)`, `SegmentedControl(items, selectedIndex, onSelect, onNavy = true)`, `MonthHeader(label, total, onDark)`, `OrderRow`, `PrimaryButton(compact, leadingIcon)`, `EtalonIconButton(badge)`, `ErrorBanner`, `formatMonthYear`, `formatArea`, `formatOrderNo`, `orderStatusLabel`.
- Produces: `OrdersListRoute(onOpenOrder, onNewOrder: () -> Unit)` — the shell passes `onNewOrder = { switchTab(backStack, Calculator) }` when `me.can(PERM_CALCULATOR_USE)`, else `null` and the button is hidden (`onNewOrder: (() -> Unit)?`).

- [ ] **Step 1: Strings** (add; keep the rest):
```xml
<string name="orders_count_area">%1$d буюртма · %2$s</string>
<string name="orders_new">Янги</string>
<string name="orders_search_placeholder">Мижоз, № ёки телефон</string>
<string name="orders_filter_day">Кун бўйича</string>
<string name="orders_list_title">Рўйхат</string>
<string name="orders_seg_all">Барчаси</string>
<string name="orders_seg_debt">Қарз</string>
<string name="orders_seg_paid">Тўланган</string>
<string name="orders_not_found">Буюртма топилмади.</string>
<string name="orders_paid">тўланган</string>
<string name="orders_debt">қолди %1$s</string>
<string name="orders_day_pick">Танлаш</string>
<string name="orders_day_clear">Тозалаш</string>
```
Delete `orders_search_hint`, `orders_empty`, `paging_prev`, `paging_next`.

- [ ] **Step 2: Failing screenshot test** — `OrdersListScreenshotTest.kt` rendering `OrdersListScreen` with a state reproducing the capture: facets total 9 / area 563,2 m² / byStatus PLACED 1, IN_PRODUCTION 1, DISPATCHED 2, DELIVERED 5 / debt 6 paid 3; groups Сентябрь 2026 (5 rows: Fergana Dom PLACED 09-0005 36,5 м² 6 210 000 debt; Tashkent Tower LLC IN_PRODUCTION 09-0004 108,2 м² 18 420 000 debt; Yusupov & Sons DISPATCHED 09-0003 78,7 13 350 000 / 7 350 000; BuildPro Group DISPATCHED 09-0002 42,6 7 340 840 / 4 340 840; Karimov LLC DELIVERED 09-0001 26,9 4 162 500 paid), Июль 2026 (Rahimov Construction DELIVERED 07-0001 206,0 29 000 000 / 14 500 000), Июнь 2026 (Andijon Stroy DELIVERED 4 947 920 paid). Tests: `orders_list_light`, `orders_list_empty_light` (no groups, facets zero → «Буюртма топилмади.»), `orders_list_error_light` (error + cached groups), `orders_list_font13`.

- [ ] **Step 3: The screen**

```kotlin
@Composable
fun OrdersListScreen(s: OrdersListUiState, onQuery: (String) -> Unit, onStatus: (OrderStatus?) -> Unit, onPayment: (PaymentFilter?) -> Unit,
                     onDay: (LocalDate?) -> Unit, onRefresh: () -> Unit, onLoadMore: () -> Unit, onOpen: (String) -> Unit, onNewOrder: (() -> Unit)?) {
    var pickDay by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(EtalonColors.page)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = 12.dp), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.orders_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
                s.facets?.let { Text(stringResource(R.string.orders_count_area, it.total, formatArea(it.totalArea)), style = EtalonType.meta, color = EtalonColors.ink2) }
            }
            if (onNewOrder != null) PrimaryButton(stringResource(R.string.orders_new), onNewOrder, compact = true, leadingIcon = EtalonIcons.Plus)
        }
        Row(Modifier.padding(horizontal = EtalonSpace.cardMargin), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            SearchField(s.query, onQuery, stringResource(R.string.orders_search_placeholder), Modifier.weight(1f), onClear = { onQuery("") })
            EtalonIconButton(EtalonIcons.SlidersHorizontal, stringResource(R.string.orders_filter_day), onClick = { pickDay = true }, badge = s.day != null, shape = EtalonShapes.md)
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = EtalonSpace.cardMargin), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(STATUS_CHIPS) { st ->
                EtalonFilterChip(
                    label = if (st == null) stringResource(R.string.orders_seg_all) else stringResource(orderStatusLabel(st)),
                    selected = s.status == st, onClick = { onStatus(st) },
                    count = s.facets?.let { f -> if (st == null) f.total else f.byStatus[st] ?: 0 },
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        s.error?.let { ErrorBanner(it, onRetry = onRefresh, modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin).padding(bottom = 10.dp)) }
        NavyList(s, onPayment, onOpen, onLoadMore, onRefresh)
    }
    if (pickDay) DayPickerDialog(s.day, onPick = { onDay(it); pickDay = false }, onClear = { onDay(null); pickDay = false }, onDismiss = { pickDay = false })
}
```
`STATUS_CHIPS = listOf(null, PLACED, IN_PRODUCTION, DISPATCHED, DELIVERED, CANCELED)` (the app's real statuses; the capture's five plus CANCELED at the end).

`NavyList`: the sheet is the scrolling region —
```kotlin
val listState = rememberLazyListState()
val nearEnd by remember { derivedStateOf { val l = listState.layoutInfo; l.visibleItemsInfo.lastOrNull()?.index ?: 0 >= l.totalItemsCount - 4 } }
LaunchedEffect(nearEnd, s.hasMore) { if (nearEnd && s.hasMore && !s.loadingMore) onLoadMore() }
PullToRefreshBox(isRefreshing = s.isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
    LazyColumn(state = listState, modifier = Modifier.fillMaxSize().clip(EtalonShapes.sheetTop).background(EtalonColors.navy),
               contentPadding = PaddingValues(start = 10.dp, end = 10.dp, top = 14.dp, bottom = EtalonSpace.underNav)) {
        item {
            Row(Modifier.fillMaxWidth().padding(start = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.orders_list_title), style = EtalonType.sectionTitle, color = EtalonColors.onDark)
                SegmentedControl(
                    items = listOf(SegmentItem(stringResource(R.string.orders_seg_all), s.facets?.total), SegmentItem(stringResource(R.string.orders_seg_debt), s.facets?.debt), SegmentItem(stringResource(R.string.orders_seg_paid), s.facets?.paid)),
                    selectedIndex = when (s.payment) { null -> 0; PaymentFilter.DEBT -> 1; PaymentFilter.PAID -> 2 },
                    onSelect = { onPayment(when (it) { 1 -> PaymentFilter.DEBT; 2 -> PaymentFilter.PAID; else -> null }) },
                )
            }
        }
        if (s.groups.isEmpty() && !s.isRefreshing) item { Text(stringResource(R.string.orders_not_found), style = EtalonType.body.copy(fontSize = 13.sp), color = EtalonColors.onDarkMuted, modifier = Modifier.padding(16.dp)) }
        s.groups.forEach { g ->
            item(key = "m-${g.month}") { MonthHeader(formatMonthYear(g.month), g.total) }
            items(g.rows, key = { it.id }) { o ->
                OrderRow(clientName = o.client.name, status = o.status,
                    metaLine = "${formatOrderNo(o.orderNumber)} · ${formatArea(o.totalArea)}",
                    total = o.totalPrice, debt = o.remaining,
                    paidLabel = stringResource(R.string.orders_paid), debtLabel = { stringResource(R.string.orders_debt, formatMoney(it)) },
                    onDark = true, onClick = { onOpen(o.id) })
            }
        }
        if (s.loadingMore) item { Box(Modifier.fillMaxWidth().padding(12.dp), Alignment.Center) { CircularProgressIndicator(color = EtalonColors.lavender, strokeWidth = 2.dp, modifier = Modifier.size(20.dp)) } }
    }
}
```
`DayPickerDialog`: M3 `DatePickerDialog` with `rememberDatePickerState(initialSelectedDateMillis = day?.atStartOfDay(TASHKENT)?.toInstant()?.toEpochMilli())`, confirm `TextButton(orders_day_pick)`, dismiss `TextButton(orders_day_clear)` calling `onClear`; colours `DatePickerDefaults.colors(containerColor = EtalonColors.surface, selectedDayContainerColor = EtalonColors.indigo, todayDateBorderColor = EtalonColors.indigo)`. Convert the picked millis with `Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()` (the picker reports UTC midnight).

Update `OrdersListRoute` to pass the new callbacks; the shell's Orders entry: `OrdersListRoute(onOpenOrder = …, onNewOrder = if (me.can(PERM_CALCULATOR_USE)) ({ switchTab(backStack, Calculator) }) else null)`.

- [ ] **Step 4: Record, look, verify** — beside `2b-orders.png`: title + «9 буюртма · 563,2 м²»; «+ Янги» pill; search + filter square; chips with counts, «Барчаси 9» navy; navy sheet with «Рўйхат» + segmented; «Сентябрь 2026 … 49 483 340» header; rows with avatar, name, tag, «№ 09‑0005 · 36,5 м²», amount, red «қолди …» or green «тўланган». Full standard command.

- [ ] **Step 5: Emulator** — install, open Orders, `screencap` to the workspace.

- [ ] **Step 6: Commit** — `Feat(android) · Orders rebuilt to the prototype: header, search, chips, navy month list`

---

### Task 8: Order detail screen

**Files:**
- Modify: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/detail/OrderDetailScreen.kt`, `android/feature/orders/src/main/res/values/strings.xml`
- Create: `detail/Timeline.kt`, `src/test/…/TimelineTest.kt`
- Rewrite: `src/test/…/OrderDetailScreenshotTest.kt`; delete `feature/orders/screenshots/order_detail_bar_*.png` (six)

**Interfaces:**
- Consumes: `DetailPanel(caption, headline, statusTag, clientName, addressLine, tiles, totals, onBack, dateLabel, onCall)`, `RoomTile(areaText, caption)`, `PanelTotal(caption, value, valueColor)`, `ProgressCard(label, fraction, percentText, paidLabel, remainingLabel, settled)`, `StepTimeline(steps)`, `StickyActionBar`, `PrimaryButton`, `SecondaryButton`, `StatusTag(status, TagSurface.PANEL_ON_INDIGO, short = true)`, `PaymentStatusTag`, `ShipmentStatusTag`, `OutboxBanner`, `ErrorBanner`, `PhotoStrip`, `Lightbox`, `formatOrderNo`, `formatDate`, `formatArea`, `formatMoney`, `formatDecimal`, `formatAddressLine`, `nextStepFor`, `canRecordPayment`, `canOpenShipments`, `canAddPhoto`.
- Produces: `data class StepSpec(@StringRes val labelRes: Int, val caption: String?, val state: StepState)`; `fun timelineFor(o: OrderDetail): List<StepSpec>` (four steps).

- [ ] **Step 1: Strings** (add):
```xml
<string name="detail_caption">Буюртма</string>
<string name="detail_area">Майдон</string>
<string name="detail_total">Жами</string>
<string name="detail_remaining">Қолди</string>
<string name="detail_room_dims">%1$s · %2$s × %3$s</string>
<string name="detail_payment_state">Тўлов ҳолати</string>
<string name="detail_percent_paid">%1$d%% тўланган</string>
<string name="detail_paid_amount">Тўланган %1$s</string>
<string name="detail_remaining_amount">Қолди %1$s</string>
<string name="detail_delivery">Етказиш</string>
<string name="step_placed">Қабул</string>
<string name="step_production">Ишлаб чиқ.</string>
<string name="step_dispatched">Йўлда</string>
<string name="step_delivered">Етказилди</string>
<string name="detail_date">Сана</string>
<string name="detail_driver">Ҳайдовчи</string>
<string name="detail_no_driver">—</string>
<string name="detail_payments">Тўловлар</string>
<string name="action_load">Юклаш</string>
<string name="action_delivered">Етказилди</string>
<string name="action_record_payment">Тўлов қайд қилиш</string>
```
Keep every existing string the screen still uses (`shipments`, `split_into_shipments`, `orders_shipment_n`, `photos`, `events`, `pending_amount`, `paid_of_total` may go if unused — remove only what the new screen no longer references). `action_load_truck` / `action_delivery_proof` / `order_action_record_payment` are replaced by the three new action strings; delete them.

- [ ] **Step 2: Failing tests**

`TimelineTest.kt`:
```kotlin
@Test fun `a placed order is on step one with its placed date`() {
    val t = timelineFor(order(OrderStatus.PLACED))
    assertEquals(listOf(StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING), t.map { it.state })
    assertEquals("1 сен 2026", t[0].caption)
}
@Test fun `a dispatched order has two done, one current, one upcoming`() {
    val t = timelineFor(order(OrderStatus.DISPATCHED, dispatchedAt = Instant.parse("2026-09-03T05:00:00Z")))
    assertEquals(listOf(StepState.DONE, StepState.DONE, StepState.CURRENT, StepState.UPCOMING), t.map { it.state })
    assertEquals("✓", t[1].caption); assertEquals("3 сен 2026", t[2].caption)
}
@Test fun `delivered marks all four done`() { assertTrue(timelineFor(order(OrderStatus.DELIVERED)).all { it.state == StepState.DONE }) }
@Test fun `canceled leaves every step upcoming`() { assertTrue(timelineFor(order(OrderStatus.CANCELED)).all { it.state == StepState.UPCOMING }) }
```
`OrderDetailScreenshotTest.kt` (rewrite): fixtures reproducing `2b-order-detail.png` — order `2026-09-0003`, Yusupov & Sons, «Бухоро, Эски шаҳар, Хўжа Нуробод кўч. 7», scheduled 30 Aug 2026, three rooms (Зал 5,8×6,4 → 37,1 м²; Хона 1 4,4×5,2 → 22,9; Хона 2 4,0×4,8 → 19,2), total area 78,7, total 13 350 000, confirmed 6 000 000 (45 %), status DISPATCHED with `dispatch = DispatchInfo(driverName = "Азиз", dispatchedAt = 2026-09-03)`, one CONFIRMED payment of 6 000 000, one shipment (DISPATCHED, driver Азиз, truck 01A777AA). Frames: `order_detail_dispatched_light` (the capture's state), `order_detail_placed_light` (PLACED, no payments, bar = «Юклаш» + «Тўлов қайд қилиш»), `order_detail_delivered_paid_light` (DELIVERED, fully paid → no bar, ProgressCard settled), `order_detail_blocked_light` (a pending upload → bar's secondary disabled «Юборилмоқда…»), `order_detail_font13` (dispatched at 1.3). `me` = SALES with `order.view`, `order.edit`, `payment.record`.

- [ ] **Step 3: `Timeline.kt`**
```kotlin
data class StepSpec(@StringRes val labelRes: Int, val caption: String?, val state: StepState)

private const val CHECK = "✓"

/** The «Етказиш» card's four columns. CURRENT is the step the order is on; everything before it
 *  is DONE with a date where the model has one and a check where it does not. A CANCELED order
 *  is on no step. */
fun timelineFor(o: OrderDetail): List<StepSpec> {
    val s = o.summary.status
    val rank = when (s) {
        OrderStatus.PLACED -> 0; OrderStatus.IN_PRODUCTION -> 1; OrderStatus.LOADED -> 1
        OrderStatus.DISPATCHED -> 2; OrderStatus.DELIVERED -> 3
        else -> -1   // DRAFT, CANCELED, UNKNOWN
    }
    val dispatchedAt = o.dispatch?.dispatchedAt ?: o.shipments.mapNotNull { it.dispatchedAt }.maxOrNull()
    val deliveredAt = o.shipments.mapNotNull { it.deliveredAt }.maxOrNull()
    val dates = listOf(o.summary.placedAt, null, dispatchedAt, deliveredAt)
    val labels = listOf(R.string.step_placed, R.string.step_production, R.string.step_dispatched, R.string.step_delivered)
    return labels.mapIndexed { i, label ->
        val state = when {
            rank < 0 -> StepState.UPCOMING
            i < rank || (s == OrderStatus.DELIVERED && i == 3) -> StepState.DONE
            i == rank -> StepState.CURRENT
            else -> StepState.UPCOMING
        }
        val caption = when (state) {
            StepState.UPCOMING -> null
            else -> dates[i]?.let(::formatDate) ?: CHECK
        }
        StepSpec(label, caption, state)
    }
}
```
(A DELIVERED order: rank 3 → steps 0–2 DONE, step 3 DONE by the explicit clause, so nothing is CURRENT — matches the capture's «Етказилди» with a date.)

- [ ] **Step 4: The screen**

Keep `OrderDetailRoute`, `stripPhotos`, the lightbox and the delete dialog. `OrderDetailScreen` body:
```kotlin
Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
    PullToRefreshBox(isRefreshing = r is Resource.Loading && o == null, onRefresh = onRefresh) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = EtalonSpace.underStickyBar), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (pending.isNotEmpty()) item { OutboxBanner(…as today…) }
            if (r is Resource.Error) item { ErrorBanner(r.error.message, onRetry = onRefresh) }
            if (actionError != null) item { ErrorBanner(actionError) }
            if (o == null) return@LazyColumn
            item { Panel(o, onBack, onCall = { dial(ctx, o.summary.client.phone) }) }
            item { PaymentProgress(o) }
            if (o.payments.isNotEmpty() || !o.pendingAmount.isZero) item { PaymentsCard(o) }
            item { DeliveryCard(o) }
            val canOpenShipments = canOpenShipments(o, me)
            if (o.shipments.isNotEmpty() || canOpenShipments) item { ShipmentsCard(o, pending, if (canOpenShipments) onOpenShipments else null) }
            val canAdd = canAddPhoto(o, me)
            if (photos.isNotEmpty() || canAdd) item { WhiteCard(title = stringResource(R.string.photos)) { PhotoStrip(photos, onOpen = { lightboxAt = it }, onAdd = if (canAdd) onAddPhoto else null, onLongPress = onPhotoLongPress) } }
            if (o.events.isNotEmpty()) item { WhiteCard(title = stringResource(R.string.events)) { o.events.take(20).forEach { e -> Text("${formatDateTime(e.createdAt)} · ${e.message ?: e.type}${e.actorName?.let { " · $it" } ?: ""}", style = EtalonType.meta, color = EtalonColors.ink2, modifier = Modifier.padding(top = 4.dp)) } } }
        }
    }
    o?.let { ActionBar(step, canRecordPayment(it, me), onLoadTruck, onDeliveryProof, onOpenShipments, onRecordPayment, Modifier.align(Alignment.BottomCenter)) }
}
```
`Panel`:
```kotlin
DetailPanel(
    caption = stringResource(R.string.detail_caption), headline = formatOrderNo(o.summary.orderNumber),
    statusTag = { StatusTag(o.summary.status, TagSurface.PANEL_ON_INDIGO, short = true) },
    clientName = o.summary.client.name, addressLine = formatAddressLine(o.summary.client.address),
    tiles = { o.rooms.forEachIndexed { i, rm -> RoomTile(formatArea(rm.billedArea), stringResource(R.string.detail_room_dims, rm.name ?: stringResource(R.string.room_n, i + 1), formatDecimal(rm.innerWidth, 1), formatDecimal(rm.innerLength, 1)), modifier = Modifier.fillMaxWidth(0.48f)) } },
    totals = {
        PanelTotal(stringResource(R.string.detail_area), formatArea(o.summary.totalArea), modifier = Modifier.weight(1f))
        PanelTotal(stringResource(R.string.detail_total), formatMoney(o.summary.totalPrice), modifier = Modifier.weight(1f))
        PanelTotal(stringResource(R.string.detail_remaining), formatMoney(o.remaining), valueColor = if (o.remaining.isZero) EtalonColors.paidOnDark else EtalonColors.onDark, modifier = Modifier.weight(1f))
    },
    onBack = onBack, dateLabel = formatDate(o.summary.scheduledAt), onCall = onCall,
)
```
Read `DetailPanel.kt` for how `tiles` lays out (`FlowRow` with two per line — match `ds_panel_light.png`); the room tile's `↗` glyph is not drawn (`onOpen = null`) per R7. Location: the existing navigation/location `IconButton`s move into the panel's trailing area only if `DetailPanel` offers a slot; if it offers just `onCall`, put a `SecondaryButton(compact, leadingIcon = EtalonIcons.Navigation, «Етказиш жойи»)` as the first row of `DeliveryCard`'s footer — the capability stays, ledger where it went.

`PaymentProgress`: `ProgressCard(label = detail_payment_state, fraction = paidFraction(o), percentText = stringResource(R.string.detail_percent_paid, pct), paidLabel = stringResource(detail_paid_amount, formatMoney(o.summary.confirmedPaid)), remainingLabel = stringResource(detail_remaining_amount, formatMoney(o.remaining)), settled = o.remaining.isZero)` with
```kotlin
/** The one permitted BigDecimal→Float crossing on this screen: bar geometry, never a figure. */
private fun paidFraction(o: OrderDetail): Float {
    val total = o.summary.totalPrice.amount
    if (total.signum() <= 0) return 0f
    return o.summary.confirmedPaid.amount.divide(total, 4, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)
}
```
and `pct = (paidFraction * 100).roundToInt()`.

`WhiteCard(title, content)`: `Column(Modifier.fillMaxWidth().clip(xl).background(surface).border(hairline, surfaceBorder, xl).padding(horizontal = cardPadH, vertical = cardPadV)) { Text(title, sectionTitle, ink); Spacer(10.dp); content() }`.

`PaymentsCard`: `WhiteCard(detail_payments)` with one `Row` per payment (`MoneyText(p.amount, style = rowAmount, ink)`, `Text("${formatDateTime(p.recordedAt)}${p.recordedByName?.let { " · $it" } ?: ""}", meta, ink2)`, `PaymentStatusTag(p.status)`), and the pending line `Text(stringResource(pending_amount, formatMoney(o.pendingAmount)), meta, indigo)` when non-zero.

`DeliveryCard`: `WhiteCard(detail_delivery) { StepTimeline(timelineFor(o).map { TimelineStep(stringResource(it.labelRes), it.caption, it.state) }); Spacer(12.dp); Row(SpaceBetween) { Column { Text(detail_date, meta, ink2); Text(formatDate(o.summary.scheduledAt), label, ink) }; Column(End) { Text(detail_driver, meta, ink2); Text(o.dispatch?.driverName ?: o.shipments.firstNotNullOfOrNull { it.driverName } ?: stringResource(detail_no_driver), label, ink) } } }`.

`ShipmentsCard`: `WhiteCard(shipments)` — the same rows as today (number, who, queued/failed line, `ShipmentStatusTag`) with `EtalonType.rowTitle`/`meta` in place of `MaterialTheme.typography`, the whole card `clickable` when `onOpen != null` with a trailing `EtalonIcons.ChevronRight`; empty → `Text(split_into_shipments, label, indigo)`.

`ActionBar`:
```kotlin
val secondary: (@Composable RowScope.() -> Unit)? = when (step) {
    NextStep.LoadTruck -> { { SecondaryButton(stringResource(R.string.action_load), onLoadTruck, Modifier.weight(1f)) } }
    NextStep.DeliveryProof -> { { SecondaryButton(stringResource(R.string.action_delivered), onDeliveryProof, Modifier.weight(1f)) } }
    NextStep.ManageShipments -> { { SecondaryButton(stringResource(R.string.action_shipments), onOpenShipments, Modifier.weight(1f)) } }
    is NextStep.Blocked -> { { SecondaryButton(step.reason, onClick = {}, Modifier.weight(1f), enabled = false) } }
    NextStep.None -> null
}
if (secondary == null && !canPay) return
StickyActionBar(modifier) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        secondary?.invoke(this)
        if (canPay) PrimaryButton(stringResource(R.string.action_record_payment), onRecordPayment, Modifier.weight(1f))
    }
}
```
Read `StickyActionBar`'s signature first (phase 1 restyled it to a scrim); it must sit above the nav pill — its bottom padding is `EtalonSpace.underNav`-aware or the shell's pill covers it: check on the emulator and, if the bar hides behind the pill, give `StickyActionBar` a `bottomInset: Dp` parameter defaulting to `0.dp` and pass `EtalonSpace.underNav - 16.dp` here (ledger the designsystem change).

Remove every `MaterialTheme`, `LocalEtalonColors`, `StatusStripeCard`, `SectionLabel`, `StatusChip`, `PaymentStatusChip`, `ShipmentStatusChip`, `Icons.*` import the rewrite leaves unused; the `FLOW`/`collapsed()` helpers go (Timeline.kt replaces them).

- [ ] **Step 5: Record, look, verify** — beside `2b-order-detail.png`: navy panel with back circle, «30 авг 2026», phone circle; indigo panel «Буюртма / № 09‑0003 / Жўнатилган tag»; avatar + name + address; three room tiles; Майдон / Жами / Қолди; «Тўлов ҳолати» card with a 45 % bar and red «Қолди 7 350 000»; «Етказиш» card with four bars and «Қабул 30 авг / ✓ / Йўлда … / Етказилди»; sticky «Етказилди» + «Тўлов қайд қилиш». Full standard command with `--rerun-tasks`.

- [ ] **Step 6: Emulator** — install, open an order, `screencap`.

- [ ] **Step 7: Commit** — `Feat(android) · Order detail rebuilt to the prototype: panel, progress, timeline, sticky actions`

---

### Task 9: Close the phase — orphan sweep, full verification, owner captures

**Files:** whatever the sweep finds; `.superpowers/sdd/<this plan>/captures/` (workspace, not committed).

- [ ] **Step 1: Orphans this plan created** — grep for `MoreScreen`, `ComingSoon`, `moreDestinationsFor`, `OrderCard(`, `home_tile_`, `orders_search_hint`, `paging_`, `nav_more`, `coming_soon`, `NavigationSuiteScaffold`, `material-icons` usages in `app/` and `feature/home` / `feature/orders`; remove what nothing references. `StatusStripeCard`, `SectionLabel`, `StatusChip` remain in use by other features — leave them.
- [ ] **Step 2: Full verification** — the standard command with `--rerun-tasks`; report tests and images compared (must include every new baseline: 4 home, 4 orders, 5 detail).
- [ ] **Step 3: Emulator walk** — `installDebug`; sign in on the dev server; capture Home, Orders (scroll once), an order detail, the account sheet, the outbox sheet: `adb exec-out screencap -p > captures/<name>.png` (adb at `C:/Users/aziz/AppData/Local/Android/Sdk/platform-tools/adb.exe`, literal path). These five images are what the owner is shown.
- [ ] **Step 4: Commit** any sweep — `Chore(android) · remove the More screen and placeholders the nav pill retired`

---

## Self-review against the spec

- §4 shell: pill, five cells, permission filter, scrim, owner tools behind the avatar (R3), no logistics cell, stack routes lit by tab (R8) — Task 4.
- §5.1 / spec §3.1 Home: app bar row, title + date, KPI row, today NavySheet with count pill, recent card with «Барчаси» — Task 5, with R2 for the card data.
- §3.2 Orders: title + count·area, «+ Янги», search + filter, chips with counts, NavySheet «Рўйхат» + segmented, month groups with sums, «Буюртма топилмади.» — Tasks 6–7, with R1/R5/R6.
- §3.3 Detail: DetailPanel → ProgressCard → «Етказиш» timeline with date · driver footer → sticky bar; call dials — Task 8, with R7.
- §7 numbers: `formatMoney` bare in rows, hero prefix on KPI cards, m² with decimal comma, thin space — Tasks 3, 5, 7, 8.
- §8 testing: light-only baselines per screen, `--rerun-tasks`, the hex lint, existing tests green — every task's verify step.
- Type consistency: `OrderRow.status` becomes nullable in Task 5 and is passed non-null in Task 7/Home-recent; `OrdersSource` gains `facets` in Task 6 and `RepositoryOrdersSource` implements it; `HomeRoute`'s four-callback signature is used identically in Task 4 and Task 5; `formatOrderNo` (Task 3) is used in Tasks 7 and 8; `timelineFor` returns `StepSpec`, mapped to `TimelineStep` at the composable.
