package uz.etalon.crm.core.model

import java.time.Instant

/**
 * What the record-payment form collects. Mirrors PaymentRecordSchema, minus `receiptUrls`: a
 * receipt photo always attaches AFTER recording, via `PaymentsRepository.attachReceipt` queuing
 * one `ADD_PAYMENT_RECEIPT` per photo against the new payment's id — a queued upload returns an
 * outbox row id, never a URL, so this input could never actually carry one. Leaving the field
 * here would only invite a caller to populate it and have the value silently dropped, since
 * `record` sends the request's `receiptUrls` as `emptyList()` unconditionally.
 */
data class PaymentRecordInput(
    val orderId: String,
    val amount: Money,
    val method: PaymentMethod,
    val source: PaymentSource,
    val handOverNow: Boolean = false,
    val collectedByDriverId: String? = null,
    val notes: String? = null,
    val paidOn: String? = null,
)

/** Who touched the money, in order. Rendered as the custody chain on a queue card. */
data class CustodyChain(
    val collectedBy: String?,
    val recordedBy: String?,
    val handedOverTo: String?,
    val confirmedBy: String?,
)

/** One row of GET /api/payments, with the order context the confirm queue shows. */
data class PaymentQueueItem(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val amount: Money,
    val originalAmount: Money?,
    val method: PaymentMethod,
    val status: PaymentStatus,
    val recordedAt: Instant,
    val paidOn: Instant?,
    val expectedCollection: Money?,
    val fromDriver: Boolean,
    val custody: CustodyChain,
    val receiptUrls: List<String>,
    val rejectionReason: String?,
) {
    /** Only a driver-collected payment measured against a dispatch can be short. */
    val shortfall: Money
        get() = if (fromDriver && expectedCollection != null) (expectedCollection - amount).coerceAtLeastZero() else Money.ZERO
}

data class Discrepancy(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val driverName: String?,
    val expectedAmount: Money,
    val receivedAmount: Money,
    val status: DiscrepancyStatus,
    val reportedAt: Instant,
    val resolutionNote: String?,
) {
    val gap: Money get() = (expectedAmount - receivedAmount).coerceAtLeastZero()
}
