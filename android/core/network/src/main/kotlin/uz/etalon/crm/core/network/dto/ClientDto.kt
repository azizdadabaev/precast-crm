package uz.etalon.crm.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * `_count.orders` — present on every row `GET /api/clients` returns (the route always
 * `include`s it), but ABSENT on `POST /api/clients`'s response: both its create and its
 * dedup-by-phone branch return the raw Prisma row with no `include`. Defaulted to 0 so that
 * response decodes rather than throwing; a freshly created client has no orders yet regardless.
 */
@Serializable data class ClientCountsDto(val orders: Int = 0)

/** One row of `GET /api/clients`, and the response of `POST`/`PATCH /api/clients`. `address`
 *  is nullable on the `Client` model but the key itself is always present — Prisma serializes
 *  every scalar column unless a route narrows it with `select`, which none of these do. */
@Serializable
data class ClientRowDto(
    val id: String,
    val name: String,
    val phone: String,
    val address: String? = null,
    @SerialName("_count") val counts: ClientCountsDto = ClientCountsDto(),
)

/** One entry of `GET /api/clients/{id}`'s `orders` (the route takes the 20 most recent, full
 *  Order scalars, no `select`) — only the fields the client's order list renders. */
@Serializable
data class ClientOrderLineDto(
    val id: String,
    val orderNumber: String,
    val status: String,
    val totalPrice: String,
    val scheduledAt: String,
)

/** `GET /api/clients/{id}`. */
@Serializable
data class ClientDetailDto(
    val id: String,
    val name: String,
    val phone: String,
    val address: String? = null,
    val notes: String? = null,
    val orders: List<ClientOrderLineDto> = emptyList(),
)

/** Body of `POST /api/clients` (`ClientCreateSchema`) and `PATCH /api/clients/{id}`
 *  (`ClientUpdateSchema` — the same shape, `.partial()`). `language`/`source` are omitted:
 *  this slice never sets them, and the server defaults `language` to `UZ` on create. */
@Serializable
data class ClientWriteRequest(
    val name: String,
    val phone: String,
    val address: String? = null,
    val notes: String? = null,
)
