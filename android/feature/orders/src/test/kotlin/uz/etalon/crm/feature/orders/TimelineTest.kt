package uz.etalon.crm.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.etalon.crm.core.designsystem.components.StepState
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.DispatchInfo
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.feature.orders.detail.timelineFor
import java.math.BigDecimal
import java.time.Instant

/**
 * The «Етказиш» card's four columns. Pure Kotlin — [timelineFor] returns string *resources*, not
 * strings, so the rule can be exercised without an Android context.
 *
 * `placedAt` is 2026-09-01T00:00:00Z, which is 05:00 of 1 September in Tashkent — the zone
 * `formatDate` works in — so «1 сен 2026» is stable wherever this runs.
 */
class TimelineTest {
    private fun order(
        status: OrderStatus,
        dispatchedAt: Instant? = null,
    ) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0003", status = status,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("13350000.00"), confirmedPaid = Money.parse("6000000.00"),
            totalArea = BigDecimal("78.70"), totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.parse("2026-08-30T00:00:00Z"),
            placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = ClientRef("c1", "Yusupov & Sons", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = emptyList(),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(),
        dispatch = dispatchedAt?.let {
            DispatchInfo(
                id = "d1", driverName = "Азиз", truckIdentifier = "01A777AA",
                expectedCollection = Money.ZERO, dispatchedAt = it, returnedAt = null,
            )
        },
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    @Test
    fun `a placed order is on step one with its placed date`() {
        val t = timelineFor(order(OrderStatus.PLACED))
        assertEquals(listOf(StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING), t.map { it.state })
        assertEquals("1 сен 2026", t[0].caption)
    }

    @Test
    fun `a dispatched order has two done, one current, one upcoming`() {
        val t = timelineFor(order(OrderStatus.DISPATCHED, dispatchedAt = Instant.parse("2026-09-03T05:00:00Z")))
        assertEquals(listOf(StepState.DONE, StepState.DONE, StepState.CURRENT, StepState.UPCOMING), t.map { it.state })
        assertEquals("✓", t[1].caption)
        assertEquals("3 сен 2026", t[2].caption)
    }

    @Test
    fun `delivered marks all four done`() {
        assertTrue(timelineFor(order(OrderStatus.DELIVERED)).all { it.state == StepState.DONE })
    }

    @Test
    fun `canceled leaves every step upcoming`() {
        assertTrue(timelineFor(order(OrderStatus.CANCELED)).all { it.state == StepState.UPCOMING })
    }

    @Test
    fun `an upcoming step says nothing at all`() {
        assertTrue(timelineFor(order(OrderStatus.PLACED)).drop(1).all { it.caption == null })
    }
}
