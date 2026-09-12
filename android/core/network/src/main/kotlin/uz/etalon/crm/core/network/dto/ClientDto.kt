package uz.etalon.crm.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

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
    /** Present on every one of these responses for the same reason `address` is — no route
     *  narrows the Prisma row with a `select`. Read only by the create path, which compares the
     *  row it got back against what it sent to tell a real create from a dedup hit. */
    val notes: String? = null,
    @SerialName("_count") val counts: ClientCountsDto = ClientCountsDto(),
    /**
     * Whole-UZS sum of the client's live (non-CANCELED/non-DRAFT) order totals — `attachTotals`
     * in `src/lib/client-totals.ts`, riding along on every row of the paginated `GET /api/clients`
     * regardless of sort. A bare JSON number, never a string — `BigDecimalSerializer` reads its
     * raw literal text, so a genuine number decodes exactly. Defaulted to zero so a response from
     * an older server (or `POST`/`PATCH`, which sends the raw Prisma row with no such field at
     * all) still decodes rather than throwing.
     */
    @Serializable(with = BigDecimalSerializer::class) val totalBooked: BigDecimal = BigDecimal.ZERO,
)

/**
 * `GET /api/clients?page=…` — the envelope `src/lib/table-query.ts` builds. `sources` (the values
 * behind the web table's Манба filter) is not modelled: this client has no source filter, and
 * `ignoreUnknownKeys` lets it pass unread.
 *
 * `total` is the number of clients MATCHING the query server-side, which is larger than `rows`
 * whenever there are more than one page of them — that difference is what the list tells the
 * operator instead of silently showing a truncated table.
 */
@Serializable
data class ClientsPageDto(
    val rows: List<ClientRowDto>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
    val pageCount: Int,
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
