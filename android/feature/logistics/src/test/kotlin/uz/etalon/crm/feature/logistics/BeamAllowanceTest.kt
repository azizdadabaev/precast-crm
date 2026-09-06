package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.logistics.shipments.allowanceFor
import java.math.BigDecimal
import java.time.Instant

class BeamAllowanceTest {

    private fun room(beamLength: String, beams: Int, blocks: Int) = RoomLine(
        name = null, innerWidth = BigDecimal("4.0"), innerLength = BigDecimal("6.0"), pattern = "GB",
        beamLength = BigDecimal(beamLength), beamCount = beams, totalBlocks = blocks,
        billedArea = BigDecimal("24"), subtotal = Money.parse("1000"),
    )

    private fun shipment(id: String, beams: Map<String, Int>, blocks: Int) = ShipmentLine(
        id = id, number = 1, status = ShipmentStatus.LOADED, loadedBeams = beams, loadedBlocks = blocks,
        loadedPhotoUrl = null, driverName = null, truckIdentifier = null,
    )

    /** Fills every `OrderDetail`/`OrderSummary` field the allowance arithmetic does not touch
     *  with a neutral value, so each test only has to spell out rooms and shipments. */
    private fun detailFixture(rooms: List<RoomLine>, shipments: List<ShipmentLine>): OrderDetail = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "ORD-1", status = OrderStatus.PLACED, paymentState = PaymentState.AWAITING_PAYMENT,
            totalPrice = Money.ZERO, confirmedPaid = Money.ZERO, totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH, client = ClientRef("c1", "Клиент", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.ZERO,
        rooms = rooms,
        payments = emptyList(),
        shipments = shipments,
        loadedPhotos = emptyList(),
        deliveryProofUrl = null,
        events = emptyList(),
        dispatch = null,
        fetchedAt = Instant.EPOCH,
    )

    private fun order(rooms: List<RoomLine>, shipments: List<ShipmentLine>): OrderDetail =
        detailFixture(rooms = rooms, shipments = shipments)   // small helper in the test file

    @Test fun `an untouched order offers every beam and block it contains`() {
        val o = order(listOf(room("4.30", 10, 200), room("3.30", 6, 120)), emptyList())
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(mapOf("4.30" to 10, "3.30" to 6), a.beams)
        assertEquals(320, a.blocks)
    }

    @Test fun `what another truck already took is subtracted`() {
        val o = order(
            listOf(room("4.30", 10, 200)),
            listOf(shipment("s1", mapOf("4.30" to 4), 50)),
        )
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(mapOf("4.30" to 6), a.beams)
        assertEquals(150, a.blocks)
    }

    @Test fun `re-loading a truck does not count that truck against itself`() {
        val o = order(
            listOf(room("4.30", 10, 200)),
            listOf(shipment("s1", mapOf("4.30" to 4), 50)),
        )
        val a = allowanceFor(o, excludingShipmentId = "s1")
        assertEquals(mapOf("4.30" to 10), a.beams)
        assertEquals(200, a.blocks)
    }

    @Test fun `an over-shipped length reports zero rather than a negative allowance`() {
        val o = order(
            listOf(room("4.30", 5, 100)),
            listOf(shipment("s1", mapOf("4.30" to 9), 130)),
        )
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(0, a.beams["4.30"])
        assertEquals(0, a.blocks)
    }

    @Test fun `beam lengths are keyed to two decimals, matching the server`() {
        val o = order(listOf(room("4.3", 10, 0)), emptyList())
        assertEquals(setOf("4.30"), allowanceFor(o, null).beams.keys)
    }
}
