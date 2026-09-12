package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.PlaceOrderInput
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.PlaceOrderRequest
import uz.etalon.crm.core.network.dto.RoomCalcInputDto
import uz.etalon.crm.core.network.dto.SaveProjectDraftRequest
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** `POST /api/projects` is gated on this server-side — the same permission `CalculatorViewModel`
 *  reads for `CalculatorUiState.canWrite`. */
private const val ORDER_CREATE = "order.create"

/** Shown when [CalculatorRepository.saveDraft] is called with a row `SlabRow.canPersist` says no
 *  to. The ViewModel is expected to block the button first (`CalculatorUiState.unpersistableRoomNames`)
 *  — this is the repository's own defence-in-depth, not the primary UX.
 *
 *  Word-for-word `:feature:calculator`'s `R.string.calc_cannot_save_rooms`, which `PlaceOrderSheet`
 *  renders for the very same condition. A resource cannot cross the module boundary into
 *  `:core:data`, so the words are duplicated — but they ARE the same words; one condition, one
 *  sentence. `CalculatorViewModel.blockedRoomsMessage` is the third copy, for the same reason. */
private fun blockedRoomsMessage(names: List<String>): String =
    "Бу хоналарни сақлаб бўлмайди: " + names.joinToString(", ")

/** What a rejected queued order shows when the row carries no message of its own — the worker
 *  always writes one, so this is the "row hand-edited / written by another build" case. */
private const val REJECTED_FALLBACK_MESSAGE = "Буюртма қабул қилинмади"

/** [CalculatorRepository.reopenRejectedOrder] could not find the row (another device already
 *  acknowledged it, or nobody is signed in). The row stays wherever it is; nothing is deleted. */
private const val REOPEN_FAILED_MESSAGE = "Ҳисоб-китобни очиб бўлмади"

/** The row is there but this build cannot read what was in it — a payload written by a newer
 *  version, or a truncated write. Said plainly rather than reopening an empty quote, and the row
 *  is kept so «Тушунарли» is still the operator's way out. */
private const val REOPEN_UNREADABLE_MESSAGE = "Ҳисоб-китоб маълумотлари ўқилмади"

/** One order the server permanently refused after it had already been queued. [message] is the
 *  server's own Uzbek half, as the worker stored it. */
data class RejectedOrder(val id: String, val clientName: String, val message: String)

/**
 * Draft persistence (local, Room, owner-stamped) and the online-only save to
 * `POST /api/projects`. The server recomputes every room with its own engine and its own
 * `loadPricingConfig()` — [saveDraft] sends inputs only, never a result or a subtotal.
 */
