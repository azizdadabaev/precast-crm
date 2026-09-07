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
)

@Serializable
data class TodayDeliveriesDto(
    val count: Int,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal,
    val date: String,
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
)
