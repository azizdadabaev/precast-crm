package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

// ── Payments ────────────────────────────────────────────────────
/** Body of POST /api/payments (PaymentRecordSchema). Money travels as a bare
 *  BigDecimal — the server reads it with z.coerce.number(). */
@Serializable
data class PaymentRecordRequest(
    val orderId: String,
    @Serializable(with = BigDecimalSerializer::class) val amount: BigDecimal,
    val method: String,
    val source: String,
    val handOverNow: Boolean = false,
    val collectedByDriverId: String? = null,
    val notes: String? = null,
    val receiptUrls: List<String> = emptyList(),
    val paidOn: String? = null,
)

/** Body of POST /api/payments/{id}/confirm (PaymentConfirmSchema). Empty body is the
 *  happy path; amount/adjustmentNote and discrepancyAction/discrepancyNote are only
 *  required when the confirmer is adjusting the figure or resolving a shortfall. */
@Serializable
data class PaymentConfirmRequest(
    @Serializable(with = BigDecimalSerializer::class) val amount: BigDecimal? = null,
    val adjustmentNote: String? = null,
    val discrepancyAction: String? = null,
    val discrepancyNote: String? = null,
)

/** Body of POST /api/payments/{id}/reject (PaymentRejectSchema). */
@Serializable data class PaymentRejectRequest(val reason: String)

/** Response of POST /api/payments/upload-receipt. */
@Serializable data class ReceiptUrlDto(val url: String)

/**
 * Response of every payment endpoint: GET /api/payments (list, `include`-based) and the four
 * mutations — POST /api/payments, .../confirm, .../reject, .../handover — which return the bare
 * `Payment` row from `tx.payment.create`/`tx.payment.update` with NO `include` at all.
 * `amount`/`originalAmount` stay String here (server serializes Decimal as a JSON string);
 * converting to Money is the repository layer's job, not this module's.
 *
 * Every nested field below needs its `null` default chiefly because of the four *mutation*
 * responses: without an `include`, Prisma's returned row simply has no `collectedByDriver` /
 * `recordedBy` / `handedOverTo` / `confirmedBy` / `order` property at all, and JSON.stringify
 * drops an absent (`undefined`) key entirely — so these keys are MISSING on every mutation
 * response, not present-as-null. (On the `include`-based list route they usually are present,
 * and a genuinely empty to-one relation there is an explicit JSON `null`, not a missing key —
 * but the decoder needs to tolerate both a missing key and a JSON null either way.)
 */
@Serializable
data class PaymentRowDto(
    val id: String,
    val orderId: String,
    val amount: String,
    val originalAmount: String? = null,
    val method: String,
    val status: String,
    val recordedAt: String,
    val paidOn: String? = null,
    val rejectionReason: String? = null,
    val collectedByDriver: NameDto? = null,
    val recordedBy: NameDto? = null,
    val handedOverTo: NameDto? = null,
    val confirmedBy: NameDto? = null,
    val receipts: List<ReceiptDto> = emptyList(),
    val order: PaymentOrderRefDto? = null,
)

@Serializable data class PaymentOrderClientRefDto(val name: String)

@Serializable data class PaymentOrderDispatchRefDto(val expectedCollection: String)

@Serializable
data class PaymentOrderRefDto(
    val orderNumber: String,
    val client: PaymentOrderClientRefDto,
    val dispatch: PaymentOrderDispatchRefDto? = null,
)
