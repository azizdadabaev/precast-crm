package uz.etalon.crm.core.data

import uz.etalon.crm.core.model.Conversation
import uz.etalon.crm.core.model.DraftLine
import uz.etalon.crm.core.model.DraftsPage
import uz.etalon.crm.core.model.GalleryKind
import uz.etalon.crm.core.model.GalleryPage
import uz.etalon.crm.core.model.GalleryPost
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.network.dto.InboxUnlockRequest
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.ConversationDto
import uz.etalon.crm.core.network.dto.DraftDto
import uz.etalon.crm.core.network.dto.GalleryPostDto
import java.math.BigDecimal
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The three read-only surfaces behind the drawer and the bar's fifth cell.
 *
 * One repository rather than three: none of them writes, none of them caches offline, and all
 * three are a single paged GET whose result the screen holds for as long as it is open. Splitting
 * that into three classes would be three copies of the same four lines.
 */
@Singleton
class BrowseRepository @Inject constructor(
    private val api: EtalonApi,
    private val tokens: TokenStore,
) {

    suspend fun drafts(page: Int, query: String?, draftsOnly: Boolean): Result<DraftsPage> =
        runCatchingCancellable {
            val dto = api.drafts(
                page = page,
                pageSize = PAGE_SIZE,
                // «Лойиҳалар» is the DRAFT tab; «Барчаси» sends no status at all, exactly as the
                // web's segmented control does.
                status = if (draftsOnly) "DRAFT" else null,
                query = query?.takeIf { it.isNotBlank() },
            )
            DraftsPage(
                rows = dto.rows.map { it.toDomain() },
                total = dto.total,
                page = dto.page,
                pageCount = dto.pageCount,
                draftCount = dto.statusCounts.DRAFT,
                orderedCount = dto.statusCounts.ORDERED,
            )
        }

    suspend fun gallery(page: Int, query: String?): Result<GalleryPage> = runCatchingCancellable {
        val dto = api.gallery(page = page, pageSize = GALLERY_PAGE_SIZE, query = query?.takeIf { it.isNotBlank() })
        GalleryPage(
            posts = dto.posts.map { it.toDomain() },
            photoTotal = dto.photoTotal,
            page = dto.page,
            pageCount = dto.pageCount,
        )
    }

    suspend fun conversations(): Result<List<Conversation>> = runCatchingCancellable {
        api.inbox().conversations.map { it.toDomain() }
    }

    /**
     * Opens the inbox for this device and keeps the token, which [AuthInterceptor] then sends on
     * every request.
     *
     * The phone has to be able to do this. The web has an unlock dialog and the app sent people to
     * it, which is useless to an operator holding only a phone — and it is the same password
     * either way, so there was never a reason the app could not ask for it itself.
     */
    suspend fun unlockInbox(password: String): Result<Unit> = runCatchingCancellable {
        val dto = api.unlockInbox(InboxUnlockRequest(password))
        val token = dto.token
        if (!dto.unlocked || token.isNullOrBlank()) error("unlock refused")
        tokens.setInboxUnlock(token)
    }
}

private fun DraftDto.toDomain() = DraftLine(
    id = id,
    name = name,
    draftNumber = draftNumber,
    status = status,
    aiGenerated = aiGenerated,
    updatedAt = Instant.parse(updatedAt),
    // The client record wins; a project quoted before anyone made one falls back to what the
    // operator typed. The web's «Мижоз» column resolves it in exactly this order.
    clientName = client?.name ?: tentativeClientName,
    clientPhone = client?.phone ?: tentativeClientPhone,
    clientAddress = client?.address ?: tentativeClientAddress,
    rooms = calculations.size,
    area = calculations.fold(BigDecimal.ZERO) { acc, c -> acc + BigDecimal(c.monolithArea) },
    subtotal = calculations.fold(Money.ZERO) { acc, c -> acc + Money.parse(c.subtotal) },
    // A project can carry more than one order in the schema; the web prints the first, and so
    // does this.
    orderNumber = orders.firstOrNull()?.orderNumber,
    orderId = orders.firstOrNull()?.id,
)

private fun GalleryPostDto.toDomain() = GalleryPost(
    key = key,
    orderId = orderId,
    orderNumber = orderNumber,
    clientName = clientName,
    clientPhone = clientPhone,
    clientAddress = clientAddress,
    kind = when (kind) {
        "LOADED" -> GalleryKind.LOADED
        "DELIVERY_PROOF" -> GalleryKind.DELIVERY_PROOF
        "SHIPMENT_LOADED" -> GalleryKind.SHIPMENT_LOADED
        else -> GalleryKind.UNKNOWN
    },
    uploadedAt = Instant.parse(uploadedAt),
    imageUrls = images.map { it.url },
)

private fun ConversationDto.toDomain() = Conversation(
    id = id,
    channel = channel,
    displayName = displayName,
    username = username,
    lastMessageAt = Instant.parse(lastMessageAt),
    lastSnippet = lastSnippet,
    unread = unread,
)

private const val PAGE_SIZE = 50
/** The web asks for 24 and its pager appears past that; matching keeps the two paging alike. */
private const val GALLERY_PAGE_SIZE = 24
