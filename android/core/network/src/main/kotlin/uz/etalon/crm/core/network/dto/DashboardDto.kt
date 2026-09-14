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
 * Only the fields the Бош tab's design 6a renders are modelled (Task 1 of Phase 7 widened this
 * from the phase-1 four; Task 5 added the region ranking and the per-month payment counts the
 * month picker needs). `DashboardPayload` still carries more than that — the delivery-date basis,
 * `weekCapacity`, `cashOnTheRoad`, the daily series — none of which render on the phone yet
 * (spec §8); `ignoreUnknownKeys = true` on the shared `Json` lets the rest pass through unread.
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

/**
 * One row of the dashboard's `recentOrders` — the six most recent orders for the owner's Home.
 * `clientPhone`, `clientAddress`, `totalArea` and `paymentState` are Task 1's own additions
 * (design 6a's recent-orders card); each defaults so an older server payload still decodes.
 * `paymentState` defaults to the empty string, which [uz.etalon.crm.core.model.PaymentState.from]
 * maps to `UNKNOWN` — never a guessed real state — the same "absent makes no claim" rule
 * [uz.etalon.crm.core.model.TrendDirection.from] already follows.
 */
@Serializable data class RecentOrderDto(
    val id: String, val orderNumber: String, val clientName: String,
    val status: String = "PLACED", val scheduledAt: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val totalPrice: BigDecimal,
    @Serializable(with = BigDecimalSerializer::class) val remaining: BigDecimal = BigDecimal.ZERO,
    val clientPhone: String = "",
    val clientAddress: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal = BigDecimal.ZERO,
    val paymentState: String = "",
)

/** `polarity` defaults to `"positive"` so a pre-Task-1 payload still decodes; see
 *  [uz.etalon.crm.core.model.TrendPolarity] for why an unrecognised value also lands there. */
@Serializable data class TrendDto(
    @Serializable(with = BigDecimalSerializer::class) val deltaPct: BigDecimal,
    val direction: String,
    val polarity: String = "positive",
)
@Serializable data class CollectedThisMonthDto(
    @Serializable(with = BigDecimalSerializer::class) val total: BigDecimal,
    val paymentCount: Int = 0,
    val trend: TrendDto? = null,
)
/** `paymentCount` is how many confirmed payments made up that month's `collected`; the rail's
 *  Collected card prints it once a month other than the current one is selected (design §2.3b).
 *  Defaulted so a payload that predates it still decodes. */
@Serializable data class MonthCollectedDto(
    val month: String,
    @Serializable(with = BigDecimalSerializer::class) val collected: BigDecimal,
    val paymentCount: Int = 0,
)
@Serializable data class MonthBookedDto(val month: String, @Serializable(with = BigDecimalSerializer::class) val booked: BigDecimal)
@Serializable data class MonthOrdersDto(val month: String, val count: Int)

@Serializable data class BookedThisMonthDto(
    @Serializable(with = BigDecimalSerializer::class) val total: BigDecimal = BigDecimal.ZERO,
    val orderCount: Int = 0,
    val trend: TrendDto? = null,
)
@Serializable data class BookedAllTimeDto(
    @Serializable(with = BigDecimalSerializer::class) val total: BigDecimal = BigDecimal.ZERO,
    val orderCount: Int = 0,
)
@Serializable data class CollectedAllTimeDto(
    @Serializable(with = BigDecimalSerializer::class) val total: BigDecimal = BigDecimal.ZERO,
    val paymentCount: Int = 0,
)
@Serializable data class AverageOrderValueDto(
    @Serializable(with = BigDecimalSerializer::class) val thisMonth: BigDecimal = BigDecimal.ZERO,
    @Serializable(with = BigDecimalSerializer::class) val allTime: BigDecimal = BigDecimal.ZERO,
    val trend: TrendDto? = null,
)
@Serializable data class ActiveCustomersDto(val count: Int = 0)

/** One row of `loadedVolumeByMonth` — what physically left the yard that calendar month.
 *  `beamMeters`/`area` are measurements, not money, but still bare JSON numbers on this route, so
 *  they route through [BigDecimalSerializer] too rather than risk a `Double`. */
@Serializable data class LoadedVolumeDto(
    val monthKey: String,
    val blocks: Int = 0,
    val beamCount: Int = 0,
    @Serializable(with = BigDecimalSerializer::class) val beamMeters: BigDecimal = BigDecimal.ZERO,
    @Serializable(with = BigDecimalSerializer::class) val area: BigDecimal = BigDecimal.ZERO,
    val orderCount: Int = 0,
)

/** One row of `ordersByRegion` — the province league table (design §2.6b). `region` is the stable
 *  Latin key (or `"Other"`); `regionUz` is the Cyrillic label, `booked` the province's Σ
 *  `totalPrice`. Every field defaults: this array is a Task 5 addition and an older payload
 *  simply has none. */
@Serializable data class RegionOrdersDto(
    val region: String = "",
    val regionUz: String = "",
    val orderCount: Int = 0,
    val clientCount: Int = 0,
    @Serializable(with = BigDecimalSerializer::class) val booked: BigDecimal = BigDecimal.ZERO,
)

@Serializable data class TopCustomerDto(
    val id: String,
    val name: String,
    @Serializable(with = BigDecimalSerializer::class) val totalCollected: BigDecimal,
    val orderCount: Int,
)

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
    val trend: TrendDto? = null,
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
    // Task 1 additions — every field the Бош tab's design 6a renders beyond the phase-1 slice.
    // Every one defaults so a pre-Task-1 payload still decodes.
    val bookedThisMonth: BookedThisMonthDto? = null,
    val bookedAllTime: BookedAllTimeDto? = null,
    val collectedAllTime: CollectedAllTimeDto? = null,
    val averageOrderValue: AverageOrderValueDto? = null,
    val activeCustomers: ActiveCustomersDto? = null,
    val bookedByMonth: List<MonthBookedDto> = emptyList(),
    val ordersByMonth: List<MonthOrdersDto> = emptyList(),
    /** Index-aligned with [bookedByMonth]/`collectedByMonth`/[ordersByMonth]; `currentMonthIdx`
     *  picks the current month out of it — see `HomeSummary.currentMonthKey`. */
    val monthKeys: List<String> = emptyList(),
    val currentMonthIdx: Int = 0,
    val loadedVolumeByMonth: List<LoadedVolumeDto> = emptyList(),
    val topCustomers: List<TopCustomerDto> = emptyList(),
    /** Task 5 / design §2.6b — all-time and already ranked by the server. */
    val ordersByRegion: List<RegionOrdersDto> = emptyList(),
)
