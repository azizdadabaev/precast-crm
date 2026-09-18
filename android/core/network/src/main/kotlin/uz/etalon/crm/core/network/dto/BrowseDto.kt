package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

// ── «Лойиҳалар» · GET /api/projects?page=… (order.view) ──────────────────────
// Asking for a page is what switches the route from a bare array to this envelope, so the app
// always sends one. Only the fields the list row reads are declared: the route returns whole
// Project rows, and every field named here is one the screen actually prints.

@Serializable
data class DraftsPageDto(
    val rows: List<DraftDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageCount: Int = 1,
    val statusCounts: DraftStatusCountsDto = DraftStatusCountsDto(),
)

@Serializable data class DraftStatusCountsDto(val DRAFT: Int = 0, val ORDERED: Int = 0)

@Serializable
data class DraftDto(
    val id: String,
    val name: String? = null,
    val draftNumber: Int? = null,
    val status: String = "DRAFT",
    val aiGenerated: Boolean = false,
    val updatedAt: String,
    val client: DraftClientDto? = null,
    // The client a draft was quoted for before anyone created a client record.
    val tentativeClientName: String? = null,
    val tentativeClientPhone: String? = null,
    val tentativeClientAddress: String? = null,
    val calculations: List<DraftCalcDto> = emptyList(),
    val orders: List<DraftOrderDto> = emptyList(),
)

@Serializable data class DraftClientDto(val id: String, val name: String, val phone: String, val address: String? = null)
/**
 * The list needs two figures; reopening the draft in the calculator needs the INPUTS the engine
 * was given. The route returns whole Calculation rows either way, so both live here.
 */
@Serializable data class DraftCalcDto(
    val monolithArea: String,
    val subtotal: String,
    val name: String? = null,
    val innerWidth: String? = null,
    val innerLength: String? = null,
    val bearing: String? = null,
    val correction: String? = null,
    val extraBeams: Int = 0,
    val forceStartBeam: Boolean = false,
    val patternOverride: String? = null,
    val m2Price: String? = null,
    val m2PriceOverride: Boolean = false,
    val m2PriceReason: String? = null,
)
@Serializable data class DraftOrderDto(val id: String, val orderNumber: String)

// ── «Галерея» · GET /api/gallery (order.view) ────────────────────────────────

@Serializable
data class GalleryPageDto(
    val posts: List<GalleryPostDto> = emptyList(),
    val total: Int = 0,
    val photoTotal: Int = 0,
    val page: Int = 1,
    val pageCount: Int = 0,
)

@Serializable
data class GalleryPostDto(
    val key: String,
    val orderId: String,
    val orderNumber: String,
    val clientName: String,
    val clientPhone: String? = null,
    val clientAddress: String? = null,
    val kind: String,
    val uploadedAt: String,
    val images: List<GalleryImageDto> = emptyList(),
)

@Serializable data class GalleryImageDto(val id: String, val url: String)

// ── «Хабарлар» · GET /api/inbox (inbox.access, and the inbox must be unlocked) ──
// `aiState`/`aiPaused` exist on the conversation but this route does not select them; they arrive
// only from GET /api/inbox/{id}, so they are deliberately absent here.

@Serializable data class InboxUnlockRequest(val password: String)

/** `token` is the 12 h JWT that goes back as the X-Inbox-Unlock header. */
@Serializable data class InboxUnlockDto(val unlocked: Boolean = false, val token: String? = null)

@Serializable
data class InboxDto(
    val conversations: List<ConversationDto> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
)

@Serializable
data class ConversationDto(
    val id: String,
    val channel: String = "TELEGRAM",
    val displayName: String,
    val username: String? = null,
    val lastMessageAt: String,
    val lastSnippet: String = "",
    val unread: Boolean = true,
)
