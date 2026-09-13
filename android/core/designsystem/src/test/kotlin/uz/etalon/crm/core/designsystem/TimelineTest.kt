package uz.etalon.crm.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.etalon.crm.core.designsystem.components.StepState
import uz.etalon.crm.core.designsystem.components.timelineFor
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.DispatchInfo
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderEventLine
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import java.math.BigDecimal
import java.time.Instant

/**
 * The «Етказиш» card's three columns — «Буюртма» → «Юкланди» → «Етказилди», the web's own ЖАРАЁН
 * chips. Pure Kotlin: [timelineFor] returns string *resources*, not strings, so the rule can be
 * exercised without an Android context.
 *
 * `placedAt` is 2026-09-01T00:00:00Z, which is 05:00 of 1 September in Tashkent — the zone
 * `formatDate` works in — so «1 сен 2026» is stable wherever this runs.
 */
class TimelineTest {
    private fun order(
        status: OrderStatus,
        dispatchedAt: Instant? = null,
        events: List<OrderEventLine> = emptyList(),
        shipments: List<ShipmentLine> = emptyList(),
        loadedAt: Instant? = null,
        deliveredAt: Instant? = null,
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
        rooms = emptyList(), payments = emptyList(), shipments = shipments,
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = events,
        dispatch = dispatchedAt?.let {
            DispatchInfo(
                id = "d1", driverName = "Азиз", truckIdentifier = "01A777AA",
                expectedCollection = Money.ZERO, dispatchedAt = it, returnedAt = null,
            )
        },
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
        loadedAt = loadedAt,
        deliveredAt = deliveredAt,
    )

    private fun loadedEvent(at: String) =
        OrderEventLine("e1", "ORDER_LOADED", null, "Азиз", Instant.parse(at))

    private fun shipment(
        id: String, loadedAt: Instant? = null, deliveredAt: Instant? = null,
    ) = ShipmentLine(
        id = id, number = 1, status = ShipmentStatus.DELIVERED, loadedBlocks = null,
        loadedPhotoUrl = null, loadedAt = loadedAt, deliveredAt = deliveredAt,
        driverName = null, truckIdentifier = null,
    )

    @Test
    fun `the card has three steps, not four`() {
        assertEquals(3, timelineFor(order(OrderStatus.PLACED)).size)
    }

    @Test
    fun `a placed order is on step one with its placed date`() {
        val t = timelineFor(order(OrderStatus.PLACED))
        assertEquals(listOf(StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING), t.map { it.state })
        assertEquals("1 сен 2026", t[0].caption)
    }

    /** IN_PRODUCTION shares step one: the model records no instant for it, and «Буюртма» is true
     *  of an order being made as much as of one just taken. */
    @Test
    fun `an order in production is still on step one`() {
        val t = timelineFor(order(OrderStatus.IN_PRODUCTION))
        assertEquals(listOf(StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING), t.map { it.state })
        assertEquals("1 сен 2026", t[0].caption)
    }

    /** The column that used to be «Йўлда». A truck that has left is a truck that was loaded, and
     *  the deal has no separate «on its way» milestone — the web's chips do not, either. */
    @Test
    fun `a dispatched order sits on step two as current`() {
        val t = timelineFor(
            order(
                OrderStatus.DISPATCHED,
                dispatchedAt = Instant.parse("2026-09-03T05:00:00Z"),
                events = listOf(loadedEvent("2026-09-02T04:10:00Z")),
            ),
        )
        assertEquals(listOf(StepState.DONE, StepState.CURRENT, StepState.UPCOMING), t.map { it.state })
        assertEquals("1 сен 2026", t[0].caption)
        assertEquals("2 сен 2026", t[1].caption)
    }

    @Test
    fun `a loaded order sits on step two too`() {
        assertEquals(
            listOf(StepState.DONE, StepState.CURRENT, StepState.UPCOMING),
            timelineFor(order(OrderStatus.LOADED)).map { it.state },
        )
    }

    /** No ORDER_LOADED event on a split order — it writes SHIPMENT_LOADED per truck — so the
     *  earliest truck's own `loadedAt` dates the step. */
    @Test
    fun `without a load event the first truck's loaded date dates step two`() {
        val t = timelineFor(
            order(
                OrderStatus.DISPATCHED,
                shipments = listOf(
                    shipment("s2", loadedAt = Instant.parse("2026-09-03T06:00:00Z")),
                    shipment("s1", loadedAt = Instant.parse("2026-09-02T06:00:00Z")),
                ),
            ),
        )
        assertEquals("2 сен 2026", t[1].caption)
    }

