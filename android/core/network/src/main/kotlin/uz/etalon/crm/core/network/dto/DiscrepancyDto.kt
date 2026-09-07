package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

// ── Discrepancies ───────────────────────────────────────────────
/** Body of PATCH /api/discrepancies/{id} (DiscrepancyUpdateSchema). */
@Serializable data class DiscrepancyUpdateRequest(val status: String, val resolutionNote: String)

/**
 * Response of GET /api/discrepancies (list, `include`-based) and PATCH /api/discrepancies/{id}
 * (mutation — returns the bare `Discrepancy` row from `tx.discrepancy.update`, with no
 * `include`). Money (expectedAmount/receivedAmount/shortfall) stays a String — same reasoning as
 * PaymentRowDto.
 *
 * `driver`, `reportedBy`, `resolvedBy` and `order` need their `null` default chiefly because of
 * the PATCH mutation response: without an `include`, Prisma's returned row has no such property
 * at all, and JSON.stringify drops an absent (`undefined`) key entirely — so on that response
 * these keys are MISSING, not present-as-null. See PaymentRowDto's doc for the same reasoning.
 */
@Serializable
data class DiscrepancyDto(
    val id: String,
    val orderId: String,
    val paymentId: String? = null,
    val driverId: String? = null,
    val expectedAmount: String,
    val receivedAmount: String,
    val shortfall: String,
    val status: String,
    val reportedAt: String,
    val resolvedAt: String? = null,
    val resolutionNote: String? = null,
    val driver: NameDto? = null,
    val reportedBy: NameDto? = null,
    val resolvedBy: NameDto? = null,
    val order: DiscrepancyOrderRefDto? = null,
)

@Serializable data class DiscrepancyClientRefDto(val id: String, val name: String, val phone: String)

@Serializable
data class DiscrepancyOrderRefDto(
    val orderNumber: String,
    val totalPrice: String,
    val confirmedPaid: String,
    val paymentState: String,
    val client: DiscrepancyClientRefDto,
)
