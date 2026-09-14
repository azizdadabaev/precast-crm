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
    val clientPhone: String,
    val clientAddress: String?,
    val status: OrderStatus,
    val scheduledAt: Instant,
    val totalPrice: Money,
    val remaining: Money,
    val totalArea: BigDecimal,
    val paymentState: PaymentState,
)

data class MonthCollected(val month: String, val collected: Money)
data class MonthBooked(val month: String, val booked: Money)
data class MonthOrders(val month: String, val count: Int)

/**
 * The server's three directions (`src/lib/dashboard-metrics.ts`: `'up' | 'down' | 'flat'`), kept
 * three-valued here. Folding FLAT into "up" drew an unchanged month as a green «↑ 0,0 %» — a rise
 * that did not happen — so a month that stood still says so, in neutral ink and with no arrow.
 * [UNKNOWN] is a direction this client does not recognise; it reads as FLAT does, making no claim.
 */
enum class TrendDirection { UP, DOWN, FLAT, UNKNOWN;
    companion object {
        fun from(s: String) = when (s) {
            "up" -> UP
            "down" -> DOWN
            "flat" -> FLAT
            else -> UNKNOWN
        }
    }
}

/**
 * The server's two polarities (`src/lib/dashboard-metrics.ts`: `'positive' | 'negative'`), which
 * decide whether the trend badge's colour follows [TrendDirection] directly (booked, collected,
 * AOV — up is good) or inverted (receivables — up is bad). Unlike [TrendDirection], an
 * unrecognised string here does NOT fall back to a neutral "makes no claim" value: every trend
 * this client renders needs a colour, and the web's own `buildTrend` never emits anything but
 * these two literals, so a name added on the server one client build has not learned yet reads as
 * [POSITIVE] — the same default the web already applies to every trend it does not special-case
 * as receivables. Getting this wrong the other way (defaulting NEGATIVE) would tint an ordinary
 * booked/collected rise red for no reason; defaulting POSITIVE is the safer wrong answer.
 */
enum class TrendPolarity { POSITIVE, NEGATIVE;
    companion object {
        fun from(s: String) = when (s) {
            "negative" -> NEGATIVE
            else -> POSITIVE
        }
    }
}

data class Trend(val deltaPct: BigDecimal, val direction: TrendDirection, val polarity: TrendPolarity)

/** A money figure scoped to the current calendar month, with its order/payment count and the
 *  trend against last month (`null` with no prior-month basis to compare against). Shared shape
 *  for `bookedThisMonth` and `collectedThisMonth` — both are "this month's total, this month's
 *  count, this month vs last month". */
data class PeriodMoney(val total: Money, val count: Int, val trend: Trend?)

/** The same figure with no time window — `bookedAllTime` / `collectedAllTime`. No trend: there is
 *  no "all time vs last all time" to compare against. */
data class AllTimeMoney(val total: Money, val count: Int)

/** Average order value = booked ÷ order count, this month and all-time (`averageOrderValue` on
 *  the wire). Booked, not collected — an unpaid order still has a value. */
data class Aov(val thisMonth: Money, val allTime: Money, val trend: Trend?)

/** One month's `loadedVolumeByMonth` row — what physically left the yard that calendar month,
 *  independent of the order/delivery date basis (loading has its own date). */
data class LoadedVolume(
    val monthKey: String,
    val blocks: Int,
    val beamCount: Int,
    val beamMeters: BigDecimal,
    val area: BigDecimal,
    val orderCount: Int,
)

/** One row of `topCustomers` — ranked by cash collected, not by booked value. */
data class TopCustomer(val id: String, val name: String, val totalCollected: Money, val orderCount: Int)

/**
 * The subset of `GET /api/dashboard`'s `DashboardPayload` the Бош tab renders (design 6a): the
 * «Бугун» column and every `dashboard.viewBasic`/`dashboard.view` metric — the receivables hero,
 * the financial rail (booked/collected/AOV), the operational grid, the payment donut, top
 * customers and the recent-orders card. Not modelled: the 12-month `HeroChart`, the delivery-date
 * basis, `ordersByRegion`, `weekCapacity` and `cashOnTheRoad` — none of them render on the phone
 * yet (spec §8), so modelling them here would be dead code.
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
    /** Polarity NEGATIVE — a rising balance is bad, unlike every other trend on this screen. */
    val receivablesTrend: Trend?,
    val paidOrders: Int,
    val partialOrders: Int,
    val awaitingOrders: Int,
    val recent: List<RecentOrder>,
    /** «Буюртма қилинган · Booked» — Σ totalPrice over live orders, bucketed by `placedAt`. What
     *  was SOLD this month, never "revenue". */
    val booked: PeriodMoney,
    val bookedAllTime: AllTimeMoney,
    /** «Тушган пул · Collected» — Σ confirmed payments this month. What was RECEIVED. */
    val collected: PeriodMoney,
    val collectedAllTime: AllTimeMoney,
    /** Twelve months oldest-first; the collected card's sparkline draws the last few of them. */
    val collectedByMonth: List<MonthCollected>,
    val aov: Aov,
    /** Distinct clients holding at least one live order. */
    val activeCustomers: Int,
    /** Twelve months oldest-first, index-aligned with [ordersByMonth] and [collectedByMonth]. */
    val bookedByMonth: List<MonthBooked>,
    val ordersByMonth: List<MonthOrders>,
    /** `YYYY-MM` of the current calendar month — the key [loadedThisMonth] is looked up by. */
    val currentMonthKey: String,
    /** The `loadedVolumeByMonth` row for [currentMonthKey], or `null` when that month loaded
     *  nothing — never a zeroed [LoadedVolume], the same "absent vs. genuine zero" rule the rest
     *  of this type already follows for permission-withheld tiles. */
    val loadedThisMonth: LoadedVolume?,
    val topCustomers: List<TopCustomer>,
)
