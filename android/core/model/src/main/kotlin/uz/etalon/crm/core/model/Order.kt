package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.Instant

data class ClientRef(val id: String, val name: String, val phone: String, val address: String?)

/** One row of GET /api/orders. */
data class OrderSummary(
    val id: String,
    val orderNumber: String,
    val status: OrderStatus,
    val paymentState: PaymentState,
    val totalPrice: Money,
    val confirmedPaid: Money,
    val totalArea: BigDecimal,
    val totalBlocks: Int,
    val totalBeams: Int,
    val scheduledAt: Instant,
    val placedAt: Instant,
    val client: ClientRef,
) { val remaining: Money get() = (totalPrice - confirmedPaid).coerceAtLeastZero() }

data class RoomLine(
    val name: String?, val innerWidth: BigDecimal, val innerLength: BigDecimal, val pattern: String,
    val beamLength: BigDecimal, val beamCount: Int, val totalBlocks: Int, val billedArea: BigDecimal, val subtotal: Money,
)
data class PaymentLine(
    val id: String, val amount: Money, val method: PaymentMethod, val status: PaymentStatus,
    val recordedAt: Instant, val recordedByName: String?, val receiptUrls: List<String>,
)
data class ShipmentLine(
    val id: String, val number: Int, val status: ShipmentStatus, val loadedBlocks: Int?,
    val loadedPhotoUrl: String?, val driverName: String?, val truckIdentifier: String?,
)
data class OrderEventLine(val id: String, val type: String, val message: String?, val actorName: String?, val createdAt: Instant)

/** GET /api/orders/{id} — the parts Phase 1a renders. */
data class OrderDetail(
    val summary: OrderSummary,
    val notes: String?,
    val deliveryLat: Double?, val deliveryLng: Double?, val deliveryLocationUrl: String?, val deliveryLocationLabel: String?,
    val discountAmount: Money, val deliveryCost: Money, val otherCost: Money, val roomsSubtotal: Money,
    val writeOffAmount: Money,
    val rooms: List<RoomLine>,
    val payments: List<PaymentLine>,
    val shipments: List<ShipmentLine>,
    val loadedPhotoUrls: List<String>,
    val deliveryProofUrl: String?,
    val events: List<OrderEventLine>,
    val fetchedAt: Instant,
) {
    val pendingAmount: Money get() = payments.filter { it.status == PaymentStatus.PENDING_CONFIRMATION }.fold(Money.ZERO) { a, p -> a + p.amount }
    val remaining: Money get() = (summary.totalPrice - summary.confirmedPaid - writeOffAmount).coerceAtLeastZero()
}
