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
import java.util.UUID
import uz.etalon.crm.core.calc.Calc
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.SlabRow
import java.io.File
import javax.inject.Named
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import uz.etalon.crm.core.model.ChatMessage
import uz.etalon.crm.core.model.ChatProject
import uz.etalon.crm.core.model.MessageKind
import uz.etalon.crm.core.model.Thread
import uz.etalon.crm.core.network.dto.MessageDto
import uz.etalon.crm.core.network.dto.ReplyLocationRequest
import uz.etalon.crm.core.network.dto.ReplyTextRequest
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
    private val calculator: CalculatorRepository,
    /** Media paths arrive server-relative; Coil needs them absolute. */
    @Named("apiBaseUrl") private val baseUrl: String,
) {

    /**
     * Reopens a saved draft in the calculator.
     *
     * It does not seed the calculator directly — it writes the project into the same local draft
     * the calculator already restores itself from on open. One restore path, not two, and the
     * screen needs no new entry point.
     *
     * The projectId travels with it, which is what stops a save-then-place leaving a duplicate
     * row: `POST /api/orders` reuses that Project rather than creating a second DRAFT for the same
     * quote.
     *
     * It DOES replace whatever unsaved quote was in the calculator. That is the same trade the
     * web makes with its own Â«ÐÐ°Ð»ÑÐºÑÐ»ÑÑÐ¾ÑÐ´Ð° Ð¾ÑÐ¸ÑÂ», and the alternative — refusing to open a saved
     * draft because of unsaved scratch — is worse.
     */
    suspend fun openDraftInCalculator(projectId: String): Result<Unit> = runCatchingCancellable {
        calculator.persistDraft(api.draft(projectId).toCalculatorDraft())
    }

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

    // ââ One conversation ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

    suspend fun thread(id: String): Result<Thread> = runCatchingCancellable {
        val dto = api.thread(id)
        Thread(
            id = dto.conversation.id,
            displayName = dto.conversation.displayName,
            username = dto.conversation.username,
            messages = dto.messages.map { it.toDomain(baseUrl) },
        )
    }

    suspend fun sendText(conversationId: String, text: String): Result<Unit> = runCatchingCancellable {
        api.replyText(conversationId, ReplyTextRequest(text.trim()))
    }

    /**
     * @param image already re-encoded by ImagePrep. The route takes jpeg/png/webp only and caps at
     *   8 MB, which a phone camera's original file clears on its own.
     */
    suspend fun sendPhoto(conversationId: String, image: File, caption: String): Result<Unit> =
        runCatchingCancellable {
            api.replyPhoto(
                id = conversationId,
                photo = MultipartBody.Part.createFormData("photo", image.name, image.asRequestBody(JPEG)),
                caption = caption.trim().toRequestBody(TEXT),
            )
        }

    suspend fun sendLocation(conversationId: String, lat: Double, lng: Double): Result<Unit> =
        runCatchingCancellable { api.replyLocation(conversationId, ReplyLocationRequest(lat, lng)) }

    suspend fun chatProjects(conversationId: String): Result<List<ChatProject>> = runCatchingCancellable {
        api.chatProjects(conversationId).map {
            ChatProject(
                id = it.id,
                draftNumber = it.draftNumber,
                orderId = it.order?.id,
                orderNumber = it.order?.orderNumber,
            )
        }
    }

    /** The server renders the card; nothing is drawn or uploaded here. */
    suspend fun sendProjectToChat(projectId: String): Result<Unit> =
        runCatchingCancellable { api.sendProjectToChat(projectId) }

    /**
     * Opens the inbox for this device
 and keeps the token, which [AuthInterceptor] then sends on
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

/**
 * A saved project as the calculator's own draft.
 *
 * Inputs only, never results: `result = null` on every row so the engine reprices the whole quote
 * against the CURRENT pricing config, exactly as it does for a draft read back out of Room. A
 * project saved last month must not reopen carrying last month's rates.
 */
private fun DraftDto.toCalculatorDraft() = CalculatorDraft(
    rows = calculations.mapIndexed { i, c ->
        SlabRow(
            // The row id is the calculator's own handle, not the server's: a restored quote is
            // edited locally before it is saved back, and the engine keys its results by this.
            id = UUID.randomUUID().toString(),
            name = c.name ?: "Ð¥Ð¾Ð½Ð° ${i + 1}",
            innerWidth = c.innerWidth?.toDoubleOrNull() ?: 0.0,
            innerLength = c.innerLength?.toDoubleOrNull() ?: 0.0,
            bearing = c.bearing?.toDoubleOrNull() ?: Calc.DEFAULT_BEARING,
            correction = c.correction?.toDoubleOrNull() ?: 0.0,
            extraBeams = c.extraBeams,
            forceStartBeam = c.forceStartBeam,
            patternOverride = when (c.patternOverride) {
                "GB" -> Pattern.GB
                "BGB" -> Pattern.BGB
                "GBG" -> Pattern.GBG
                // Null is the web's Â«AUTOÂ» â let the engine pick, which is also what an unknown
                // code must fall back to rather than guessing one.
                else -> null
            },
            m2PriceOverride = c.m2PriceOverride,
            // Only meaningful when the operator overrode it; otherwise the engine's tier wins.
            m2PriceOverrideValue = c.m2Price?.takeIf { c.m2PriceOverride }?.toDoubleOrNull(),
            m2PriceReason = c.m2PriceReason,
            // Inputs only, never results: the engine reprices the whole quote against the CURRENT
            // pricing config, exactly as it does for a draft read back out of Room. A project
            // saved last month must not reopen carrying last month's rates.
            result = null,
        )
    },
    clientPhone = client?.phone ?: tentativeClientPhone.orEmpty(),
    clientName = client?.name ?: tentativeClientName.orEmpty(),
    clientAddress = client?.address ?: tentativeClientAddress.orEmpty(),
    // The draft route has no columns for these: a reopened project starts them at zero, exactly
    // as saving it dropped them.
    discountPercent = 0.0,
    discountAmount = 0.0,
    deliveryCost = 0.0,
    otherCost = 0.0,
    // What stops a save-then-place leaving a duplicate: POST /api/orders reuses this Project.
    projectId = id,
)

/**
 * A wire message as a bubble.
 *
 * `mediaKind == null` is the server saying "plain text", not a missing field. LOCATION is the one
 * kind whose payload is not a file at all â its coordinates arrive only inside `mediaMeta`, and a
 * LOCATION without them is undrawable, which is why the UI checks for nulls rather than assuming.
 */
private fun MessageDto.toDomain(baseUrl: String) = ChatMessage(
    id = id,
    outbound = direction == "OUTBOUND",
    text = text,
    kind = when (mediaKind) {
        null -> MessageKind.TEXT
        "IMAGE" -> MessageKind.IMAGE
        "VOICE", "AUDIO" -> MessageKind.VOICE
        "VIDEO", "VIDEO_NOTE" -> MessageKind.VIDEO
        "DOCUMENT" -> MessageKind.DOCUMENT
        "LOCATION" -> MessageKind.LOCATION
        else -> MessageKind.UNSUPPORTED
    },
    // The path is server-relative; Coil needs an absolute one.
    mediaUrl = mediaPath?.let { if (it.startsWith("http")) it else baseUrl.trimEnd('/') + it },
    mediaName = mediaName,
    lat = mediaMeta?.double("lat"),
    lng = mediaMeta?.double("lng"),
    locationTitle = mediaMeta?.string("title"),
    durationSec = mediaMeta?.double("duration")?.toInt(),
    // The server marks media it could not fetch or that Telegram would not hand over. The bubble
    // says so instead of showing a broken image.
    mediaMissing = mediaMeta?.bool("unavailable") == true || mediaMeta?.bool("oversize") == true,
    failed = failed,
    createdAt = Instant.parse(createdAt),
)

private fun JsonObject.double(key: String): Double? = (this[key] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()
private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.contentOrNull?.toBooleanStrictOrNull()

private val JPEG = "image/jpeg".toMediaType()
private val TEXT = "text/plain".toMediaType()
