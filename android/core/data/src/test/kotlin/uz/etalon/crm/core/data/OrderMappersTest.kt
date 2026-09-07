package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.dto.*
import java.math.BigDecimal
import java.time.Instant

class OrderMappersTest {
    private val dto = OrderSummaryDto("o1", "2026-09-0041", "PLACED", "PARTIALLY_PAID", "12400000.00", "6000000.00", "86.400", 210, 10,
        "2026-09-04T00:00:00.000Z", "2026-09-01T09:15:00.000Z", ClientDto("c1", "Азизов Б.", "998901112233", "Яшнобод"))

    @Test fun `summary maps money as strings and enums by name`() {
        val o = dto.toDomain()
        assertEquals(Money.parse("12400000.00"), o.totalPrice)
        assertEquals(OrderStatus.PLACED, o.status)
        assertEquals(PaymentState.PARTIALLY_PAID, o.paymentState)
        assertEquals(BigDecimal("86.400"), o.totalArea)
        assertEquals(Money.parse("6400000.00"), o.remaining)
        assertEquals(Instant.parse("2026-09-04T00:00:00Z"), o.scheduledAt)
    }
    @Test fun `unknown enum values do not crash`() {
        assertEquals(OrderStatus.UNKNOWN, dto.copy(status = "SOMETHING_NEW").toDomain().status)
    }
    @Test fun `detail makes media urls absolute and computes remaining with write-off`() {
        val d = OrderDetailDto("o1", "2026-09-0041", "LOADED", "PARTIALLY_PAID", "100.00", "60.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "10.00",
            deliveryProofUrl = "/uploads/orders/o1/delivery-1.jpg",
            galleryPhotos = listOf(GalleryPhotoDto("g1", "/uploads/orders/o1/loaded-1.jpg")),
            payments = listOf(OrderPaymentDto("p1", "60.00", "CASH", "CONFIRMED", "2026-09-02T00:00:00.000Z", NameDto("u1", "Азиз"), listOf(ReceiptDto("r1", "/uploads/receipts/u1/x.jpg")))))
        val o = d.toDomain("https://etalontbm.uz", Instant.EPOCH)
        assertEquals(Money.parse("30.00"), o.remaining)
        assertEquals("https://etalontbm.uz/uploads/orders/o1/loaded-1.jpg", o.loadedPhotoUrls.single())
        assertEquals("https://etalontbm.uz/uploads/orders/o1/delivery-1.jpg", o.deliveryProofUrl)
        assertEquals("https://etalontbm.uz/uploads/receipts/u1/x.jpg", o.payments.single().receiptUrls.single())
        assertEquals(PaymentMethod.CASH, o.payments.single().method)
    }

    /** `Money.parse` throws on a malformed string, which would fail the whole detail decode —
     *  nothing exercised the new shipment-timing/cash and dispatch fields before this, so a
     *  server response shaped like this one could have broken silently until a real device hit it. */
    @Test fun `detail maps loaded-shipment timing, cash and the dispatch block`() {
        val d = OrderDetailDto(
            "o1", "2026-09-0041", "LOADED", "PARTIALLY_PAID", "100.00", "60.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "0",
            shipments = listOf(ShipmentDto(
                id = "s1", number = 1, status = "DISPATCHED",
                loadedBeams = mapOf("3.30" to 5, "4.00" to 2), loadedBlocks = 40,
                loadedAt = "2026-09-02T08:00:00.000Z", dispatchedAt = "2026-09-02T09:00:00.000Z", deliveredAt = null,
                driverWillCollectCash = true, cashToCollect = "150000.00", truckIdentifier = "01A123BB",
                driver = DriverDto("dr1", "Шер"),
            )),
            dispatch = DispatchDto(
                id = "dp1", driverId = "dr1", truckIdentifier = "01A123BB", expectedCollection = "150000.00",
                dispatchedAt = "2026-09-02T09:00:00.000Z", returnedAt = null, driver = DriverDto("dr1", "Шер"),
            ),
        )
        val o = d.toDomain("https://etalontbm.uz", Instant.EPOCH)

        val shipment = o.shipments.single()
        assertEquals(mapOf("3.30" to 5, "4.00" to 2), shipment.loadedBeams)
        assertEquals(Instant.parse("2026-09-02T08:00:00Z"), shipment.loadedAt)
        assertEquals(Instant.parse("2026-09-02T09:00:00Z"), shipment.dispatchedAt)
        assertNull(shipment.deliveredAt)
        assertTrue(shipment.driverWillCollectCash)
        assertEquals(Money.parse("150000.00"), shipment.cashToCollect)

        val dispatch = o.dispatch!!
        assertEquals("Шер", dispatch.driverName)
        assertEquals("01A123BB", dispatch.truckIdentifier)
        assertEquals(Money.parse("150000.00"), dispatch.expectedCollection)
        assertFalse(dispatch.isReturned)
    }
}
