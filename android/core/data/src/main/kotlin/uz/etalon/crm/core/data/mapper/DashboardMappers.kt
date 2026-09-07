package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.network.dto.DashboardDto
import uz.etalon.crm.core.network.dto.TodayDeliveryOrderDto

fun TodayDeliveryOrderDto.toDomain() = TodayDelivery(
    orderId = id, orderNumber = orderNumber, clientName = clientName, area = totalArea,
)

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
)