    /** Neither signal: the step is reached, so it says so with a check rather than a blank. */
    @Test
    fun `a reached step with no date shows the check`() {
        assertEquals("✓", timelineFor(order(OrderStatus.LOADED))[1].caption)
    }

    @Test
    fun `delivered marks all three done`() {
        assertTrue(timelineFor(order(OrderStatus.DELIVERED)).all { it.state == StepState.DONE })
    }

    /** The order is delivered when the LAST of it is, so the latest truck dates step three. */
    @Test
    fun `the last truck signed for dates step three`() {
        val t = timelineFor(
            order(
                OrderStatus.DELIVERED,
                shipments = listOf(
                    shipment("s1", deliveredAt = Instant.parse("2026-09-04T07:00:00Z")),
                    shipment("s2", deliveredAt = Instant.parse("2026-09-05T07:00:00Z")),
                ),
            ),
        )
        assertEquals("5 сен 2026", t[2].caption)
    }

    /** A whole-order delivery writes STATUS_CHANGED with the new status in a `payload` this client
     *  does not carry, so it falls through to the check rather than inventing a date. */
    @Test
    fun `a whole-order delivery with no shipment shows the check on step three`() {
        assertEquals("✓", timelineFor(order(OrderStatus.DELIVERED))[2].caption)
    }

    @Test
    fun `canceled leaves every step upcoming`() {
        assertTrue(timelineFor(order(OrderStatus.CANCELED)).all { it.state == StepState.UPCOMING })
    }

    @Test
    fun `a draft leaves every step upcoming too`() {
        assertTrue(timelineFor(order(OrderStatus.DRAFT)).all { it.state == StepState.UPCOMING })
    }

    @Test
    fun `an upcoming step says nothing at all`() {
        assertTrue(timelineFor(order(OrderStatus.PLACED)).drop(1).all { it.caption == null })
    }

    // ── the order's own stamps (`Order.loadedAt` / `Order.deliveredAt`) ──

    /** The single-truck load flow stamps the ORDER, which is the fact itself rather than a trace
     *  of it — so it dates «Юкланди» where the card used to fall back to a check. */
    @Test
    fun `the order's own loaded stamp dates step two`() {
        val t = timelineFor(order(OrderStatus.LOADED, loadedAt = Instant.parse("2026-09-02T04:10:00Z")))
        assertEquals("2 сен 2026", t[1].caption)
    }

    /** …and the order's own delivered stamp dates «Етказилди», which the whole-order delivery
     *  (a STATUS_CHANGED whose payload this client does not carry) otherwise could not. */
    @Test
    fun `the order's own delivered stamp dates step three`() {
        val t = timelineFor(order(OrderStatus.DELIVERED, deliveredAt = Instant.parse("2026-09-06T07:00:00Z")))
        assertEquals("6 сен 2026", t[2].caption)
    }

    /** The order's own stamp is the FIRST place looked, not merely one of three: when it disagrees
     *  with a truck's, the order's is the one the desk sees. */
    @Test
    fun `the order's stamps win over the events and the shipments`() {
        val t = timelineFor(
            order(
                OrderStatus.DELIVERED,
                events = listOf(loadedEvent("2026-09-02T04:10:00Z")),
                shipments = listOf(
                    shipment("s1", loadedAt = Instant.parse("2026-09-02T06:00:00Z"), deliveredAt = Instant.parse("2026-09-04T07:00:00Z")),
                ),
                loadedAt = Instant.parse("2026-09-03T04:00:00Z"),
                deliveredAt = Instant.parse("2026-09-05T04:00:00Z"),
            ),
        )
        assertEquals("3 сен 2026", t[1].caption)
        assertEquals("5 сен 2026", t[2].caption)
    }

    /** An order from before those columns were stamped still reads its history: with no order-level
     *  date and no truck signed for, the last SHIPMENT_DELIVERED event dates step three. This is
     *  the branch the fallback chain ends on, and nothing else covered it. */
    @Test
    fun `a shipment-delivered event dates step three when nothing else can`() {
        val t = timelineFor(
            order(
                OrderStatus.DELIVERED,
                events = listOf(
                    OrderEventLine("e2", "SHIPMENT_DELIVERED", null, "Азиз", Instant.parse("2026-09-04T07:00:00Z")),
                    OrderEventLine("e3", "SHIPMENT_DELIVERED", null, "Азиз", Instant.parse("2026-09-05T07:00:00Z")),
                ),
            ),
        )
        assertEquals("5 сен 2026", t[2].caption)
    }
}
