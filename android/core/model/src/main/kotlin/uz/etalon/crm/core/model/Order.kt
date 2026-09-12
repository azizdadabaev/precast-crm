package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.math.RoundingMode
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

/**
 * Whether an order in this status still owes its balance. A CANCELED one does not.
 *
 * A canceled order is a sale that never happened: the CRM's own `LIVE_ORDERS` rule
 * (`precast-crm/src/lib/dashboard-data.ts`) keeps it out of every receivable, and the server's
 * payment facets exclude it for the same reason. So nothing that draws a balance may draw one for
 * it — the Orders rows and Home's two row lists pass `debt = null` and `paidLabel = null`, and the
 * order detail's «Қолди» reads «—» with no progress bar and no cost breakdown.
 *
 * Money already recorded against a canceled order stays visible as history (the payments card):
 * that cash really was taken. What would be wrong is calling it *owed*.
 *
 * This is the one place the rule is decided; every screen that draws a balance reads it here.
 */
val OrderStatus.owesNothing: Boolean get() = this == OrderStatus.CANCELED

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
    // Kept last (with defaults) so the many existing positional/partly-named-argument fixtures
    // that don't care about these don't all need updating for their sake.
    val cancelReason: String? = null,
    val canceledAt: Instant? = null,
    val discountPercent: BigDecimal = BigDecimal.ZERO,
    /** The order's OWN load and delivery stamps (`Order.loadedAt` / `Order.deliveredAt`), as
     *  against a single truck's on [ShipmentLine]. Null until the flow that stamps them runs —
     *  a split order loads truck by truck and may never carry an order-level `loadedAt` — so the
     *  «Етказиш» timeline treats them as the FIRST place to look, not the only one. */
    val loadedAt: Instant? = null,
    val deliveredAt: Instant? = null,
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

/** One row of the order's load list — a beam length shared by one or more rooms, with the
 *  rooms' beam counts summed. Mirrors the web's `beamGroups` (orders/[id]/page.tsx).
 *
 *  The length is the two-decimal STRING and nothing else: it is what the label reads and what the
 *  load map is posted under, and a `BigDecimal` beside it would be a second spelling of the same
 *  number for anything to disagree with. See [beamLengthKey]. */
data class LoadLine(val lengthKey: String, val beams: Int)

/**
 * The order's beams grouped by length, in first-appearance order — matches the web's
 * `beamGroups`: `Map` keyed by `Number(c.beamLength).toFixed(2)`, summing `c.beamCount`.
 *
 * The key is [beamLengthKey] — the one spelling this client has, shared with the load stepper's
 * rows and with the map posted at `POST /api/shipments/{id}/load`, whose over-load guard compares
 * against totals it built the same way. See that function for why the rounding is binary.
 */
val OrderDetail.loadList: List<LoadLine>
    get() {
        val counts = LinkedHashMap<String, Int>()
        for (room in rooms) {
            val key = beamLengthKey(room.beamLength)
            counts[key] = (counts[key] ?: 0) + room.beamCount
        }
        return counts.map { (key, beams) -> LoadLine(key, beams) }
    }

/** Σ every room's block count. */
val OrderDetail.totalBlocks: Int get() = rooms.sumOf { it.totalBlocks }

/** The factory's rule-of-thumb weight for finished beam-and-block flooring, per m² of **monolith**
 *  area — the slab actually poured, NOT the area the order is billed on (billing counts whole tiles
 *  at N × PITCH, which overstates what a lorry carries; [weightKg] argues it out in full, and the
 *  calculator's `KG_PER_M2` multiplies the same monolith figure). Shared with that constant
 *  (feature/calculator/CalculatorUiState.kt), which is the single source of truth; this is the same
 *  constant for order-detail use. */
val ORDER_KG_PER_M2: BigDecimal = BigDecimal(180)

/**
 * [OrderSummary.totalArea] × [ORDER_KG_PER_M2] — matches the web's
 * `Number(order.totalArea) * 180` rounded to 0 decimals.
 *
 * `totalArea` is Σ **monolith** area (`computeOrderTotals` in `src/lib/order-totals.ts`:
 * `Σ result.monolith_area`) — the physical slab the lorry has to carry. It is deliberately not
 * Σ [RoomLine.billedArea]: billing counts whole tiles at N × PITCH and a room is billed for more
 * than it is poured, so the billed figure would overstate the load. Nor is it re-derived from the
 * rows at all — the server denormalises it onto the order at placement, and computing it here
 * would quietly disagree with the figure every other screen shows.
 */
val OrderDetail.weightKg: BigDecimal get() = (summary.totalArea * ORDER_KG_PER_M2).setScale(0, RoundingMode.HALF_UP)
