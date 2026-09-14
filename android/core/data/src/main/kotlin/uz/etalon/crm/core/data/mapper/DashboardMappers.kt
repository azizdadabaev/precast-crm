package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.AllTimeMoney
import uz.etalon.crm.core.model.Aov
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthBooked
import uz.etalon.crm.core.model.MonthCollected
import uz.etalon.crm.core.model.MonthOrders
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PeriodMoney
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.TopCustomer
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import uz.etalon.crm.core.network.dto.DashboardDto
import uz.etalon.crm.core.network.dto.LoadedVolumeDto
import uz.etalon.crm.core.network.dto.RecentOrderDto
import uz.etalon.crm.core.network.dto.TodayDeliveryOrderDto
import uz.etalon.crm.core.network.dto.TopCustomerDto
import uz.etalon.crm.core.network.dto.TrendDto
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
        orderId = id, orderNumber = orderNumber, clientName = clientName,
        clientPhone = clientPhone, clientAddress = clientAddress,
        status = OrderStatus.from(status), scheduledAt = Instant.parse(scheduled),
        totalPrice = Money(totalPrice), remaining = Money(remaining),
        totalArea = totalArea, paymentState = PaymentState.from(paymentState),
    )
}

fun TrendDto.toDomain() = Trend(deltaPct, TrendDirection.from(direction), TrendPolarity.from(polarity))

fun LoadedVolumeDto.toDomain() = LoadedVolume(
    monthKey = monthKey, blocks = blocks, beamCount = beamCount,
    beamMeters = beamMeters, area = area, orderCount = orderCount,
)

fun TopCustomerDto.toDomain() = TopCustomer(
    id = id, name = name, totalCollected = Money(totalCollected), orderCount = orderCount,
)

/**
 * `DashboardDto`'s money-shaped fields are already `BigDecimal` by the time they reach here —
 * [uz.etalon.crm.core.network.BigDecimalSerializer] did the bare-JSON-number decode on the wire
 * layer. `Money`'s constructor is called directly, never `Money.parse`, which expects a decimal
 * *string* and would throw on a `BigDecimal`.
 */
fun DashboardDto.toDomain(): HomeSummary {
    // `monthKeys[currentMonthIdx]` — the key `loadedThisMonth` is looked up by. Empty when an
    // older server sends neither, which makes the lookup below miss every row (no real monthKey
    // is ever ""), so `loadedThisMonth` degrades to null rather than guessing a month.
    val currentMonthKey = monthKeys.getOrNull(currentMonthIdx) ?: ""
    return HomeSummary(
        today = todayDeliveries.orders.map { it.toDomain() },
        todayArea = todayDeliveries.totalArea,
        openDiscrepancies = openDiscrepancies.count,
        openDiscrepancyTotal = Money(openDiscrepancies.totalAmount),
        receivables = Money(outstandingReceivables.total),
        receivableOrders = outstandingReceivables.orderCount,
        receivablesTrend = outstandingReceivables.trend?.toDomain(),
        paidOrders = ordersByPaymentState.paid,
        partialOrders = ordersByPaymentState.partial,
        awaitingOrders = ordersByPaymentState.awaiting,
        recent = recentOrders.mapNotNull { it.toDomain() },
        booked = PeriodMoney(
            total = Money(bookedThisMonth?.total ?: BigDecimal.ZERO),
            count = bookedThisMonth?.orderCount ?: 0,
            trend = bookedThisMonth?.trend?.toDomain(),
        ),
        bookedAllTime = AllTimeMoney(
            total = Money(bookedAllTime?.total ?: BigDecimal.ZERO),
            count = bookedAllTime?.orderCount ?: 0,
        ),
        collected = PeriodMoney(
            total = Money(collectedThisMonth?.total ?: BigDecimal.ZERO),
            count = collectedThisMonth?.paymentCount ?: 0,
            trend = collectedThisMonth?.trend?.toDomain(),
        ),
        collectedAllTime = AllTimeMoney(
            total = Money(collectedAllTime?.total ?: BigDecimal.ZERO),
            count = collectedAllTime?.paymentCount ?: 0,
        ),
        collectedByMonth = collectedByMonth.map { MonthCollected(it.month, Money(it.collected)) },
        aov = Aov(
            thisMonth = Money(averageOrderValue?.thisMonth ?: BigDecimal.ZERO),
            allTime = Money(averageOrderValue?.allTime ?: BigDecimal.ZERO),
            trend = averageOrderValue?.trend?.toDomain(),
        ),
        activeCustomers = activeCustomers?.count ?: 0,
        bookedByMonth = bookedByMonth.map { MonthBooked(it.month, Money(it.booked)) },
        ordersByMonth = ordersByMonth.map { MonthOrders(it.month, it.count) },
        currentMonthKey = currentMonthKey,
        loadedThisMonth = loadedVolumeByMonth.find { it.monthKey == currentMonthKey }?.toDomain(),
        topCustomers = topCustomers.map { it.toDomain() },
    )
}
