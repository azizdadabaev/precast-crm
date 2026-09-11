package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

/**
 * `GET /api/dashboard` — the trap in this slice. Every money-shaped figure here is a bare JSON
 * *number* (`Math.round(...)` in `dashboard-data.ts`), unlike every other endpoint in this
 * project, which sends money as a decimal string. A `Double` cannot carry a Decimal(14,2)
 * value at its ceiling without switching to scientific notation, so every such field routes
 * through [BigDecimalSerializer] — the same serializer the request side uses, reused here for
 * its decode half: it reads the raw JSON literal via `JsonPrimitive.content` regardless of
 * whether it was quoted, so it works for both a request's bare number and this response's.
 *
 * Only the four fields Task 2's `HomeSummary` renders are modelled. `DashboardPayload` carries
 * far more (trends, the payment donut, top clients) — all Phase 2's owner editorial Home;
 * `ignoreUnknownKeys = true` on the shared `Json` lets the rest pass through unread.
 */
@Serializable
data class TodayDeliveryOrderDto(
    val id: String,
    val orderNumber: String,
    val clientName: String,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal,
    // Defaults exist only so an older server still decodes; Task 1 ships these fields.
    val status: String = "PLACED",
    val clientAddress: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val totalPrice: BigDecimal = BigDecimal.ZERO,
    @Serializable(with = BigDecimalSerializer::class) val remaining: BigDecimal = BigDecimal.ZERO,
)

/** One row of the dashboard's `recentOrders` — the six most recent orders for the owner's Home. */
@Serializable data class RecentOrderDto(
    val id: String, val orderNumber: String, val clientName: String,
    val status: String = "PLACED", val scheduledAt: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val totalPrice: BigDecimal,
    @Serializable(with = BigDecimalSerializer::class) val remaining: BigDecimal = BigDecimal.ZERO,
)
@Serializable data class TrendDto(@Serializable(with = BigDecimalSerializer::class) val deltaPct: BigDecimal, val direction: String)
@Serializable data class CollectedThisMonthDto(@Serializable(with = BigDecimalSerializer::class) val total: BigDecimal, val trend: TrendDto? = null)
@Serializable data class MonthCollectedDto(val month: String, @Serializable(with = BigDecimalSerializer::class) val collected: BigDecimal)

/**
 * The payload also carries `count` and `date`. Neither is modelled: `HomeViewModel` counts the
 * rows it actually renders (`s.today.size`) rather than trusting a separate figure to agree with
 * the array, and nothing shows the date — Home says «Бугун». `ignoreUnknownKeys` lets both pass.
 * A required field nothing reads is a decode that can fail for no gain.
 */
@Serializable
data class TodayDeliveriesDto(
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal,
    val orders: List<TodayDeliveryOrderDto> = emptyList(),
)

@Serializable
data class OpenDiscrepanciesDto(
    val count: Int,
    @Serializable(with = BigDecimalSerializer::class) val totalAmount: BigDecimal,
)

@Serializable
data class OutstandingReceivablesDto(
    @Serializable(with = BigDecimalSerializer::class) val total: BigDecimal,
    val orderCount: Int,
)

@Serializable
data class OrdersByPaymentStateDto(val paid: Int, val partial: Int, val awaiting: Int)

@Serializable
data class DashboardDto(
    val todayDeliveries: TodayDeliveriesDto,
    val openDiscrepancies: OpenDiscrepanciesDto,
    val outstandingReceivables: OutstandingReceivablesDto,
    val ordersByPaymentState: OrdersByPaymentStateDto,
    val recentOrders: List<RecentOrderDto> = emptyList(),
    val collectedThisMonth: CollectedThisMonthDto? = null,
    val collectedByMonth: List<MonthCollectedDto> = emptyList(),
)
