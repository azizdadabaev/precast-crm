package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant

class OrderDetailDerivedTest {
    @Test fun `the constant matches the calculator's rule of thumb`() {
        assertEquals(BigDecimal(180), ORDER_KG_PER_M2)
    }

    @Test fun `load list groups rooms by two-decimal beam length, summing counts, first-appearance order`() {
        val rooms = listOf(
            room(beamLength = "3.8", beamCount = 8, totalBlocks = 20),
            room(beamLength = "5.05", beamCount = 3, totalBlocks = 5),
            room(beamLength = "3.8", beamCount = 6, totalBlocks = 15),
        )
        val d = detailWith(rooms)
        assertEquals(
            listOf(LoadLine("3.80", BigDecimal("3.80"), 14), LoadLine("5.05", BigDecimal("5.05"), 3)),
            d.loadList,
        )
    }

    /**
     * The rule at its source, one call from the load list and from `allowanceFor`'s caps alike.
     * `toFixed(2)` rounds the binary double: 3.505 is stored as the nearest `Double`, 3.504999…,
     * and reads «3.50». Decimal HALF_UP would read «3.51», and a beam posted under «3.51» is
     * compared against a server total of zero — a permanent 422 in the yard.
     */
    @Test fun `beamLengthKey spells a length exactly as toFixed does`() {
        assertEquals("3.50", beamLengthKey(BigDecimal("3.505")))
        assertEquals("4.00", beamLengthKey(BigDecimal("4.005")))
        assertEquals("3.30", beamLengthKey(BigDecimal("3.3")))
        assertEquals("5.05", beamLengthKey(BigDecimal("5.05")))
    }

    /**
     * The web keys its load list with `Number(beamLength).toFixed(2)`, which rounds the binary
     * double: 3.505 is stored as the nearest `Double`, 3.504999…, and reads «3.50». A decimal
     * HALF_UP would read «3.51» and the loader's two lists would disagree on a length that the
     * server's `Decimal(10,3)` really can hold.
     */
    @Test fun `the two-decimal key rounds the binary value, exactly as toFixed does`() {
        val keys = detailWith(
            listOf(
                room(beamLength = "3.505", beamCount = 1, totalBlocks = 0),
                room(beamLength = "4.005", beamCount = 1, totalBlocks = 0),
                room(beamLength = "3.8", beamCount = 1, totalBlocks = 0),
                room(beamLength = "5.05", beamCount = 1, totalBlocks = 0),
            ),
        ).loadList.map { it.lengthKey }
        assertEquals(listOf("3.50", "4.00", "3.80", "5.05"), keys)
    }

    @Test fun `total blocks sums every room`() {
        val rooms = listOf(room(beamLength = "3.8", beamCount = 8, totalBlocks = 20), room(beamLength = "5.05", beamCount = 3, totalBlocks = 5))
        assertEquals(25, detailWith(rooms).totalBlocks)
    }

    @Test fun `weight is total area times 180, rounded to whole kilograms`() {
        val d = detailWith(rooms = emptyList(), totalArea = BigDecimal("78.70"))
        assertEquals(BigDecimal("14166"), d.weightKg)
    }
}

private fun room(beamLength: String, beamCount: Int, totalBlocks: Int) = RoomLine(
    name = null, innerWidth = BigDecimal.ZERO, innerLength = BigDecimal.ZERO, pattern = "GBG",
    beamLength = BigDecimal(beamLength), beamCount = beamCount, totalBlocks = totalBlocks,
    billedArea = BigDecimal.ZERO, subtotal = Money.ZERO,
)

private fun detailWith(rooms: List<RoomLine>, totalArea: BigDecimal = BigDecimal.ZERO): OrderDetail {
    val client = ClientRef(id = "c1", name = "Client", phone = "+998900000000", address = null)
    val summary = OrderSummary(
        id = "o1", orderNumber = "ORD-1", status = OrderStatus.PLACED, paymentState = PaymentState.PARTIALLY_PAID,
        totalPrice = Money.ZERO, confirmedPaid = Money.ZERO,
        totalArea = totalArea, totalBlocks = 0, totalBeams = 0,
        scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH, client = client,
    )
    return OrderDetail(
        summary = summary, notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.ZERO,
        rooms = rooms, payments = emptyList(), shipments = emptyList(), loadedPhotos = emptyList(),
        deliveryProofUrl = null, events = emptyList(), dispatch = null, fetchedAt = Instant.EPOCH,
    )
}
