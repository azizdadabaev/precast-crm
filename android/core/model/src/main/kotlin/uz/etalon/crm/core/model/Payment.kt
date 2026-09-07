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
    /**
     * The ORDER's unlinked receipts — proof forwarded by the Telegram bot before any payment row
     * existed, so it belongs to no payment and would otherwise never be seen on the phone. The
     * web's confirm dialog shows it beside [receiptUrls]; the confirm sheet does the same, or the
     * owner decides on cash with less evidence than the desk has.
     */
    val orderReceiptUrls: List<String>,
    val rejectionReason: String?,
) {
    /** Every photo that bears on this payment, in the order the web's dialog shows them: the
     *  payment's own first, then the order-level proof that predates it. */
    val allReceiptUrls: List<String> get() = receiptUrls + orderReceiptUrls

    /**
     * The dispatch figure this payment may be measured against, or null when there is nothing to
     * measure it against. `expectedCollection` is what a DRIVER was sent out to collect on one
     * delivery, so `fromDriver` (the confirm route's `payment.collectedById != null`) is the whole
     * gate: in-office cash and bank transfers carry no driver, and comparing them to it would
     * force the confirmer to justify a discrepancy on a payment that is not short of anything.
     *
     * This is the ONE place that gate is written. [shortfall] below and the confirm sheet's own
     * shortfall — measured against the amount being confirmed rather than the recorded one — both
     * read it, so a queue card and its sheet can never disagree about whether a payment is short.
     */
    val expectedFromDriver: Money? get() = expectedCollection?.takeIf { fromDriver }

    /** The shortfall as recorded. The confirm sheet needs the same figure against an amount the
     *  owner is adjusting, which this cannot answer — it computes it from [expectedFromDriver]. */
    val shortfall: Money
        get() = expectedFromDriver?.let { (it - amount).coerceAtLeastZero() } ?: Money.ZERO
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
