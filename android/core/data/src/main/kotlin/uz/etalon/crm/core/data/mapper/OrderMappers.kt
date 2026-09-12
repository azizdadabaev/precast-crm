package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.MediaUrl
import uz.etalon.crm.core.network.dto.OrderDetailDto
import uz.etalon.crm.core.network.dto.OrderFacetsDto
import uz.etalon.crm.core.network.dto.OrderSummaryDto
import java.math.BigDecimal
import java.time.Instant

private fun String.toInstant(): Instant = Instant.parse(this)

fun OrderFacetsDto.toDomain() = OrderFacets(
    byStatus = byStatus.mapNotNull { (k, v) -> OrderStatus.entries.firstOrNull { it.name == k }?.let { it to v } }.toMap(),
    debt = byPayment.debt, paid = byPayment.paid, total = total, totalArea = totalArea,
)

fun OrderSummaryDto.toDomain() = OrderSummary(
    id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
    totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid), writeOffAmount = Money.parse(writeOffAmount),
    totalArea = BigDecimal(totalArea),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toInstant(), placedAt = placedAt.toInstant(),
    client = ClientRef(client.id, client.name, client.phone, client.address),
)

fun OrderSummary.toEntity(listKey: String, position: Int, cachedAt: Long) = OrderSummaryEntity(
    id = id, orderNumber = orderNumber, status = status.name, paymentState = paymentState.name,
    totalPrice = totalPrice.amount.toPlainString(), confirmedPaid = confirmedPaid.amount.toPlainString(), totalArea = totalArea.toPlainString(),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toEpochMilli(), placedAt = placedAt.toEpochMilli(),
    clientId = client.id, clientName = client.name, clientPhone = client.phone, clientAddress = client.address,
    listKey = listKey, position = position, cachedAt = cachedAt,
)

fun OrderSummaryEntity.toDomain() = OrderSummary(
    id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
    totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid),
    // The offline list cache doesn't carry a write-off column (order_summaries is a cheap,
    // re-fetchable cache — see Migrations.kt) — a cached row reads as 0 until the next refresh
    // repopulates it from OrderSummaryDto, same as before this field existed.
    writeOffAmount = Money.ZERO,
    totalArea = BigDecimal(totalArea),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = Instant.ofEpochMilli(scheduledAt), placedAt = Instant.ofEpochMilli(placedAt),
    client = ClientRef(clientId, clientName, clientPhone, clientAddress),
)

fun OrderDetailDto.toDomain(mediaBase: String, fetchedAt: Instant): OrderDetail {
    // Parsed once and shared with the nested summary below so OrderDetail.remaining and
    // OrderDetail.summary.remaining can never disagree about how much was written off.
    val writeOff = Money.parse(writeOffAmount)
    val summary = OrderSummary(
        id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
        totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid), writeOffAmount = writeOff,
        totalArea = BigDecimal(totalArea),
        totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toInstant(), placedAt = placedAt.toInstant(),
        client = ClientRef(client.id, client.name, client.phone, client.address),
    )
    return OrderDetail(
        summary = summary, notes = notes,
        deliveryLat = deliveryLat, deliveryLng = deliveryLng, deliveryLocationUrl = deliveryLocationUrl, deliveryLocationLabel = deliveryLocationLabel,
        discountAmount = Money.parse(discountAmount), deliveryCost = Money.parse(deliveryCost), otherCost = Money.parse(otherCost),
        roomsSubtotal = Money.parse(roomsSubtotal), writeOffAmount = writeOff,
        rooms = project.calculations.map { RoomLine(it.name, BigDecimal(it.innerWidth), BigDecimal(it.innerLength), it.pattern, BigDecimal(it.beamLength), it.beamCount, it.totalBlocks, BigDecimal(it.billedArea), Money.parse(it.subtotal)) },
        payments = payments.map { PaymentLine(it.id, Money.parse(it.amount), PaymentMethod.from(it.method), PaymentStatus.from(it.status), it.recordedAt.toInstant(), it.recordedBy?.name, it.receipts.mapNotNull { r -> MediaUrl.absolute(mediaBase, r.imageUrl) }) },
        shipments = shipments.map {
            ShipmentLine(
                id = it.id, number = it.number, status = ShipmentStatus.from(it.status),
                loadedBeams = it.loadedBeams.orEmpty(),
                loadedBlocks = it.loadedBlocks,
                loadedPhotoUrl = MediaUrl.absolute(mediaBase, it.loadedPhotoUrl),
                loadedAt = it.loadedAt?.toInstant(),
                dispatchedAt = it.dispatchedAt?.toInstant(),
                deliveredAt = it.deliveredAt?.toInstant(),
                driverWillCollectCash = it.driverWillCollectCash,
                cashToCollect = it.cashToCollect?.let(Money::parse),
                driverName = it.driver?.name, truckIdentifier = it.truckIdentifier,
            )
        },
        loadedPhotos = galleryPhotos.mapNotNull { p ->
            MediaUrl.absolute(mediaBase, p.url)?.let { LoadedPhoto(p.id, it) }
        },
        deliveryProofUrl = MediaUrl.absolute(mediaBase, deliveryProofUrl),
        events = events.map { OrderEventLine(it.id, it.type, it.message, it.actor?.name, it.createdAt.toInstant()) },
        dispatch = dispatch?.let { d ->
            DispatchInfo(
                id = d.id, driverName = d.driver?.name, truckIdentifier = d.truckIdentifier,
                expectedCollection = Money.parse(d.expectedCollection),
                dispatchedAt = d.dispatchedAt?.toInstant(), returnedAt = d.returnedAt?.toInstant(),
            )
        },
        fetchedAt = fetchedAt,
        cancelReason = cancelReason,
        canceledAt = canceledAt?.toInstant(),
        discountPercent = BigDecimal(discountPercent),
        loadedAt = loadedAt?.toInstant(),
        deliveredAt = deliveredAt?.toInstant(),
    )
}
