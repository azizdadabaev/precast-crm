package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.dispatch.shipmentNumberOf
import java.math.BigDecimal
import java.time.Instant

/**
 * The Task-5 job walk dispatched truck 2 of an order carrying two, and neither the header nor the
 * navy gate said which lorry was leaving — both named the order alone, while the deliver gate on
 * the very same list names «Жўнатма 2 · № 09-0004». The nav key carries only the shipment's id, so
 * the route resolves the number off the order the ViewModel already loads.
 */
class DispatchShipmentNumberTest {

    @Test fun `a truck dispatch is named by its own number`() {
        assertEquals(2, shipmentNumberOf(detail(), "s2"))
    }

    /** A whole-order dispatch has no truck: the header and the gate name the order alone. */
    @Test fun `a whole-order dispatch has no number`() {
        assertNull(shipmentNumberOf(detail(), null))
    }

    /** The camera-first screens' rule: while the detail is still resolving the screen says less
     *  rather than something that could be wrong. */
    @Test fun `no number before the order resolves`() {
        assertNull(shipmentNumberOf(null, "s2"))
    }

    /** A truck that has since been deleted elsewhere must not borrow another one's number. */
    @Test fun `an unknown shipment id yields no number`() {
        assertNull(shipmentNumberOf(detail(), "gone"))
    }

    private fun shipment(id: String, number: Int) = ShipmentLine(
        id = id, number = number, status = ShipmentStatus.LOADED, loadedBlocks = null,
        loadedPhotoUrl = null, driverName = null, truckIdentifier = null,
    )

    private fun detail() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0004", status = OrderStatus.PLACED,
            paymentState = PaymentState.AWAITING_PAYMENT, totalPrice = Money.ZERO, confirmedPaid = Money.ZERO,
            totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0, scheduledAt = Instant.EPOCH,
            placedAt = Instant.EPOCH, client = ClientRef("c1", "Клиент", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(),
        shipments = listOf(shipment("s1", 1), shipment("s2", 2)),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.EPOCH,
    )
}
