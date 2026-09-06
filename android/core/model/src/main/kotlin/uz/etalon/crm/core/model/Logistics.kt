package uz.etalon.crm.core.model

import java.time.Instant

/** A photo attached to an order, with the id the delete endpoint needs. */
data class LoadedPhoto(val id: String, val url: String, val kind: String?)

/** The single-truck dispatch record, when one exists. */
data class DispatchInfo(
    val id: String,
    val driverName: String?,
    val truckIdentifier: String?,
    val expectedCollection: Money,
    val dispatchedAt: Instant?,
    val returnedAt: Instant?,
) { val isReturned: Boolean get() = returnedAt != null }

data class Driver(
    val id: String,
    val name: String,
    val phone: String,
    val notes: String?,
    val active: Boolean,
    val activeDispatchCount: Int,
    val discrepancyCount30d: Int,
    val lastDispatchAt: Instant?,
)

/** What the operator entered on the delivery-proof screen. */
data class DeliveryCash(
    val amount: Money = Money.ZERO,
    val noCashCollected: Boolean = false,
    val note: String = "",
    val driverReturned: Boolean = false,
)

data class LatLng(val lat: Double, val lng: Double)

/** The four operations the outbox may queue. Each maps to a server route that
 *  Phase 0 wrapped in withIdempotency; nothing else may be queued. */
enum class OutboxKind { LOAD_TRUCK, ADD_LOADED_PHOTO, DELIVERY_PROOF, LOAD_SHIPMENT }

/**
 * The order statuses `POST /api/orders/{id}/shipments` accepts (see that route: it answers 422 with
 * "Split shipments can only be created from PLACED, IN_PRODUCTION or DISPATCHED" for anything else —
 * DISPATCHED is in the list because a later truck may be added once the first one has left).
 *
 * Lives here, in the module both `:feature:orders` and `:feature:logistics` already depend on, so
 * the cockpit's "split this order" door and the shipment screen's own add button cannot drift apart.
 */
val SHIPMENT_CREATE_STATUSES: Set<OrderStatus> =
    setOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED)

data class PendingUpload(
    val id: String,
    val kind: OutboxKind,
    val orderId: String,
    val shipmentId: String?,
    val failed: Boolean,
    val attempts: Int,
    val error: String?,
)
