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
 * Response of GET /api/payments (and every payment mutation) — the confirmer's chain-of-custody
 * view. `amount`/`originalAmount` stay String here (server serializes Decimal as a JSON string);
 * converting to Money is the repository layer's job, not this module's.
 *
 * The route builds this with Prisma `include`, so `collectedByDriver`, `recordedBy`,
 * `handedOverTo` and `confirmedBy` are simply ABSENT on rows that never had them — not null —
 * which is exactly why each one needs a default here, not just nullability.
 */
@Serializable
data class PaymentDto(
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
    val order: PaymentOrderRefDto,
)

@Serializable data class PaymentOrderClientRefDto(val name: String)

/** Dispatch is absent (not null) on an order that was never dispatched — same reasoning as the
 *  four actor fields above. */
@Serializable data class PaymentOrderDispatchRefDto(val expectedCollection: String)

@Serializable
data class PaymentOrderRefDto(
    val orderNumber: String,
    val client: PaymentOrderClientRefDto,
    val dispatch: PaymentOrderDispatchRefDto? = null,
)

// ── Discrepancies ───────────────────────────────────────────────
/** Body of PATCH /api/discrepancies/{id} (DiscrepancyUpdateSchema). */
@Serializable data class DiscrepancyUpdateRequest(val status: String, val resolutionNote: String)
