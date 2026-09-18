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

/** One message in a thread. */
data class ChatMessage(
    val id: String,
    val outbound: Boolean,
    val text: String?,
    val kind: MessageKind,
    /** Server-relative; the repository prefixes the base URL before the UI sees it. */
    val mediaUrl: String?,
    val mediaName: String?,
    val lat: Double?,
    val lng: Double?,
    val locationTitle: String?,
    /** Seconds, for voice and video. */
    val durationSec: Int?,
    /** The server could not fetch this media from Telegram, or it was too large to store. */
    val mediaMissing: Boolean,
    val failed: Boolean,
    val createdAt: Instant,
)

/**
 * What a bubble draws. `TEXT` is the absence of media, not a kind the server sends.
 *
 * `UNSUPPORTED` is deliberate rather than a crash: the server's enum can grow — it already carries
 * kinds this app draws no bubble for — and a message nobody can render must still occupy its place
 * in the thread, or the conversation silently loses a turn.
 */
enum class MessageKind { TEXT, IMAGE, VOICE, VIDEO, DOCUMENT, LOCATION, UNSUPPORTED }

data class Thread(
    val id: String,
    val displayName: String,
    val username: String?,
    val messages: List<ChatMessage>,
)

/** A quote linked to a chat — what «Лойиҳа юбориш» can send back into it. */
data class ChatProject(
    val id: String,
    val draftNumber: Int?,
    val orderId: String?,
    val orderNumber: String?,
)
