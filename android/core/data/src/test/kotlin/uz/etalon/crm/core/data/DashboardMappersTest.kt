package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.network.dto.CollectedThisMonthDto
import uz.etalon.crm.core.network.dto.DashboardDto
import uz.etalon.crm.core.network.dto.OpenDiscrepanciesDto
import uz.etalon.crm.core.network.dto.OrdersByPaymentStateDto
import uz.etalon.crm.core.network.dto.OutstandingReceivablesDto
import uz.etalon.crm.core.network.dto.RecentOrderDto
import uz.etalon.crm.core.network.dto.TodayDeliveriesDto
import uz.etalon.crm.core.network.dto.TodayDeliveryOrderDto
import uz.etalon.crm.core.network.dto.TrendDto
import java.math.BigDecimal

/**
 * `HomeSummary` has five same-typed `Int` fields and two `Money` fields, all mutually swappable
 * in a way `toDomain()` would compile fine either way — Task 4's reviewer asked for exactly this
 * test before a screen renders receivables off it. Every fixture value below is distinct, so a
 * mapper that swaps any two of them (e.g. `paidOrders` for `partialOrders`, or
 * `openDiscrepancyTotal` for `receivables`) fails here rather than in front of an operator
 * reading a wrong balance on Home.
 */
class DashboardMappersTest {
    private val dto = DashboardDto(
        todayDeliveries = TodayDeliveriesDto(
            totalArea = BigDecimal("45.7"),
            orders = listOf(TodayDeliveryOrderDto("o1", "A-1", "Client", BigDecimal("20.3"))),
        ),
        openDiscrepancies = OpenDiscrepanciesDto(count = 11, totalAmount = BigDecimal("111000")),
        outstandingReceivables = OutstandingReceivablesDto(total = BigDecimal("222000"), orderCount = 22),
        ordersByPaymentState = OrdersByPaymentStateDto(paid = 33, partial = 44, awaiting = 55),
    )

    @Test fun `each field lands in the summary field it belongs to, not a same-typed neighbour`() {
        val s = dto.toDomain()
        assertEquals(1, s.today.size)
        assertEquals("o1", s.today.single().orderId)
        // orderNumber and clientName are adjacent Strings on TodayDelivery — exactly the shape
        // that swaps silently and would print the client's name in the order-number slot of
        // every row on Home. Distinct fixture values make either swap fail here.
        assertEquals("A-1", s.today.single().orderNumber)
        assertEquals("Client", s.today.single().clientName)
        assertEquals(BigDecimal("20.3"), s.today.single().area)
        assertEquals(BigDecimal("45.7"), s.todayArea)
        assertEquals(11, s.openDiscrepancies)
        assertEquals(Money.parse("111000"), s.openDiscrepancyTotal)
        assertEquals(Money.parse("222000"), s.receivables)
        assertEquals(22, s.receivableOrders)
        assertEquals(33, s.paidOrders)
        assertEquals(44, s.partialOrders)
        assertEquals(55, s.awaitingOrders)
    }

    /** A recent order always has a schedule; one with no `scheduledAt` is dropped rather than
     *  defaulted to a made-up date. */
    @Test fun `a recent order with no scheduledAt is dropped, not defaulted`() {
        val withMissingSchedule = dto.copy(recentOrders = listOf(
            RecentOrderDto(id = "r1", orderNumber = "B-1", clientName = "C", status = "PLACED", scheduledAt = null, totalPrice = BigDecimal("500000")),
        ))
        assertEquals(emptyList<Any>(), withMissingSchedule.toDomain().recent)
    }

    @Test fun `collected trend direction down is not up, flat still renders up with its own deltaPct`() {
        val down = dto.copy(collectedThisMonth = CollectedThisMonthDto(total = BigDecimal("100"), trend = TrendDto(BigDecimal("5.0"), "down")))
        assertEquals(false, down.toDomain().collectedTrend!!.up)

        val flat = dto.copy(collectedThisMonth = CollectedThisMonthDto(total = BigDecimal("100"), trend = TrendDto(BigDecimal("0"), "flat")))
        val flatTrend = flat.toDomain().collectedTrend!!
        assertEquals(true, flatTrend.up)
        assertEquals(BigDecimal("0"), flatTrend.deltaPct)
    }
}
