package uz.etalon.crm.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Test
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.feature.orders.detail.paidPercent
import java.math.BigDecimal
import java.time.Instant

/**
 * The «N % тўланган» label on the «Тўлов ҳолати» card. The bar's geometry is a rounded fraction;
 * the *label* is a claim about the debt and is clamped so it can never contradict the «Қолди …»
 * figure beside it.
 */
class PaidPercentTest {
    private val total = "13350000.00"

    private fun order(paid: String) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0003", status = OrderStatus.DISPATCHED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse(total), confirmedPaid = Money.parse(paid),
            totalArea = BigDecimal("78.70"), totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.parse("2026-08-30T06:00:00Z"),
            placedAt = Instant.parse("2026-08-30T06:00:00Z"),
            client = ClientRef("c1", "Yusupov & Sons", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.parse(total), writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = emptyList(),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    @Test
    fun `one UZS short of settled is 99 percent, never 100`() {
        assertEquals(99, paidPercent(order("13349999.00")))
    }

    @Test
    fun `one UZS paid is 1 percent, never 0`() {
        assertEquals(1, paidPercent(order("1.00")))
    }

    @Test
    fun `nothing paid is 0 percent`() {
        assertEquals(0, paidPercent(order("0.00")))
    }

    @Test
    fun `settled is 100 percent`() {
        assertEquals(100, paidPercent(order(total)))
    }

    @Test
    fun `the capture's order reads 45 percent`() {
        assertEquals(45, paidPercent(order("6000000.00")))
    }
}
