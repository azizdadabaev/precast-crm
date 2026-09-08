package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

class RecordableRemainingTest {
    @Test fun `what may still be recorded excludes payments already awaiting confirmation`() {
        val d = detailWith(total = "10000000", confirmed = "4000000", writeOff = "0", pending = listOf("1500000"))
        // Display remaining ignores the queue: 10 000 000 − 4 000 000 − 0
        assertEquals(Money.parse("6000000"), d.remaining)
        // The server would refuse anything above 10M − 4M − 1.5M − 0
        assertEquals(Money.parse("4500000"), d.recordableRemaining)
    }

    @Test fun `a write-off reduces both, and neither ever goes negative`() {
        val d = detailWith(total = "5000000", confirmed = "4000000", writeOff = "900000", pending = listOf("500000"))
        assertEquals(Money.parse("100000"), d.remaining)
        assertEquals(Money.ZERO, d.recordableRemaining)   // 5M − 4M − 0.9M − 0.5M is negative
    }

    @Test fun `a rejected payment does not hold back the balance`() {
        val d = detailWith(total = "1000000", confirmed = "0", writeOff = "0", pending = emptyList(), rejected = listOf("400000"))
        assertEquals(Money.parse("1000000"), d.recordableRemaining)
    }

    /** [OrderSummary] has no caller today, but its own `remaining` must agree with
     *  [OrderDetail.remaining] on the same order — see the server's `remainingBalance`
     *  (src/lib/payment-state.ts). Pinned so a future caller doesn't inherit an overstated
     *  balance on a settled order. */
    @Test fun `a settled order's summary shows nothing owed once the write-off covers it`() {
        val summary = OrderSummary(
            id = "o1", orderNumber = "ORD-1", status = OrderStatus.PLACED, paymentState = PaymentState.FULLY_PAID,
            totalPrice = Money.parse("5000000"), confirmedPaid = Money.parse("4100000"), writeOffAmount = Money.parse("900000"),
            totalArea = java.math.BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH,
            client = ClientRef(id = "c1", name = "Client", phone = "+998900000000", address = null),
        )
        assertEquals(Money.ZERO, summary.remaining)
    }
}

private fun detailWith(
    total: String,
    confirmed: String,
    writeOff: String,
    pending: List<String>,
    rejected: List<String> = emptyList(),
): OrderDetail {
    val client = ClientRef(id = "c1", name = "Client", phone = "+998900000000", address = null)
    val summary = OrderSummary(
        id = "o1",
        orderNumber = "ORD-1",
        status = OrderStatus.PLACED,
        paymentState = PaymentState.PARTIALLY_PAID,
        totalPrice = Money.parse(total),
        confirmedPaid = Money.parse(confirmed),
        totalArea = java.math.BigDecimal.ZERO,
        totalBlocks = 0,
        totalBeams = 0,
        scheduledAt = Instant.EPOCH,
        placedAt = Instant.EPOCH,
        client = client,
    )
    val pendingLines = pending.mapIndexed { i, amount ->
        PaymentLine(
            id = "pending-$i",
            amount = Money.parse(amount),
            method = PaymentMethod.CASH,
            status = PaymentStatus.PENDING_CONFIRMATION,
            recordedAt = Instant.EPOCH,
            recordedByName = null,
            receiptUrls = emptyList(),
        )
    }
    val rejectedLines = rejected.mapIndexed { i, amount ->
        PaymentLine(
            id = "rejected-$i",
            amount = Money.parse(amount),
            method = PaymentMethod.CASH,
            status = PaymentStatus.REJECTED,
            recordedAt = Instant.EPOCH,
            recordedByName = null,
            receiptUrls = emptyList(),
        )
    }
    return OrderDetail(
        summary = summary,
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.parse(writeOff),
        rooms = emptyList(),
        payments = pendingLines + rejectedLines,
        shipments = emptyList(),
        loadedPhotos = emptyList(),
        deliveryProofUrl = null,
        events = emptyList(),
        dispatch = null,
        fetchedAt = Instant.EPOCH,
    )
}
