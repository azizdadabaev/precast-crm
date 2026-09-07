package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentRecordInput
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.PaymentConfirmRequest
import uz.etalon.crm.core.network.dto.PaymentRecordRequest
import uz.etalon.crm.core.network.dto.PaymentRejectRequest
import uz.etalon.crm.core.network.dto.PaymentRowDto
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Recording cash and attaching a receipt photo are both wrapped in this one permission
 *  server-side. */
private const val PAYMENT_RECORD = "payment.record"

/** Approving or rejecting a pending payment — the owner/admin side of the workflow
 *  `payment.record` starts. */
private const val PAYMENT_CONFIRM = "payment.confirm"

@Singleton
class PaymentsRepository @Inject constructor(
    private val api: EtalonApi,
    private val outbox: OutboxGateway,
    private val orders: OrdersGateway,
    private val permissions: PermissionGate,
    @Named("apiBaseUrl") private val mediaBase: String,
) {
    // ── Online only: still sent live, never queued ────────────────

    /**
     * Returns the new payment's id so the caller can enqueue one ADD_PAYMENT_RECEIPT per captured
     * photo against it. `receiptUrls` always travels empty here: a queued upload returns an
     * outbox row id, never a URL, so it can never populate this request's `receiptUrls`.
     *
     * [idempotencyKey] is the caller's, not this method's, and that is deliberate: the key has to
     * stay the same across a RETRY of one submission and differ for a genuinely new one, and only
     * the screen holding the form knows which of the two a tap is. Minting one here would make
     * every attempt look new and defend nothing.
     */
    suspend fun record(input: PaymentRecordInput, idempotencyKey: String): Result<String> = runCatchingCancellable {
        if (!permissions.can(PAYMENT_RECORD)) error("Тўловни қайд этишга рухсат йўқ")
        val dto = api.recordPayment(
            PaymentRecordRequest(
                orderId = input.orderId,
                amount = input.amount.amount,
                method = input.method.name,
                source = input.source.name,
                handOverNow = input.handOverNow,
                collectedByDriverId = input.collectedByDriverId,
                notes = input.notes,
                receiptUrls = emptyList(),
                paidOn = input.paidOn,
            ),
            idempotencyKey = idempotencyKey,
        )
        orders.refreshDetail(dto.orderId)
        dto.id
    }

    suspend fun confirm(
        id: String, amount: Money?, adjustmentNote: String?, action: String?, note: String?,
    ): Result<Unit> = runCatchingCancellable {
        if (!permissions.can(PAYMENT_CONFIRM)) error("Тўловни тасдиқлашга рухсат йўқ")
        mutate { api.confirmPayment(id, PaymentConfirmRequest(amount?.amount, adjustmentNote, action, note)) }
    }

    suspend fun reject(id: String, reason: String): Result<Unit> = runCatchingCancellable {
        if (!permissions.can(PAYMENT_CONFIRM)) error("Тўловни рад этишга рухсат йўқ")
        mutate { api.rejectPayment(id, PaymentRejectRequest(reason)) }
    }

    // There is deliberately no `handover`: the app has no office hand-over surface, and a method
    // no screen calls is dead code. The route is still there for the web. Likewise no `forOrder`
    // — the order cockpit reads its payments off the order detail it already holds.

    suspend fun queue(status: PaymentStatus?): Result<List<PaymentQueueItem>> =
        runCatchingCancellable { api.payments(orderId = null, status = status?.name).map { it.toDomain(mediaBase) } }

    // ── Queued: the server route is withIdempotency-wrapped ───────

    /**
     * The only receipt-attach path: `POST /api/payments/{id}/receipts` is `withIdempotency`
     * wrapped, so a queued upload replays safely. There is deliberately no "loose" upload that
     * skips a paymentId — a queued call returns an outbox row id, never a URL, so it could never
     * feed `record`'s `receiptUrls`.
     */
    suspend fun attachReceipt(paymentId: String, orderId: String, photo: PreparedImage): Result<String> =
        runCatchingCancellable {
            if (!permissions.can(PAYMENT_RECORD)) error("Тўлов чекини бириктиришга рухсат йўқ")
            outbox.enqueue(OutboxKind.ADD_PAYMENT_RECEIPT, orderId, paymentId = paymentId, photo = photo)
        }

    /** Runs a write, then pulls the order the payment belongs to fresh so the cockpit reflects
     *  it. Unlike LogisticsRepository's `mutate`, the orderId is not known up front here — it
     *  comes back on the response row. */
    private suspend fun mutate(call: suspend () -> PaymentRowDto) {
        val dto = call()
        orders.refreshDetail(dto.orderId)
    }
}
