package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.Instant

/** One row of GET /api/dashboard's `todayDeliveries.orders` — a delivery scheduled for today,
 *  as the Home screen's «Бугун» column shows it. `area` is м², not money. */
data class TodayDelivery(
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val clientAddress: String?,
    val area: BigDecimal,
    val status: OrderStatus,
    val totalPrice: Money,
    val remaining: Money,
)

/** One row of GET /api/dashboard's `recentOrders` — the six most recently scheduled orders, for
 *  the owner's editorial Home. */
data class RecentOrder(
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val status: OrderStatus,
    val scheduledAt: Instant,
    val totalPrice: Money,
    val remaining: Money,
)

data class MonthCollected(val month: String, val collected: Money)

/** `up` is true unless the server's `direction` is `'down'` — `'flat'` renders as up-with-0. */
data class Trend(val deltaPct: BigDecimal, val up: Boolean)

/**
 * The subset of `GET /api/dashboard`'s `DashboardPayload` this slice renders: the «Бугун»
 * column (everyone) and the `dashboard.viewBasic`/`dashboard.view` operational tiles. The
 * payload carries far more — twelve-month trends, the payment donut, top clients — all of
 * which belongs to the owner's editorial Home, deferred to Phase 2. Modelling those fields
 * here before a screen renders them would be dead code.
 *
 * Every money-shaped field on the server's dashboard route is a bare JSON number
 * (`Math.round(...)` in `dashboard-data.ts`), unlike every other endpoint in this project,
 * which sends money as a decimal string. The wire layer (`:core:network`) decodes those
 * numbers straight into `BigDecimal`/`Money` — never `Double` — so this type never sees the
 * float-on-a-money-path defect this project has already fixed twice.
 */
data class HomeSummary(
    val today: List<TodayDelivery>,
    val todayArea: BigDecimal,
    val openDiscrepancies: Int,
    val openDiscrepancyTotal: Money,
    val receivables: Money,
    val receivableOrders: Int,
    val paidOrders: Int,
    val partialOrders: Int,
    val awaitingOrders: Int,
    val recent: List<RecentOrder>,
    val collectedThisMonth: Money,
    val collectedTrend: Trend?,
    val collectedByMonth: List<MonthCollected>,
)
