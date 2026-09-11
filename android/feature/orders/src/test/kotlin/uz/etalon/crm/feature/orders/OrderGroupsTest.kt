package uz.etalon.crm.feature.orders

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.orders.list.groupByMonth
import java.math.BigDecimal
import java.time.Instant
import java.time.YearMonth

class OrderGroupsTest {
    private fun order(number: String, scheduledAt: String, total: String) = OrderSummary(
        id = "id-$number", orderNumber = number, status = OrderStatus.PLACED, paymentState = PaymentState.AWAITING_PAYMENT,
        totalPrice = Money.parse(total), confirmedPaid = Money.ZERO, totalArea = BigDecimal.ONE, totalBlocks = 1, totalBeams = 1,
        scheduledAt = Instant.parse(scheduledAt), placedAt = Instant.parse(scheduledAt),
        client = ClientRef("c", "A", "998901112233", null),
    )

    @Test fun `groups keep server order and sum money per month`() {
        val sep1 = order("2026-09-0005", "2026-09-30T18:59:00Z", "6210000.00") // 23:59 on the 30th in Tashkent
        val sep2 = order("2026-09-0004", "2026-09-02T05:00:00Z", "18420000.00")
        val jul = order("2026-07-0001", "2026-07-27T05:00:00Z", "29000000.00")
        val g = groupByMonth(listOf(sep1, sep2, jul))
        assertEquals(listOf(YearMonth.of(2026, 9), YearMonth.of(2026, 7)), g.map { it.month })
        assertEquals(Money.parse("24630000.00"), g[0].total)
        assertEquals(listOf(sep1, sep2), g[0].rows)
    }

    @Test fun `a UTC evening on the last day belongs to the next month in Tashkent`() {
        val g = groupByMonth(listOf(order("x", "2026-08-31T19:30:00Z", "1.00")))
        assertEquals(YearMonth.of(2026, 9), g.single().month)
    }
}
