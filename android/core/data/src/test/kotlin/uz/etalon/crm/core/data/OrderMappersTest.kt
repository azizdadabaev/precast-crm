package uz.etalon.crm.core.data

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
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
    @Test fun `a summary's write-off amount reduces remaining, same as the detail's`() {
        // totalPrice 12 400 000 − confirmedPaid 6 000 000 (unchanged from the fixture above) − writeOff 1 000 000
        val o = dto.copy(writeOffAmount = "1000000.00").toDomain()
        assertEquals(Money.parse("5400000.00"), o.remaining)
    }
    @Test fun `detail makes media urls absolute and computes remaining with write-off`() {
        val d = OrderDetailDto("o1", "2026-09-0041", "LOADED", "PARTIALLY_PAID", "100.00", "60.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "10.00",
            deliveryProofUrl = "/uploads/orders/o1/delivery-1.jpg",
            galleryPhotos = listOf(GalleryPhotoDto("g1", "/uploads/orders/o1/loaded-1.jpg")),
            payments = listOf(PaymentDto("p1", "60.00", "CASH", "CONFIRMED", "2026-09-02T00:00:00.000Z", NameDto("u1", "Азиз"), listOf(ReceiptDto("r1", "/uploads/receipts/u1/x.jpg")))))
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

    @Test fun `detail maps cancel reason, canceled-at and discount percent`() {
        val d = OrderDetailDto(
            "o1", "2026-09-0041", "CANCELED", "AWAITING_PAYMENT", "100.00", "0.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "0",
            cancelReason = "Мижоз бекор қилди", canceledAt = "2026-09-05T08:00:00.000Z", discountPercent = "2.10",
        )
        val o = d.toDomain("https://etalontbm.uz", Instant.EPOCH)
        assertEquals("Мижоз бекор қилди", o.cancelReason)
        assertEquals(Instant.parse("2026-09-05T08:00:00Z"), o.canceledAt)
        // Feeds the UI's formatPercent(o.discountPercent, 1) = «2,1%» — out of scope here (no
        // UI change in this task), so this only pins the mapped decimal itself.
        assertEquals(BigDecimal("2.10"), o.discountPercent)
    }

    @Test fun `detail decodes when cancel reason, canceled-at and discount percent are absent`() {
        val json = Json { ignoreUnknownKeys = true }
        val body = """
            {"id":"o1","orderNumber":"2026-09-0041","status":"PLACED","paymentState":"AWAITING_PAYMENT",
             "totalPrice":"100.00","confirmedPaid":"0.00","totalArea":"10.000","totalBlocks":1,"totalBeams":1,
             "scheduledAt":"2026-09-04T00:00:00.000Z","placedAt":"2026-09-01T00:00:00.000Z",
             "client":{"id":"c1","name":"A","phone":"998901112233"},
             "roomsSubtotal":"100.00","discountAmount":"0","deliveryCost":"0","otherCost":"0"}
        """.trimIndent()
        val dto = json.decodeFromString<OrderDetailDto>(body)
        val o = dto.toDomain("https://etalontbm.uz", Instant.EPOCH)
        assertNull(o.cancelReason)
        assertNull(o.canceledAt)
        assertEquals(BigDecimal.ZERO, o.discountPercent)
        // …and so are the order's own load/delivery stamps, which an order that got nowhere near a
        // lorry genuinely does not have. The timeline shows a check, not a date.
        assertNull(o.loadedAt)
        assertNull(o.deliveredAt)
    }

    /** `Order.loadedAt` / `Order.deliveredAt` — the ORDER's own stamps, distinct from the
     *  same-named fields on a shipment (one truck's). The «Етказиш» timeline reads these first. */
    @Test fun `detail maps the order's own loaded and delivered stamps`() {
        val d = OrderDetailDto(
            "o1", "2026-09-0041", "DELIVERED", "FULLY_PAID", "100.00", "100.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "0",
            loadedAt = "2026-09-02T04:10:00.000Z", deliveredAt = "2026-09-03T11:30:00.000Z",
        )
        val o = d.toDomain("https://etalontbm.uz", Instant.EPOCH)
        assertEquals(Instant.parse("2026-09-02T04:10:00Z"), o.loadedAt)
        assertEquals(Instant.parse("2026-09-03T11:30:00Z"), o.deliveredAt)
    }
}
