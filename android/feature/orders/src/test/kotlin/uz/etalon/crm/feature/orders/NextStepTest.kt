package uz.etalon.crm.feature.orders

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.orders.detail.NextStep
import uz.etalon.crm.feature.orders.detail.canAddPhoto
import uz.etalon.crm.feature.orders.detail.nextStepFor
import java.math.BigDecimal
import java.time.Instant

class NextStepTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)
    private val editor = me("order.view", "order.edit", "dispatch.create")
    private val reader = me("order.view")

    private fun shipment(id: String, status: ShipmentStatus) = ShipmentLine(
        id = id, number = 1, status = status, loadedBlocks = null, loadedPhotoUrl = null,
        driverName = null, truckIdentifier = null,
    )

    private fun order(status: OrderStatus, shipments: List<ShipmentLine> = emptyList()) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0001", status = status,
            paymentState = PaymentState.AWAITING_PAYMENT,
            totalPrice = Money.parse("1000000"), confirmedPaid = Money.ZERO,
            totalArea = BigDecimal.ONE, totalBlocks = 1, totalBeams = 1,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH,
            client = ClientRef("c", "Мижоз", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = shipments,
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.EPOCH,
    )

    @Test fun `a placed order asks for the truck photo`() {
        assertEquals(NextStep.LoadTruck, nextStepFor(order(OrderStatus.PLACED), editor, 0))
    }

    @Test fun `an in-production order still asks for the truck photo`() {
        assertEquals(NextStep.LoadTruck, nextStepFor(order(OrderStatus.IN_PRODUCTION), editor, 0))
    }

    @Test fun `a loaded order asks for delivery proof`() {
        assertEquals(NextStep.DeliveryProof, nextStepFor(order(OrderStatus.LOADED), editor, 0))
        assertEquals(NextStep.DeliveryProof, nextStepFor(order(OrderStatus.DISPATCHED), editor, 0))
    }

    @Test fun `an order split across trucks routes to the shipment list instead`() {
        val split = order(OrderStatus.PLACED, shipments = listOf(shipment("s1", ShipmentStatus.PENDING)))
        assertEquals(NextStep.ManageShipments, nextStepFor(split, editor, 0))
    }

    /** The whole-order LOAD route is refused by the server once shipments exist, so no status may
     *  fall through to it while the order carries trucks of its own. */
    @Test fun `no status offers a whole-order load once shipments exist`() {
        val trucks = listOf(shipment("s1", ShipmentStatus.LOADED))
        listOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.LOADED, OrderStatus.DISPATCHED).forEach { st ->
            assertEquals(NextStep.ManageShipments, nextStepFor(order(st, trucks), editor, 0), st.name)
        }
    }

    @Test fun `a delivered or canceled order has no next step`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.DELIVERED), editor, 0))
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.CANCELED), editor, 0))
    }

    /** A draft has not been placed; there is nothing to load and nothing to prove. */
    @Test fun `a draft order has no next step`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.DRAFT), editor, 0))
    }

    /** A status this build does not know must not be guessed into an action. */
    @Test fun `an unknown status has no next step`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.UNKNOWN), editor, 0))
    }

    @Test fun `a user without order edit is offered nothing`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.PLACED), reader, 0))
    }

    /** Permission outranks everything, including a queued upload and a split order. */
    @Test fun `a user without order edit is offered nothing on any status`() {
        OrderStatus.entries.forEach { st ->
            assertEquals(NextStep.None, nextStepFor(order(st), reader, 0), st.name)
            assertEquals(NextStep.None, nextStepFor(order(st), reader, 2), st.name)
            assertEquals(
                NextStep.None,
                nextStepFor(order(st, listOf(shipment("s1", ShipmentStatus.PENDING))), reader, 0),
                st.name,
            )
        }
    }

    @Test fun `a pending upload blocks the action so the same photo is not sent twice`() {
        val step = nextStepFor(order(OrderStatus.PLACED), editor, pendingUploads = 1)
        assertTrue(step is NextStep.Blocked)
    }

    /** Every live status blocks while an upload is queued — including a split order, whose
     *  shipment list would otherwise offer a second load of the truck already queued. */
    @Test fun `a pending upload blocks every live status`() {
        listOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.LOADED, OrderStatus.DISPATCHED).forEach { st ->
            assertTrue(nextStepFor(order(st), editor, 1) is NextStep.Blocked, st.name)
            assertTrue(
                nextStepFor(order(st, listOf(shipment("s1", ShipmentStatus.PENDING))), editor, 3) is NextStep.Blocked,
                st.name,
            )
        }
    }

    /** A finished order stays silent even with something still in the queue: there is no action
     *  to block, so the bar must not appear at all. */
    @Test fun `a pending upload does not resurrect a bar on a finished order`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.DELIVERED), editor, 1))
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.CANCELED), editor, 1))
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.DRAFT), editor, 1))
    }

    @Test fun `the blocked reason is the Uzbek sending notice`() {
        assertEquals(NextStep.Blocked("Юборилмоқда…"), nextStepFor(order(OrderStatus.PLACED), editor, 1))
    }

    @Test fun `a photo may be added while the order is live and the operator may edit`() {
        listOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.LOADED, OrderStatus.DISPATCHED).forEach { st ->
            assertTrue(canAddPhoto(order(st), editor), st.name)
        }
    }

    @Test fun `a photo may not be added on a finished order or without order edit`() {
        listOf(OrderStatus.DRAFT, OrderStatus.DELIVERED, OrderStatus.CANCELED, OrderStatus.UNKNOWN).forEach { st ->
            assertFalse(canAddPhoto(order(st), editor), st.name)
        }
        assertFalse(canAddPhoto(order(OrderStatus.PLACED), reader))
    }
}
