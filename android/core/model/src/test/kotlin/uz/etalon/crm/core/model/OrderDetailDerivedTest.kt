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
