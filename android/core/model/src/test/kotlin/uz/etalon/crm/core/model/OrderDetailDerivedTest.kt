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
            listOf(LoadLine("3.80", 14), LoadLine("5.05", 3)),
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

    /**
     * The cost card's column has to add up. A real order placed from this app: 2,5 % of
     * 15 456 460 is 386 411,50, so `discountAmount` printed on its own reads «386 412» against a
     * «Жами» struck from 15 370 048,50 — «15 370 049». The customer adding the printed figures
     * gets one UZS less than the price they are asked for.
     */
    @Test fun `the printed discount makes the cost column add up on an exact half`() {
        val d = costs(subtotal = "15456460.00", discount = "386411.50", delivery = "300000.00", total = "15370048.50")
        assertEquals(BigDecimal("386411"), d.displayedDiscount.amount)
        assertEquals(
            d.summary.totalPrice.roundedWhole(),
            d.roomsSubtotal.roundedWhole() - d.displayedDiscount.amount + d.deliveryCost.roundedWhole(),
        )
    }

    /** A discount that needs no help prints exactly what the server stored. */
    @Test fun `a whole discount is printed unchanged`() {
        val d = costs(subtotal = "13542460.00", discount = "677123.00", delivery = "300000.00", total = "13165337.00")
        assertEquals(BigDecimal("677123"), d.displayedDiscount.amount)
    }

    /** No discount at all derives to nothing, so the card leaves the line out. */
    @Test fun `no discount derives to zero`() {
        val d = costs(subtotal = "13542460.00", discount = "0", delivery = "300000.00", total = "13842460.00")
        assertEquals(0, d.displayedDiscount.amount.signum())
    }

    /**
     * A total that was NOT struck from these four figures — an order whose price was moved on its
     * own — derives a figure that is nowhere near the stored discount. The stored one is printed
     * rather than an invented number, and the line is not dropped: the order really does carry a
     * 386 411,50 discount and the operator has to see it.
     */
    @Test fun `a derivation far from the stored discount falls back to the stored figure`() {
        val d = costs(subtotal = "15456460.00", discount = "386411.50", delivery = "300000.00", total = "15000000.00")
        assertEquals(BigDecimal("386412"), d.displayedDiscount.amount)
    }

    /** A total ABOVE its own subtotal plus costs derives a negative discount — also the stored
     *  figure, never a «− −100 000» line. */
    @Test fun `a negative derivation falls back to the stored figure`() {
        val d = costs(subtotal = "1000000.00", discount = "50000.00", delivery = "0", total = "1100000.00")
        assertEquals(BigDecimal("50000"), d.displayedDiscount.amount)
    }
}

/** An order priced the way `POST /api/orders` stores one: whole-UZS costs, a `Decimal(14,2)`
 *  discount and the total the server struck from them. */
private fun costs(subtotal: String, discount: String, delivery: String, total: String): OrderDetail =
    detailWith(rooms = emptyList()).let { d ->
        d.copy(
            roomsSubtotal = Money.parse(subtotal),
            discountAmount = Money.parse(discount),
            deliveryCost = Money.parse(delivery),
            summary = d.summary.copy(totalPrice = Money.parse(total)),
        )
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
