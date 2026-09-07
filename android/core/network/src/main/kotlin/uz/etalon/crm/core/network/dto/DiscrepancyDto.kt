package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

// ── Discrepancies ───────────────────────────────────────────────
/** Response of GET /api/discrepancies and PATCH /api/discrepancies/{id}. Money
 *  (expectedAmount/receivedAmount/shortfall) stays a String — same reasoning as PaymentDto.
 *  `driver` and `resolvedBy` mirror nullable relations (Discrepancy.driverId / resolvedById are
 *  optional) and are absent, not null, on rows that never had them — see PaymentDto's doc. */
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
    val order: DiscrepancyOrderRefDto,
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
