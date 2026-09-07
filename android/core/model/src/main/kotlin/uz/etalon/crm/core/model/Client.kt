package uz.etalon.crm.core.model

import java.time.Instant

/** One row of GET /api/clients. `phone` is the unique customer identity — never `name`,
 *  which may legitimately repeat across two different clients. */
data class ClientSummary(
    val id: String,
    val name: String,
    val phone: String,
    val address: String?,
    val orderCount: Int,
)

/** One order line on GET /api/clients/{id} — the parts the client's order list renders. */
data class ClientOrderLine(
    val id: String,
    val orderNumber: String,
    val status: OrderStatus,
    val totalPrice: Money,
    val scheduledAt: Instant,
)

/** GET /api/clients/{id}. */
data class ClientDetail(
    val id: String,
    val name: String,
    val phone: String,
    val address: String?,
    val notes: String?,
    val orders: List<ClientOrderLine>,
)

/** What the create/edit sheet collects. Mirrors ClientCreateSchema/ClientUpdateSchema, minus
 *  `language`/`source` — this slice does not render either. */
data class ClientInput(
    val name: String,
    val phone: String,
    val address: String?,
    val notes: String?,
)
