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
    /** Mirrors [OrderDetail.writeOffAmount] — see [remaining]. Kept last, with a default, so
     *  the many existing positional-argument fixtures that don't care about write-offs don't
     *  all need updating for this field's sake; the two real sources (OrderSummaryDto,
     *  OrderDetailDto) always pass it explicitly. */
    val writeOffAmount: Money = Money.ZERO,
) {
    /** total − confirmed − writeOff, clamped at 0 — matches the server's `remainingBalance`
     *  (src/lib/payment-state.ts) and [OrderDetail.remaining]. A leftover balance that was
     *  deliberately written off ("settle remaining") must not still read as owed here. */
    val remaining: Money get() = (totalPrice - confirmedPaid - writeOffAmount).coerceAtLeastZero()
}

enum class PaymentFilter { DEBT, PAID }

/** GET /api/orders' `facets` — status/payment counts and total area for the current `q`/`day`
 *  filter, independent of `status`/`payment`/`page` so the list's chips can show every option's
 *  count while one is selected. */
data class OrderFacets(val byStatus: Map<OrderStatus, Int>, val debt: Int, val paid: Int, val total: Int, val totalArea: BigDecimal)

data class RoomLine(
    val name: String?, val innerWidth: BigDecimal, val innerLength: BigDecimal, val pattern: String,
    val beamLength: BigDecimal, val beamCount: Int, val totalBlocks: Int, val billedArea: BigDecimal, val subtotal: Money,
)
data class PaymentLine(
    val id: String, val amount: Money, val method: PaymentMethod, val status: PaymentStatus,
    val recordedAt: Instant, val recordedByName: String?, val receiptUrls: List<String>,
)
data class ShipmentLine(
    val id: String,
    val number: Int,
    val status: ShipmentStatus,
    val loadedBeams: Map<String, Int> = emptyMap(),
    val loadedBlocks: Int?,
    val loadedPhotoUrl: String?,
    val loadedAt: Instant? = null,
    val dispatchedAt: Instant? = null,
    val deliveredAt: Instant? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: Money? = null,
    val driverName: String?,
    val truckIdentifier: String?,
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
    val loadedPhotos: List<LoadedPhoto>,
    val deliveryProofUrl: String?,
    val events: List<OrderEventLine>,
    val dispatch: DispatchInfo?,
    val fetchedAt: Instant,
) {
    val pendingAmount: Money get() = payments.filter { it.status == PaymentStatus.PENDING_CONFIRMATION }.fold(Money.ZERO) { a, p -> a + p.amount }
    val remaining: Money get() = (summary.totalPrice - summary.confirmedPaid - writeOffAmount).coerceAtLeastZero()
    /**
     * What the server will still accept on a new payment:
     * total − confirmed − writeOff − everything already awaiting confirmation.
     * [remaining] deliberately does not subtract the queue — it is what the customer
     * still owes — so using it as a form cap 422s whenever a payment is pending.
     * Mirrors the check in src/app/api/payments/route.ts.
     */
    val recordableRemaining: Money
        get() = (summary.totalPrice - summary.confirmedPaid - writeOffAmount - pendingAmount).coerceAtLeastZero()
    /** Kept for 1a's screens: a flat URL list derived from [loadedPhotos]. */
    val loadedPhotoUrls: List<String> get() = loadedPhotos.map { it.url }
}
