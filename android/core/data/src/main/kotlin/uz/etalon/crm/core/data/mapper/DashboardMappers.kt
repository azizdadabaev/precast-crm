package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthCollected
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.network.dto.DashboardDto
import uz.etalon.crm.core.network.dto.RecentOrderDto
import uz.etalon.crm.core.network.dto.TodayDeliveryOrderDto
import java.math.BigDecimal
import java.time.Instant

fun TodayDeliveryOrderDto.toDomain() = TodayDelivery(
    orderId = id, orderNumber = orderNumber, clientName = clientName, clientAddress = clientAddress,
    area = totalArea, status = OrderStatus.from(status), totalPrice = Money(totalPrice), remaining = Money(remaining),
)

/** Null when `scheduledAt` is absent — a recent order always has a schedule, so such a row is
 *  dropped rather than defaulted to a made-up date. */
fun RecentOrderDto.toDomain(): RecentOrder? {
    val scheduled = scheduledAt ?: return null
    return RecentOrder(
        orderId = id, orderNumber = orderNumber, clientName = clientName, status = OrderStatus.from(status),
        scheduledAt = Instant.parse(scheduled), totalPrice = Money(totalPrice), remaining = Money(remaining),
    )
}

/**
 * `DashboardDto`'s money-shaped fields are already `BigDecimal` by the time they reach here —
 * [uz.etalon.crm.core.network.BigDecimalSerializer] did the bare-JSON-number decode on the wire
 * layer. `Money`'s constructor is called directly, never `Money.parse`, which expects a decimal
 * *string* and would throw on a `BigDecimal`.
 */
fun DashboardDto.toDomain() = HomeSummary(
    today = todayDeliveries.orders.map { it.toDomain() },
    todayArea = todayDeliveries.totalArea,
    openDiscrepancies = openDiscrepancies.count,
    openDiscrepancyTotal = Money(openDiscrepancies.totalAmount),
    receivables = Money(outstandingReceivables.total),
    receivableOrders = outstandingReceivables.orderCount,
    paidOrders = ordersByPaymentState.paid,
    partialOrders = ordersByPaymentState.partial,
    awaitingOrders = ordersByPaymentState.awaiting,
    recent = recentOrders.mapNotNull { it.toDomain() },
    collectedThisMonth = Money(collectedThisMonth?.total ?: BigDecimal.ZERO),
    collectedTrend = collectedThisMonth?.trend?.let { Trend(it.deltaPct, it.direction != "down") },
    collectedByMonth = collectedByMonth.map { MonthCollected(it.month, Money(it.collected)) },
)