@Singleton
class CalculatorRepository @Inject constructor(
    private val dao: CalculatorDraftDao,
    private val api: EtalonApi,
    private val permissions: PermissionGate,
    private val currentUser: CurrentUser,
    private val json: Json,
    private val outbox: OutboxGateway,
) {
    /** The signed-in operator's own draft. With nobody signed in there is nothing of theirs to
     *  restore — mirrors `OutboxRepository.observeForOrder`'s own owner guard. */
    fun observeDraft(): Flow<CalculatorDraft?> = flow {
        val owner = currentUser.id()
        if (owner == null) emit(null) else emitAll(dao.observe(owner).map { it?.toDraft() })
    }

    /** No-op with nobody signed in — a draft nobody owns has nowhere to be stamped, and this is
     *  called on an autosave timer, not a user action that could show a refusal. */
    suspend fun persistDraft(draft: CalculatorDraft) {
        val owner = currentUser.id() ?: return
        dao.upsert(CalculatorDraftEntity(ownerId = owner, draftJson = draft.toJson(), updatedAt = System.currentTimeMillis()))
    }

    suspend fun clearDraft() {
        val owner = currentUser.id() ?: return
        dao.deleteFor(owner)
    }

    /**
     * Online only — never queued through the outbox. [idempotencyKey] is the caller's, exactly
     * like `PaymentsRepository.record`: the same key across a retry of one submission, a new one
     * for a new save, decided by whoever holds the form.
     *
     * Refuses four ways before anything leaves the device — no `order.create`, an unpersistable
     * room, no rooms, no phone. The last is not decoration: `SaveProjectDraftSchema.clientPhone`
     * is `min(3)` and REQUIRED (name and address are optional there), and an empty one comes back
     * a 422 rendered as the generic «Маълумот нотўғри», naming nothing. `CalculatorViewModel`
     * blocks all four first; this is the repository's own defence-in-depth.
     */
    suspend fun saveDraft(draft: CalculatorDraft, idempotencyKey: String): Result<String> = runCatchingCancellable {
        if (!permissions.can(ORDER_CREATE)) error("Буюртма яратишга рухсат йўқ")
        val blocked = draft.rows.filterNot { it.canPersist }
        if (blocked.isNotEmpty()) error(blockedRoomsMessage(blocked.map { it.name }))
        if (draft.rows.isEmpty()) error("Камида битта хона керак")
        val phone = normalizePhone(draft.clientPhone)
        if (phone.isBlank()) error("Мижоз телефон рақамини киритинг")
        val dto = api.saveProjectDraft(
            SaveProjectDraftRequest(
                projectId = draft.projectId,
                clientName = draft.clientName.trim().ifEmpty { null },
                clientPhone = phone,
                clientAddress = draft.clientAddress.trim().ifEmpty { null },
                rooms = draft.rows.map { it.toWire() },
                discountPercent = draft.discountPercent,
                discountAmount = operatorAmountMoney(draft.discountAmount).amount,
            ),
            idempotencyKey = idempotencyKey,
        )
        dto.id
    }

    // ── «Буюртма бериш» — POST /api/orders, online or queued ────────

    /**
     * Places the order now. [idempotencyKey] is the caller's, exactly as [saveDraft]'s is: the
     * SAME key across a retry of one submission, a new one for a new submission. It must never be
     * a key already used for a draft save or a payment — the server scopes keys per user and
     * answers `IDEMPOTENT_ROUTE_MISMATCH` when one is replayed against a different route.
     *
     * Returns the new order's id, which is what the caller navigates to.
     */
    suspend fun placeOrder(input: PlaceOrderInput, idempotencyKey: String): Result<String> = runCatchingCancellable {
        val body = input.toRequest()
        // Null: this is the operator's own tap on a live connection, so AuthInterceptor supplies
        // the current token. Only the outbox drain pins a credential (see EtalonApi.placeOrder).
        api.placeOrder(body, idempotencyKey = idempotencyKey, authorization = null).id
    }

    /**
     * Queues the order for the outbox to send when a signal comes back — the reason this whole
     * route is idempotent server-side. The row's own id becomes the `Idempotency-Key` (the worker
     * sends `row.id`), so every retry of that row sends the SAME key and a dropped response
     * replays the first answer instead of placing a second real order.
     *
     * The body is built by the very same [toRequest] the online path uses, so a queued order and
     * an online one are the same order — that equality is the whole point of the offline path,
     * and `CalculatorRepositoryTest` asserts it by round-tripping the queued JSON.
     *
     * [idempotencyKey] becomes the ROW's id, and therefore the key the worker sends. It is the
     * caller's own key — the same one [placeOrder] would have used for this submission — because
     * the ordinary way to reach this method is an online attempt that died on the network: the
     * server may already have committed it, and a fresh key would place a second real order
     * against a customer who ordered once.
     *
     * Returns the outbox row's id (which is that key).
     */
    suspend fun queuePlaceOrder(input: PlaceOrderInput, idempotencyKey: String): Result<String> = runCatchingCancellable {
        val body = input.toRequest()
        outbox.enqueue(
            kind = OutboxKind.PLACE_ORDER,
            // No order id: the order is what this row is going to create.
            orderId = null,
            payload = json.encodeToJsonElement(PlaceOrderRequest.serializer(), body).jsonObject,
            rowId = idempotencyKey,
        )
    }

    /** Orders the server permanently rejected while they sat in the queue. By then the quote is
     *  long gone from the calculator, so this is the only thing that keeps the rejection findable
     *  rather than silent — Home's outbox sheet (design D10 / ruling R6) lists them, named by
     *  customer, until each is acknowledged. */
    fun observeRejectedOrders(): Flow<List<RejectedOrder>> =
        outbox.observeFailed(OutboxKind.PLACE_ORDER).map { rows ->
            rows.map { r ->
                RejectedOrder(
                    id = r.id,
                    clientName = r.payload["clientName"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    message = r.error ?: REJECTED_FALLBACK_MESSAGE,
                )
            }
        }

    /** The operator has read the rejection and is done with it — the row goes for good. */
    suspend fun discardRejectedOrder(id: String) = outbox.discard(id)

    /**
     * Ruling I3 · «Калькуляторда очиш». Turns a rejected queued order back into the operator's
     * current draft, then drops the row.
     *
     * The rejected row holds the only copy of that quote: the calculator was cleared the moment the
     * order was queued, hours before the refusal arrived. Acknowledging the rejection therefore
     * used to delete the work as well as the notice — an order for a real customer, priced room by
     * room, gone with one tap and no way back. This reads the payload the row was going to send and
     * rebuilds the quote from it, so the operator fixes whatever the server objected to and places
     * it again.
     *
     * **The inverse of [toRequest], and NOT a lossless one.** What comes back: every room's inputs
     * (dimensions, bearing, correction, extra beams, start beam, pattern override, rate override
     * and its reason), the client's name, phone and address, the discount (percent and amount),
     * delivery and other, and the `projectId` that keeps a saved draft from being duplicated. What
     * does not, because [CalculatorDraft] has no place for either — both are typed on the
     * place-order sheet at the moment of placing, not held by the quote:
     *
     * - `scheduledAt`, the delivery date, and
     * - `notes`.
     *
     * Each room's local `id` is minted fresh: it is this client's own handle, never sent, and
     * nothing outside the quote refers to it. `paidAmount`/`receiptUrls` are always zero and empty
     * on this route (see [toRequest]), so there is nothing to restore.
     *
     * **It overwrites whatever draft is open.** One draft per operator is the model the calculator
     * has always had, and the autosave would have replaced it a keystroke later anyway; but an
     * operator with a half-typed quote on screen loses it. The row is deleted only AFTER the draft
     * has been written, so a failure at any step leaves the rejection where it was.
     */
    suspend fun reopenRejectedOrder(id: String): Result<Unit> = runCatchingCancellable {
        // Before anything is deleted: with nobody signed in `persistDraft` is a no-op, and the row
        // would go with the quote still nowhere.
        if (currentUser.id() == null) error(REOPEN_FAILED_MESSAGE)
        val row = outbox.observeFailed(OutboxKind.PLACE_ORDER).first().firstOrNull { it.id == id }
            ?: error(REOPEN_FAILED_MESSAGE)
        val request = runCatching { json.decodeFromJsonElement(PlaceOrderRequest.serializer(), row.payload) }
            .getOrElse { error(REOPEN_UNREADABLE_MESSAGE) }
        persistDraft(request.toDraft())
        outbox.discard(id)
    }

    /** The inverse of [toWire] — see [reopenRejectedOrder] for what survives the round trip. */
    private fun PlaceOrderRequest.toDraft() = CalculatorDraft(
        rows = rooms.map { it.toRow() },
        clientPhone = clientPhone,
        clientName = clientName,
        clientAddress = clientAddress,
        discountPercent = discountPercent,
        discountAmount = discountAmount.toDouble(),
        deliveryCost = deliveryCost.toDouble(),
        otherCost = otherCost.toDouble(),
        projectId = projectId,
    )

    /** `result = null` on purpose: the engine reprices every restored row against the CURRENT
     *  pricing config, exactly as it does for a draft read back out of Room. */
    private fun RoomCalcInputDto.toRow() = SlabRow(
        id = UUID.randomUUID().toString(),
        name = name.orEmpty(),
        innerWidth = innerWidth,
        innerLength = innerLength,
        bearing = bearing,
        correction = correction,
        extraBeams = extraBeams,
        forceStartBeam = forceStartBeam,
        patternOverride = patternOverride?.let { p -> runCatching { Pattern.valueOf(p) }.getOrNull() },
        m2PriceOverride = m2PriceOverride,
        m2PriceOverrideValue = m2PriceOverrideValue?.toDouble(),
        m2PriceReason = m2PriceReason,
        result = null,
    )

    /**
     * The one place a quote becomes `POST /api/orders`'s body, shared by both paths above.
     *
     * Refuses the same three ways [saveDraft] does — no `order.create`, an unpersistable room, no
     * signed-in permission — plus the two `PlaceOrderSchema` demands that a draft does not make:
     * at least one room, and all three client fields present. Each refusal happens BEFORE anything
     * leaves the device, online or queued; a queued row that could only ever 422 would fail hours
     * later with the operator nowhere near the customer.
     *
     * Inputs only, never results: the server recomputes every room with its own engine.
     */
    private suspend fun PlaceOrderInput.toRequest(): PlaceOrderRequest {
        if (!permissions.can(ORDER_CREATE)) error("Буюртма яратишга рухсат йўқ")
        val blocked = draft.rows.filterNot { it.canPersist }
        if (blocked.isNotEmpty()) error(blockedRoomsMessage(blocked.map { it.name }))
        if (draft.rows.isEmpty()) error("Камида битта хона керак")
        val phone = normalizePhone(draft.clientPhone)
        if (draft.clientName.isBlank() || phone.isBlank() || draft.clientAddress.isBlank()) {
            error("Мижоз маълумотлари тўлиқ эмас")
        }
        if (scheduledAt.isBlank()) error("Етказиб бериш санасини танланг")
        return PlaceOrderRequest(
            // The draft the operator already saved, when there is one — without it the route
            // creates a SECOND DRAFT Project for a quote that already has one. See
            // `PlaceOrderRequest.projectId`'s own KDoc.
            projectId = draft.projectId,
            clientName = draft.clientName.trim(),
            clientPhone = phone,
            clientAddress = draft.clientAddress.trim(),
            rooms = draft.rows.map { it.toWire() },
            discountPercent = draft.discountPercent,
            discountAmount = operatorAmountMoney(draft.discountAmount).amount,
            deliveryCost = operatorAmountMoney(draft.deliveryCost).amount,
            otherCost = operatorAmountMoney(draft.otherCost).amount,
            scheduledAt = scheduledAt,
            notes = notes.trim().ifEmpty { null },
            // Prepayment at placement is the next phase's slice, designed for offline — see
            // PlaceOrderRequest's own KDoc. Zero here is a decision, not a placeholder.
            paidAmount = BigDecimal.ZERO,
            receiptUrls = emptyList(),
        )
    }

    private fun SlabRow.toWire() = RoomCalcInputDto(
        name = name.trim().ifEmpty { null },
        innerWidth = innerWidth,
        innerLength = innerLength,
        bearing = bearing,
        correction = correction,
        extraBeams = extraBeams,
        forceStartBeam = forceStartBeam,
        patternOverride = patternOverride?.name,
        m2PriceOverride = m2PriceOverride,
        m2PriceOverrideValue = m2PriceOverrideValue?.let { tierPriceMoney(it).amount },
        m2PriceReason = m2PriceReason,
    )

    // ── the local Room snapshot (draftJson) ─────────────────────────
    //
    // A private wire shape distinct from RoomCalcInputDto/SaveProjectDraftRequest: this one is
    // never sent anywhere, so it carries every SlabRow input field (including `id`, which the
    // server never sees) and none of the server's validation constraints. `result` is
    // deliberately absent — it is recomputed from these inputs once the draft is restored
    // (CalculatorViewModel.restoreDraft, against whatever PriceConfig is current), the same way a
    // freshly-typed room is.

    @Serializable
    private data class DraftSnapshot(
        val rows: List<RoomSnapshot>,
        val clientPhone: String,
        val clientName: String,
        val clientAddress: String,
        val discountPercent: Double,
        val discountAmount: Double,
        val deliveryCost: Double,
        val otherCost: Double,
        val projectId: String? = null,
    )

    @Serializable
    private data class RoomSnapshot(
        val id: String,
        val name: String,
        val innerWidth: Double,
        val innerLength: Double,
        val bearing: Double,
        val correction: Double,
        val extraBeams: Int,
        val forceStartBeam: Boolean,
        val patternOverride: String? = null,
        val m2PriceOverride: Boolean = false,
        val m2PriceOverrideValue: Double? = null,
        val m2PriceReason: String? = null,
    )

    private fun CalculatorDraft.toSnapshot() = DraftSnapshot(
        rows = rows.map { it.toSnapshot() },
        clientPhone = clientPhone, clientName = clientName, clientAddress = clientAddress,
        discountPercent = discountPercent, discountAmount = discountAmount,
        deliveryCost = deliveryCost, otherCost = otherCost, projectId = projectId,
    )

    private fun SlabRow.toSnapshot() = RoomSnapshot(
        id = id, name = name, innerWidth = innerWidth, innerLength = innerLength, bearing = bearing,
        correction = correction, extraBeams = extraBeams, forceStartBeam = forceStartBeam,
        patternOverride = patternOverride?.name, m2PriceOverride = m2PriceOverride,
        m2PriceOverrideValue = m2PriceOverrideValue, m2PriceReason = m2PriceReason,
    )

    private fun DraftSnapshot.toDraft() = CalculatorDraft(
        rows = rows.map { it.toRow() }, clientPhone = clientPhone, clientName = clientName,
        clientAddress = clientAddress, discountPercent = discountPercent, discountAmount = discountAmount,
        deliveryCost = deliveryCost, otherCost = otherCost, projectId = projectId,
    )

    private fun RoomSnapshot.toRow() = SlabRow(
        id = id, name = name, innerWidth = innerWidth, innerLength = innerLength, bearing = bearing,
        correction = correction, extraBeams = extraBeams, forceStartBeam = forceStartBeam,
        patternOverride = patternOverride?.let { p -> runCatching { Pattern.valueOf(p) }.getOrNull() },
        m2PriceOverride = m2PriceOverride, m2PriceOverrideValue = m2PriceOverrideValue,
        m2PriceReason = m2PriceReason, result = null,
    )

    private fun CalculatorDraft.toJson(): String = json.encodeToString(DraftSnapshot.serializer(), toSnapshot())

    /** A row this build cannot parse (a future version's field, a truncated write) must not take
     *  the draft down — the operator simply starts from an empty quote instead of a crash. Mirrors
     *  `OutboxRepository.toPending`'s own `runCatching` around a stored payload. */
    private fun CalculatorDraftEntity.toDraft(): CalculatorDraft? =
        runCatching { json.decodeFromString(DraftSnapshot.serializer(), draftJson) }.getOrNull()?.toDraft()
}
