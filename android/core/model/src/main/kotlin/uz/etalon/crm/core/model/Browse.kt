package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.Instant

/**
 * One «Лойиҳалар» row: a calculation saved but not yet placed as an order.
 *
 * [orderNumber] is what turns the row from a draft into a record of one — the web prints it in
 * place of the «Лойиҳа» pill once the project has been ordered. A project can carry a client
 * record or only the name and number it was quoted for, which is why both are here and why
 * [displayName] chooses between them the way the web's own column does.
 */
data class DraftLine(
    val id: String,
    val name: String?,
    val draftNumber: Int?,
    val status: String,
    val aiGenerated: Boolean,
    val updatedAt: Instant,
    val clientName: String?,
    val clientPhone: String?,
    val clientAddress: String?,
    val rooms: Int,
    val area: BigDecimal,
    val subtotal: Money,
    val orderNumber: String?,
    /** The order this project became, when it became one — what a tap opens. */
    val orderId: String?,
)

data class DraftsPage(
    val rows: List<DraftLine>,
    val total: Int,
    val page: Int,
    val pageCount: Int,
    val draftCount: Int,
    val orderedCount: Int,
)

/** One gallery card: every photo of one kind on one order, newest group first. */
data class GalleryPost(
    val key: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val clientPhone: String?,
    val clientAddress: String?,
    val kind: GalleryKind,
    val uploadedAt: Instant,
    val imageUrls: List<String>,
)

enum class GalleryKind { LOADED, DELIVERY_PROOF, SHIPMENT_LOADED, UNKNOWN }

data class GalleryPage(
    val posts: List<GalleryPost>,
    val photoTotal: Int,
    val page: Int,
    val pageCount: Int,
)

/** One «Хабарлар» row. */
data class Conversation(
    val id: String,
    val channel: String,
    val displayName: String,
    val username: String?,
    val lastMessageAt: Instant,
    val lastSnippet: String,
    val unread: Boolean,
)
