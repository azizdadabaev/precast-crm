package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.Instant

/** One row of GET /api/clients. `phone` is the unique customer identity — never `name`,
 *  which may legitimately repeat across two different clients. */
data class ClientSummary(
    val id: String,
    val name: String,
    val phone: String,
    val address: String?,
    val orderCount: Int,
    /** Whole-UZS sum of this client's live (non-cancelled/non-draft) order totals — zero when
     *  the response carried none, which the create/update rows never do. */
    val totalBooked: Money,
)

/**
 * One bounded page of GET /api/clients. [total] is how many clients MATCH the query server-side;
 * the app fetches only the first page, so [total] greater than `items.size` means the list on
 * screen is not all of them and the operator has to be told so.
 */
data class ClientPage(val items: List<ClientSummary>, val total: Int)

/** One order line on GET /api/clients/{id} — the parts the client's order list renders. */
data class ClientOrderLine(
    val id: String,
    val orderNumber: String,
    val status: OrderStatus,
    val totalPrice: Money,
    val scheduledAt: Instant,
    /** Σ monolith area, the same figure [OrderSummary.totalArea] carries in the orders list — so a
     *  row under a client reads «дата · 81,99 м²» exactly as the orders tab's rows do. */
    val totalArea: BigDecimal,
)

/**
 * GET /api/clients/{id}.
 *
 * **[orders] is CAPPED** at the 20 most recent by the route, so neither its size nor a fold over
 * it is this client's figure — [orderCount] and [totalBooked] are, because the server computes
 * them over every order the client has. The two aggregates are nullable only because a server
 * older than them sends neither; a screen that has to fall back onto [orders] is showing a
 * truncated figure and should not pretend otherwise.
 */
data class ClientDetail(
    val id: String,
    val name: String,
    val phone: String,
    val address: String?,
    val notes: String?,
    val orders: List<ClientOrderLine>,
    /** Whole-UZS sum of the client's live (non-cancelled/non-draft) order totals, over ALL their
     *  orders — the same figure [ClientSummary.totalBooked] carries in the list. */
    val totalBooked: Money? = null,
    /** How many orders this client has in total, uncapped. */
    val orderCount: Int? = null,
)

/**
 * What `POST /api/clients` actually did.
 *
 * The route dedups on the normalised phone: it looks the number up first and, when it finds a
 * row, answers 200 with THAT client — discarding the name, address and notes just submitted. So a
 * success is not proof anything was created, and one mistyped digit lands an operator on someone
 * else's customer.
 *
 * [alreadyExisted] is decided by comparing the row that came back against what was sent. Every
 * field the sheet submits is stored verbatim on a real create, so any difference means the row
 * belongs to a different customer; and when nothing differs, nothing the operator typed was
 * discarded — phone is the unique customer identity, so a row already holding that number is the
 * same customer by definition.
 */
data class ClientCreated(
    val id: String,
    /** The name the client is filed under server-side — which, on a dedup hit, is not the name
     *  that was typed. The message the operator sees names it. */
    val name: String,
    val alreadyExisted: Boolean,
)

/** What the create/edit sheet collects. Mirrors ClientCreateSchema/ClientUpdateSchema, minus
 *  `language`/`source` — this slice does not render either. */
data class ClientInput(
    val name: String,
    val phone: String,
    val address: String?,
    val notes: String?,
)
