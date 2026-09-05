package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ── Shipments ───────────────────────────────────────────────────
/** Body of POST /api/orders/{id}/shipments/{sid}/dispatch. The server reads this
 *  with a bare `await req.json()` — there is no Zod schema, so every field is
 *  optional and unknown keys are ignored. */
@Serializable
data class ShipmentDispatchRequest(
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: Double? = null,
    val notes: String? = null,
)

@Serializable data class DispatchedDto(val dispatched: Boolean)
@Serializable data class DeliveredDto(val delivered: Boolean)
@Serializable data class DeletedIdDto(val id: String)
@Serializable data class LoadedPhotoDto(val loadedPhotoUrl: String)

/** Response of POST /api/orders/{id}/delivery-proof: the route returns the raw
 *  Order row from `tx.order.update(...)` — it has every Order scalar but no
 *  `client` relation, so it cannot be decoded as OrderDetailDto (client has no
 *  default). id/status are the two fields callers actually need; the caller
 *  re-fetches the full order via GET /api/orders/{id} for the rest. */
@Serializable data class OrderStatusDto(val id: String, val status: String)

// ── Single-truck dispatch ───────────────────────────────────────
/** Body of POST /api/orders/{id}/dispatch (DispatchCreateSchema).
 *  `expectedCollection` is required and coerced to a number server-side. */
@Serializable
data class DispatchCreateRequest(
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val expectedCollection: Double,
    val notes: String? = null,
)

@Serializable
data class DispatchDto(
    val id: String,
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val expectedCollection: String = "0",
    val dispatchedAt: String? = null,
    val returnedAt: String? = null,
    val driver: DriverDto? = null,
)

// ── Delivery location ───────────────────────────────────────────
/** Body of PATCH /api/orders/{id}/delivery-location. `lat` and `lng` are
 *  required keys that may be null; a null in either clears all four columns. */
@Serializable
data class DeliveryLocationRequest(
    val lat: Double?,
    val lng: Double?,
    val url: String? = null,
    val label: String? = null,
)

/**
 * Builds the wire body for PATCH .../delivery-location directly as a
 * JsonElement tree instead of routing it through the shared Json (which sets
 * explicitNulls = false and would drop a null lat/lng). A JsonObject's null
 * entries are always written literally — "lat":null / "lng":null — regardless
 * of that flag, which is exactly what the server requires to clear the pin.
 */
fun DeliveryLocationRequest.toJsonBody(): JsonObject = buildJsonObject {
    put("lat", lat)
    put("lng", lng)
    put("url", url)
    put("label", label)
}

@Serializable
data class DeliveryLocationDto(
    val id: String,
    val deliveryLat: Double? = null,
    val deliveryLng: Double? = null,
    val deliveryLocationUrl: String? = null,
    val deliveryLocationLabel: String? = null,
)

@Serializable data class ResolveLinkRequest(val url: String)
@Serializable data class LatLngDto(val lat: Double, val lng: Double)

// ── Drivers ─────────────────────────────────────────────────────
@Serializable
data class DriverListItemDto(
    val id: String,
    val name: String,
    val phone: String,
    val notes: String? = null,
    val active: Boolean = true,
    val activeDispatchCount: Int = 0,
    val discrepancyCount30d: Int = 0,
    val lastDispatchAt: String? = null,
)

@Serializable data class DriverCreateRequest(val name: String, val phone: String, val notes: String? = null)
@Serializable data class DriverUpdateRequest(val name: String? = null, val phone: String? = null, val notes: String? = null)
@Serializable data class DriverActiveRequest(val active: Boolean)
