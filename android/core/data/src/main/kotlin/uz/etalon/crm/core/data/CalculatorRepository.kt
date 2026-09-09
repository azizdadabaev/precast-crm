package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.RoomCalcInputDto
import uz.etalon.crm.core.network.dto.SaveProjectDraftRequest
import javax.inject.Inject
import javax.inject.Singleton

/** `POST /api/projects` is gated on this server-side — the same permission `CalculatorViewModel`
 *  reads for `CalculatorUiState.canWrite`. */
private const val ORDER_CREATE = "order.create"

/** Shown when [CalculatorRepository.saveDraft] is called with a row `SlabRow.canPersist` says no
 *  to. The ViewModel is expected to block the button first (`CalculatorUiState.unpersistableRoomNames`)
 *  — this is the repository's own defence-in-depth, not the primary UX. */
private fun blockedRoomsMessage(names: List<String>): String =
    "Сақлаб бўлмайдиган хоналар: " + names.joinToString(", ")

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
     */
    suspend fun saveDraft(draft: CalculatorDraft, idempotencyKey: String): Result<String> = runCatchingCancellable {
        if (!permissions.can(ORDER_CREATE)) error("Буюртма яратишга рухсат йўқ")
        val blocked = draft.rows.filterNot { it.canPersist }
        if (blocked.isNotEmpty()) error(blockedRoomsMessage(blocked.map { it.name }))
        val dto = api.saveProjectDraft(
            SaveProjectDraftRequest(
                projectId = draft.projectId,
                clientName = draft.clientName.trim().ifEmpty { null },
                clientPhone = normalizePhone(draft.clientPhone),
                clientAddress = draft.clientAddress.trim().ifEmpty { null },
                rooms = draft.rows.map { it.toWire() },
                discountPercent = draft.discountPercent,
                discountAmount = operatorAmountMoney(draft.discountAmount).amount,
            ),
            idempotencyKey = idempotencyKey,
        )
        dto.id
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
