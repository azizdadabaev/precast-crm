package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.CustodyChain
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.network.MediaUrl
import uz.etalon.crm.core.network.dto.DiscrepancyDto
import uz.etalon.crm.core.network.dto.PaymentRowDto
import java.time.Instant

/**
 * `order` is populated on the GET /api/payments list route but MISSING on the four mutation
 * responses (record/confirm/reject/handover return the bare Payment row with no `include`) — see
 * PaymentRowDto's doc. `queue`/`forOrder` only ever call this on the list route, so the fallback
 * below is defensive, not exercised in practice.
 */
fun PaymentRowDto.toDomain(mediaBase: String) = PaymentQueueItem(
    id = id,
    orderId = orderId,
    orderNumber = order?.orderNumber ?: orderId,
    clientName = order?.client?.name ?: "",
    amount = Money.parse(amount),
    originalAmount = originalAmount?.let(Money::parse),
    method = PaymentMethod.from(method),
    status = PaymentStatus.from(status),
    recordedAt = Instant.parse(recordedAt),
    paidOn = paidOn?.let(Instant::parse),
    expectedCollection = order?.dispatch?.expectedCollection?.let(Money::parse),
    fromDriver = collectedByDriver != null,
    custody = CustodyChain(
        collectedBy = collectedByDriver?.name,
        recordedBy = recordedBy?.name,
        handedOverTo = handedOverTo?.name,
        confirmedBy = confirmedBy?.name,
    ),
    receiptUrls = receipts.mapNotNull { MediaUrl.absolute(mediaBase, it.imageUrl) },
    rejectionReason = rejectionReason,
)

/** `order` is MISSING on the PATCH mutation response — same reasoning as PaymentRowDto's. */
fun DiscrepancyDto.toDomain() = Discrepancy(
    id = id,
    orderId = orderId,
    orderNumber = order?.orderNumber ?: orderId,
    clientName = order?.client?.name ?: "",
    driverName = driver?.name,
    expectedAmount = Money.parse(expectedAmount),
    receivedAmount = Money.parse(receivedAmount),
    status = DiscrepancyStatus.from(status),
    reportedAt = Instant.parse(reportedAt),
    resolutionNote = resolutionNote,
)
