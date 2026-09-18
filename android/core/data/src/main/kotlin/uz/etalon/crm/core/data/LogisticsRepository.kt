package uz.etalon.crm.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import uz.etalon.crm.core.data.mapper.normaliseBeamKeys
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.LatLng
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.CancelOrderRequest
import uz.etalon.crm.core.network.dto.DeliveryLocationRequest
import uz.etalon.crm.core.network.dto.DispatchCreateRequest
import uz.etalon.crm.core.network.dto.ResolveLinkRequest
import uz.etalon.crm.core.network.dto.ShipmentDispatchRequest
import uz.etalon.crm.core.network.dto.toJsonBody
import javax.inject.Inject
import javax.inject.Singleton

/** Small seam so the repository's tests do not construct OrdersRepository. */
interface OrdersGateway { suspend fun refreshDetail(id: String) }

/** The permission every shipment and dispatch route is wrapped in server-side. Distinct from
 *  `order.edit`: `ROLE_TEMPLATES.SALES` grants the latter and not this one. */
private const val DISPATCH_CREATE = "dispatch.create"

@Singleton
class LogisticsRepository @Inject constructor(
    private val api: EtalonApi,
    private val outbox: OutboxGateway,
    private val orders: OrdersGateway,
    private val permissions: PermissionGate,
) {
    // ── Queued: the server route is withIdempotency-wrapped ──────

    suspend fun loadTruck(orderId: String, photo: PreparedImage?): Result<String> =
        runCatchingCancellable { outbox.enqueue(OutboxKind.LOAD_TRUCK, orderId, photo = photo) }

    suspend fun addLoadedPhoto(orderId: String, photo: PreparedImage?): Result<String> =
        runCatchingCancellable { outbox.enqueue(OutboxKind.ADD_LOADED_PHOTO, orderId, photo = photo) }

    suspend fun deliveryProof(orderId: String, photo: PreparedImage?, cash: DeliveryCash): Result<String> =
        runCatchingCancellable {
            outbox.enqueue(
                OutboxKind.DELIVERY_PROOF, orderId, photo = photo,
                payload = JsonObject(mapOf(
                    "cashAmount" to JsonPrimitive(cash.amount.amount.toPlainString()),
                    "noCashCollected" to JsonPrimitive(cash.noCashCollected.toString()),
                    "noCashCollectedNote" to JsonPrimitive(cash.note),
                    "driverReturned" to JsonPrimitive(cash.driverReturned.toString()),
                )),
            )
        }

    /**
     * The one queued route that is NOT `order.edit`: `POST /orders/{id}/shipments/{sid}/load` is
     * wrapped in `withPermission("dispatch.create")`. Refused here rather than queued, because a
     * queued 403 is not a recoverable error — `outcomeFor` makes it a permanent Fail, and that row
     * then blocks the order's action bar and disables both Load and Delete on the truck, leaving
     * deleting the photo as the only way out. The other three queued kinds need only `order.edit`,
     * which the screens that reach them already gate on.
     */
    suspend fun loadShipment(
        orderId: String, shipmentId: String, photo: PreparedImage?,
        beams: Map<String, Int>, blocks: Int,
    ): Result<String> = runCatchingCancellable {
        if (!permissions.can(DISPATCH_CREATE)) error("Жўнатмаларни бошқаришга рухсат йўқ")
        val normalised = normaliseBeamKeys(beams.filterValues { it > 0 })
        outbox.enqueue(
            OutboxKind.LOAD_SHIPMENT, orderId, shipmentId = shipmentId, photo = photo,
            payload = JsonObject(mapOf(
                "loadedBeams" to JsonObject(normalised.mapValues { JsonPrimitive(it.value) }),
                "loadedBlocks" to JsonPrimitive(blocks),
            )),
        )
    }

    // ── Online only: no server-side idempotency, so never queued ──

    suspend fun createShipment(orderId: String): Result<Unit> = mutate(orderId) { api.createShipment(orderId) }
    suspend fun deleteShipment(orderId: String, shipmentId: String): Result<Unit> = mutate(orderId) { api.deleteShipment(orderId, shipmentId) }
    suspend fun deliverShipment(orderId: String, shipmentId: String): Result<Unit> = mutate(orderId) { api.deliverShipment(orderId, shipmentId) }
    suspend fun deleteLoadedPhoto(orderId: String, photoId: String): Result<Unit> = mutate(orderId) { api.deleteLoadedPhoto(orderId, photoId) }

    /**
     * «Буюртмани бекор қилиш». Re-fetches on success like its neighbours here: cancelling rewrites
     * the status, the timeline and the project behind it, and the screen must not keep showing an
     * order that no longer exists in that form.
     */
    suspend fun cancelOrder(orderId: String, reason: String?, password: String?): Result<Unit> =
        mutate(orderId) { api.cancelOrder(orderId, CancelOrderRequest(reason = reason, password = password)) }

    /** «Чатга юбориш». The server renders the card and posts it; nothing about the order itself
     *  changes, so unlike its neighbours here this one does not re-fetch the detail. */
    suspend fun sendOrderToChat(orderId: String): Result<Unit> =
        runCatchingCancellable { api.sendOrderToChat(orderId) }

    suspend fun dispatchShipment(
        orderId: String, shipmentId: String, driverId: String?, truckIdentifier: String?,
        driverWillCollectCash: Boolean, cashToCollect: Money?,
    ): Result<Unit> = mutate(orderId) {
        api.dispatchShipment(orderId, shipmentId, ShipmentDispatchRequest(
            driverId = driverId, truckIdentifier = truckIdentifier,
            driverWillCollectCash = driverWillCollectCash,
            cashToCollect = cashToCollect?.amount,
        ))
    }

    suspend fun createDispatch(
        orderId: String, driverId: String?, truckIdentifier: String?, expectedCollection: Money, notes: String?,
    ): Result<Unit> = mutate(orderId) {
        api.createDispatch(orderId, DispatchCreateRequest(
            driverId = driverId, truckIdentifier = truckIdentifier,
            expectedCollection = expectedCollection.amount, notes = notes,
        ))
    }

    suspend fun setDeliveryLocation(
        orderId: String, lat: Double?, lng: Double?, url: String?, label: String?,
    ): Result<Unit> = mutate(orderId) { api.setDeliveryLocation(orderId, DeliveryLocationRequest(lat, lng, url, label).toJsonBody()) }

    suspend fun resolveMapLink(url: String): Result<LatLng> =
        runCatchingCancellable { api.resolveMapLink(ResolveLinkRequest(url)).toDomain() }

    /** Runs a write, then pulls the order fresh so the cockpit reflects it. Not `inline`: `call`'s
     *  declared type is `suspend () -> Unit`, and Kotlin's unit-coercion for lambda literals lets
     *  every call site above pass a body that returns a DTO unchanged — the value is just discarded. */
    private suspend fun mutate(orderId: String, call: suspend () -> Unit): Result<Unit> =
        runCatchingCancellable { call(); orders.refreshDetail(orderId) }
}
