package uz.etalon.crm.feature.calculator

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.PlaceOrderInput
import uz.etalon.crm.core.calc.PriceConfig
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.calc.roundDownToGrid
import uz.etalon.crm.core.calc.roundUpToGrid
import uz.etalon.crm.core.calc.toPriceConfig
import uz.etalon.crm.core.data.CalculatorRepository
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.ui.regions.ParsedAddress
import uz.etalon.crm.core.ui.regions.composeAddress
import uz.etalon.crm.core.ui.regions.parseAddress
import java.util.UUID
import javax.inject.Inject

/** `POST /api/orders` (and the draft route behind it) is gated on this — the calculator itself
 *  stays usable without it; see `CalculatorUiState.canWrite`. */
private const val ORDER_CREATE = "order.create"

/** Mirrors `CalculatorRepository.saveDraft`'s own refusal, so the screen never offers an action
 *  the operator cannot perform and the repository never has to be the first to say no.
 *  Word-for-word `R.string.calc_no_write_permission`, which a ViewModel cannot reach. */
private const val NO_PERMISSION_MESSAGE = "Буюртма яратишга рухсат йўқ"

/** Word-for-word `R.string.calc_cannot_save_rooms` — the sheet renders that resource for the very
 *  same condition (`PlaceOrderSheet`'s notice), and one condition gets one sentence.
 *  `CalculatorRepository.blockedRoomsMessage` carries the same words for the same reason. */
private fun blockedRoomsMessage(names: List<String>): String =
    "Бу хоналарни сақлаб бўлмайди: " + names.joinToString(", ")

private const val SAVE_SUCCESS_MESSAGE = "Лойиҳа сақланди"

/** Shown after a placement is queued. The order is not placed yet — it will be, the moment there
 *  is a signal — and the message says exactly that rather than implying it is done. */
internal const val QUEUED_MESSAGE = "Интернет пайдо бўлганда юборилади"

/** Mirrors `CalculatorRepository.toRequest`'s own refusals, so the sheet never offers an action
 *  the server would reject. */
private const val NO_ROOMS_MESSAGE = "Камида битта хона керак"
private const val CLIENT_INCOMPLETE_MESSAGE = "Мижоз маълумотлари тўлиқ эмас"
private const val NO_DATE_MESSAGE = "Етказиб бериш санасини танланг"

/** `SaveProjectDraftSchema.clientPhone` is `min(3)` and REQUIRED — the one client field the DRAFT
 *  route insists on (name and address are optional there). `normalizePhone("")` returns `""`, which
 *  would go on the wire and come back a 422 rendered as the generic «Маълумот нотўғри», naming
 *  nothing. Mirrored word-for-word by `CalculatorRepository.saveDraft`. */
private const val NO_PHONE_MESSAGE = "Мижоз телефон рақамини киритинг"

/** `clientName` is `max(120)` and `clientAddress` `max(200)` on BOTH `SaveProjectDraftSchema` and
 *  `PlaceOrderSchema`. Capped as the operator types rather than left to the server: an over-long
 *  value queued offline becomes a permanent 422 whose message is the server's English
 *  "Validation failed", hours later, with the operator nowhere near the customer. */
private const val MAX_CLIENT_NAME = 120
private const val MAX_CLIENT_ADDRESS = 200

/** How long after any mutation the ViewModel waits before writing the draft to Room — long
 *  enough that a keystroke walk through a room's fields is one write, not one per keystroke. */
private const val AUTOSAVE_DEBOUNCE_MS = 500L

/** The Idempotency-Key in flight and the submission it belongs to — see `saveDraft`'s own doc,
 *  and `RecordPaymentViewModel`'s identical pair for `POST /api/payments`. */
private const val KEY_IDEMPOTENCY = "calc.idempotencyKey"
private const val KEY_IDEMPOTENCY_FOR = "calc.idempotencyFor"

/**
 * The Place-Order key and its submission, kept in their OWN [SavedStateHandle] slots — never the
 * two above. The server scopes an idempotency key as `${user.id}:${key}` and answers
 * `IDEMPOTENT_ROUTE_MISMATCH` when a key first used on one route is replayed against another, so a
 * key that saved a draft to `POST /api/projects` would be REJECTED by `POST /api/orders`. Two
 * routes, two keys.
 */
private const val KEY_PLACE_IDEMPOTENCY = "calc.placeIdempotencyKey"
private const val KEY_PLACE_IDEMPOTENCY_FOR = "calc.placeIdempotencyFor"

/** `RoomCalcInputBaseSchema.m2PriceReason`'s cap on the server (validation.ts) — `internal` so
 *  `RateConfirm` can enforce the same limit on the reason field it collects. */
internal const val MAX_REASON = 200

/** `normalizePhone` turns exactly nine digits into `998` + those nine — the same figure
 *  `ClientEditViewModel`'s own `LOCAL_PHONE_DIGITS` uses. `internal` so `PlaceOrderSheet.kt`'s
 *  `canPlaceClient` tests the SAME figure rather than a copy that could drift from it. */
internal const val CLIENT_PHONE_DIGITS = 9

/** How long the client bar waits after the ninth digit before asking `findByPhone` — long enough
 *  that a nine-digit phone is one request, not nine; short enough the operator does not notice.
 *  `internal` so the test measures the real figure, mirroring `CLIENT_SEARCH_DEBOUNCE_MS`. */
internal const val CLIENT_PHONE_LOOKUP_DEBOUNCE_MS = 400L

/**
 * A restored room's name follows «Хона N» ([CalculatorViewModel.addRoom]'s own literal, mirrored
 * by `R.string.calc_room_default_name`) — this recovers N so a freshly-added room after a restore
 * never reuses a number already on screen, the same rule `addRoom` keeps for a deleted room within
 * one session.
 *
 * Anchored at the END, and on the word: a bare `(\d+)` took the FIRST digit group, so an operator
 * who had renamed a room «2-қават Хона 5» handed back 2 — and the next room added was «Хона 5»
 * again, a second room with that name, indistinguishable from the first in the photo of the screen
 * the customer is sent.
 */
private val ROOM_SEQ_REGEX = Regex("""Хона (\d+)$""")

fun interface ObserveDraftUseCase {
    operator fun invoke(): Flow<CalculatorDraft?>
}

fun interface PersistDraftUseCase {
    suspend operator fun invoke(draft: CalculatorDraft)
}

fun interface ClearDraftUseCase {
    suspend operator fun invoke()
}

fun interface SaveDraftUseCase {
    suspend operator fun invoke(draft: CalculatorDraft, idempotencyKey: String): Result<String>
}

fun interface PlaceOrderUseCase {
    suspend operator fun invoke(input: PlaceOrderInput, idempotencyKey: String): Result<String>
}

fun interface QueuePlaceOrderUseCase {
    suspend operator fun invoke(input: PlaceOrderInput, idempotencyKey: String): Result<String>
}

fun interface ObserveRejectedOrdersUseCase {
    operator fun invoke(): Flow<List<RejectedOrder>>
}

fun interface DiscardRejectedOrderUseCase {
    suspend operator fun invoke(id: String)
}

/**
 * Rooms, the text typed into their cells, live pricing and totals for a quote — the state and behaviour
 * behind the calculator screen, with no Compose in it: the screen (a later task) is built on top
 * of this and must be able to drive it from plain JUnit.
 *
 * [session] and [permissions] are taken directly rather than wrapped in a use-case fun interface
 * the way `ClientsViewModel`/`HomeViewModel` wrap their repositories: both are already narrow,
 * already-fakeable abstractions (see [SessionPricing], [PermissionGate]), so a second layer of
 * indirection here would buy nothing. [CalculatorRepository] is the opposite case — it bundles a
 * Room DAO the feature module cannot reach without pulling `:core:database` onto its own test
 * classpath — so its four operations ARE wrapped, the same way `RecordPaymentViewModel` wraps
 * `PaymentsRepository` and `DiscrepanciesViewModel` wraps `DiscrepanciesRepository`; the four
 * fun-interface params below default to inert no-ops so every existing test that never touches a
 * draft need not know they exist.
 *
 * `:core:calc` is a `Double` engine on purpose (bit-parity with the server's TS engine); this
 * class holds that `Double` state for live recompute, but never exposes a `Double` as money —
 * `SlabResult.money()` / `ProjectTotal.money()` do that conversion at the render site, not here.
 */
@OptIn(FlowPreview::class)
open class CalculatorViewModel(
    private val session: SessionPricing,
    private val permissions: PermissionGate,
    private val clients: ClientsRepository,
    private val observeDraft: ObserveDraftUseCase = ObserveDraftUseCase { flowOf(null) },
    private val persistDraft: PersistDraftUseCase = PersistDraftUseCase { },
    private val clearDraftUseCase: ClearDraftUseCase = ClearDraftUseCase { },
    private val saveDraftUseCase: SaveDraftUseCase = SaveDraftUseCase { _, _ -> Result.failure(IllegalStateException("no draft to save")) },
    private val placeOrderUseCase: PlaceOrderUseCase = PlaceOrderUseCase { _, _ -> Result.failure(IllegalStateException("no order to place")) },
    private val queuePlaceOrderUseCase: QueuePlaceOrderUseCase = QueuePlaceOrderUseCase { _, _ -> Result.failure(IllegalStateException("no order to queue")) },
    private val observeRejectedOrders: ObserveRejectedOrdersUseCase = ObserveRejectedOrdersUseCase { flowOf(emptyList()) },
    private val discardRejectedOrderUseCase: DiscardRejectedOrderUseCase = DiscardRejectedOrderUseCase { },
    private val saved: SavedStateHandle = SavedStateHandle(),
) : ViewModel() {

    private var priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG

    /** Only ever increases — see `addRoom`'s doc for why a deleted room's number is never reused. */
    private var nextRoomSeq = 1

    /**
     * Bumped by [clearAll] — the real defence against the trap where a save's response lands
     * AFTER the operator has already cleared the quote for the next customer. The button being
     * disabled by [CalculatorUiState.saving] narrows the window but is not the guard: Compose
     * recomposition trails a state change by at least a frame, so a tap can still land on
     * `clearAll` while a save is in flight. [saveDraft] captures the generation it started with;
     * its `onSuccess`/`onFailure` only apply their result if the generation is still the one they
     * captured — otherwise the quote they would write onto no longer exists, and applying it would
     * resurrect exactly what `clearAll` just deleted.
     */
    private var draftGeneration = 0

    /**
     * Whether Room is known to hold NOTHING for this operator right now — set by [clearAll], which
     * deletes the row itself, and by the autosave collector when it clears the row; cleared again
     * the moment anything is written back.
     *
     * The autosave collector used to drop an empty draft by VALUE (`filter { it != EMPTY_DRAFT }`),
     * which stopped [clearAll]'s own row from being re-created but also swallowed a genuine write:
     * an operator deleting the last room by hand left the rooms sitting in Room, and they came back
     * on the next restart. Filtering on the CAUSE instead — is the row already empty? — writes that
     * one and still leaves [clearAll]'s alone.
     */
    private var draftRowCleared = false

    /** The one in-flight phone lookup, whether debounced or an explicit retry. A new keystroke —
     *  or a retry — cancels whatever is still running, so a stale answer for a number the operator
     *  has already changed can never land. */
    private var clientLookupJob: Job? = null

    private val _state = MutableStateFlow(CalculatorUiState())
    val state: StateFlow<CalculatorUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val canWrite = permissions.can(ORDER_CREATE)
            _state.update { it.copy(canWrite = canWrite) }
        }
        // Restores the operator's own draft, then keeps writing it back on a debounce — one
        // coroutine, sequential: the debounced collector below only starts watching [_state]
        // AFTER the restore has already applied, so the empty default state this ViewModel is
        // seeded with is never the thing that gets persisted and clobbers a real draft.
        viewModelScope.launch {
            val restored = observeDraft().first()
            if (restored != null) restoreDraft(restored)
            // Only now may the screen act on an empty quote — see [CalculatorUiState.restored].
            _state.update { it.copy(restored = true) }
            // Nothing restored means there is no row of this operator's to keep in sync — see
            // [draftRowCleared], which the collector below reads before it clears anything.
            draftRowCleared = restored == null
            // distinctUntilChanged: a keystroke that does not change the parsed value (the comma
            // of «5,»), expandedRowId, saving and saveMessage all touch [_state] without changing
            // what toDraft() would write — none of that belongs in Room.
            _state.map { it.toDraft() }.distinctUntilChanged()
                .debounce(AUTOSAVE_DEBOUNCE_MS)
                .collect { draft ->
                    if (draft == EMPTY_DRAFT) {
                        // An empty quote is a DELETE, not an empty row — and only when the row is
                        // still there, so clearAll (which deletes it itself) is not repeated.
                        if (!draftRowCleared) {
                            clearDraftUseCase()
                            draftRowCleared = true
                        }
                    } else {
                        persistDraft(draft)
                        draftRowCleared = false
                    }
                }
        }
        // Rejections outlive the quote they came from: by the time the server refuses a queued
        // order the calculator has long been cleared, so this is the only surface that can tell
        // the operator it happened. Collected for the whole life of the screen, not once.
        viewModelScope.launch {
            observeRejectedOrders().collect { rejected -> _state.update { it.copy(rejectedOrders = rejected) } }
        }
        // Collected once, here: until it lands every row prices against DEFAULT_PRICE_CONFIG,
        // which is what an operator's real bootstrap Pricing reproduces anyway (see
        // BoundaryTest's "Android pricing converts to engine doubles that pick the same tiers").
        // When it lands every existing row is re-priced against the real catalogue.
        viewModelScope.launch {
            session.pricing.collect { p ->
                if (p != null) {
                    priceConfig = p.toPriceConfig()
                    _state.update { s -> withTotals(s, s.rows.map { recomputeRow(it, priceConfig) }) }
                }
            }
        }
    }

    /** A fresh, empty room named «Хона N». `nextRoomSeq` only ever increases, so deleting «Хона 1»
     *  never lets a later room reuse that number — two rooms sharing a name in the operator's
     *  photo of the screen would be indistinguishable to the customer. */
    fun addRoom() {
        val row = recomputeRow(SlabRow(id = UUID.randomUUID().toString(), name = "Хона ${nextRoomSeq++}"), priceConfig)
        _state.update { withTotals(it.copy(drafts = it.drafts + (row.id to RoomDraft())), it.rows + row) }
    }

    /** Copies every input of [id] into a new row with its own id and the next room name, placed
     *  right after the source — its cell texts included, or the copy would show blank cells over
     *  dimensions it really has. */
    fun duplicateRoom(id: String) {
        val src = _state.value.rows.firstOrNull { it.id == id } ?: return
        val copy = recomputeRow(src.copy(id = UUID.randomUUID().toString(), name = "Хона ${nextRoomSeq++}"), priceConfig)
        _state.update { s ->
            val idx = s.rows.indexOfFirst { it.id == id }
            val newRows = s.rows.toMutableList().apply { add(idx + 1, copy) }
            withTotals(s.copy(drafts = s.drafts + (copy.id to s.draft(id))), newRows)
        }
    }

    /** Removes the room — and everything else on screen that points at it: its cell texts, the
     *  expanded card, and a rate confirmation still collecting a reason for a row that is about to
     *  stop existing. */
    fun deleteRoom(id: String) {
        _state.update { s ->
            val next = withTotals(s, s.rows.filterNot { it.id == id })
            next.copy(
                expandedRowId = next.expandedRowId.takeIf { it != id },
                drafts = next.drafts - id,
                rateConfirm = next.rateConfirm.takeIf { it?.rowId != id },
            )
        }
    }

    /** Reorders only — no row's inputs change, so no row's own result moves. The project totals
     *  ARE re-summed in a different order, which binary floating-point addition does not promise
     *  to be associative about, so they can differ in the last bit; every one of them is `round2`'d
     *  before it becomes money, which is far coarser than that, so nothing observable changes and
     *  re-running the aggregation here would buy nothing. */
    fun moveRoom(from: Int, to: Int) {
        _state.update { s ->
            if (from !in s.rows.indices || to !in s.rows.indices) return@update s
            val rows = s.rows.toMutableList()
            rows.add(to, rows.removeAt(from))
            s.copy(rows = rows)
        }
    }

    /** The ↑ / ↓ buttons on the ⋯ row (R3), over [moveRoom]. A room already at the end of the list
     *  does nothing — the buttons are disabled there, and this is the same rule behind them. */
    fun moveRoomUp(id: String) {
        val i = _state.value.rows.indexOfFirst { it.id == id }
        if (i > 0) moveRoom(i, i - 1)
    }

    fun moveRoomDown(id: String) {
        val rows = _state.value.rows
        val i = rows.indexOfFirst { it.id == id }
        if (i >= 0 && i < rows.lastIndex) moveRoom(i, i + 1)
    }

    fun setName(id: String, name: String) = _state.update { s ->
        s.copy(rows = s.rows.map { if (it.id == id) it.copy(name = name) else it })
    }

    // ── The four numeric cells: text in, engine doubles out ─────────
    //
    // Each one keeps what the operator typed (filtered to digits and one separator — see
    // [filterDecimalText]) and prices the row off [parseDecimal] of that same text on EVERY
    // keystroke. A cell that does not parse yet — blank, or the «5,» of a half-typed decimal —
    // is 0.0 to the engine and unchanged on screen; nothing is ever "committed" separately,
    // because there is no pad to commit from any more.

    fun setWidthText(id: String, text: String) =
        setCellText(id, text, { d, t -> d.copy(width = t) }, { row, v -> row.copy(innerWidth = v) })

    fun setLengthText(id: String, text: String) =
        setCellText(id, text, { d, t -> d.copy(length = t) }, { row, v -> row.copy(innerLength = v) })

    fun setBearingText(id: String, text: String) =
        setCellText(id, text, { d, t -> d.copy(bearing = t) }, { row, v -> row.copy(bearing = v) })

    fun setCorrectionText(id: String, text: String) =
        setCellText(id, text, { d, t -> d.copy(correction = t) }, { row, v -> row.copy(correction = v) })

    /** One state emission per keystroke: the cell's text and the row it prices move together, so
     *  the screen can never draw a figure computed from a different string than the one in the
     *  cell above it. */
    private fun setCellText(
        id: String,
        text: String,
        onDraft: (RoomDraft, String) -> RoomDraft,
        onRow: (SlabRow, Double) -> SlabRow,
    ) {
        val filtered = filterDecimalText(text)
        val value = parseDecimal(filtered) ?: 0.0
        _state.update { s ->
            if (s.rows.none { it.id == id }) return@update s
            val newRows = s.rows.map { row -> if (row.id == id) recomputeRow(onRow(row, value), priceConfig) else row }
            withTotals(s.copy(drafts = s.drafts + (id to onDraft(s.draft(id), filtered))), newRows)
        }
    }

    /** Re-derives ONE cell's text from the engine double after an intent that changed it without
     *  the operator typing it — the ± bump, «юқорилаштириш», «Қўшимча»'s numeric fields. The text
     *  intents above deliberately do NOT go through this: «5,» must stay «5,» while it is typed. */
    private fun syncCellText(id: String, field: (RoomDraft, SlabRow) -> RoomDraft) = _state.update { s ->
        val row = s.rows.firstOrNull { it.id == id } ?: return@update s
        s.copy(drafts = s.drafts + (id to field(s.draft(id), row)))
    }

    /** Nudges [id]'s width by one step of the currently chosen [Grid], up or down. */
    fun bumpWidth(id: String, up: Boolean) {
        val step = _state.value.grid.step
        applyToRow(id) { row ->
            row.copy(innerWidth = if (up) roundUpToGrid(row.innerWidth, step) else roundDownToGrid(row.innerWidth, step))
        }
        syncCellText(id) { d, row -> d.copy(width = dimensionText(row.innerWidth)) }
    }

    /** Manual extra beams beyond the slab's own pitches — an extras-only room (see
     *  `SlabRow.canPersist`) still prices and still counts in [CalculatorUiState.totals]; only
     *  [CalculatorUiState.unpersistableRoomNames] marks it as unsavable. */
    fun setExtraBeams(id: String, n: Int) = applyToRow(id) { it.copy(extraBeams = n) }

    /** «Қўшимча»'s remaining editable engine inputs — see [SlabRow] for what each one means
     *  geometrically. Every one of these is a plain `updateRow`-then-recompute, same shape as
     *  [setExtraBeams] above. */
    fun setBearing(id: String, v: Double) {
        applyToRow(id) { it.copy(bearing = v) }
        syncCellText(id) { d, row -> d.copy(bearing = dimensionText(row.bearing)) }
    }
    fun setCorrection(id: String, v: Double) {
        applyToRow(id) { it.copy(correction = v) }
        syncCellText(id) { d, row -> d.copy(correction = dimensionText(row.correction)) }
    }
    fun setForceStartBeam(id: String, on: Boolean) = applyToRow(id) { it.copy(forceStartBeam = on) }
    /** `null` == the web's "Авто": let the engine auto-pick the pattern. */
    fun setPattern(id: String, p: Pattern?) = applyToRow(id) { it.copy(patternOverride = p) }

    /** The pattern chip on the card, one tap at a time: авто → Г-Б → Б-Г-Б → Г-Б-Г → авто.
     *  The chip is the only way to reach a pattern on the restyled card, so the cycle has to come
     *  back round to «авто» rather than dead-ending on Г-Б-Г. */
    fun cyclePattern(id: String) {
        val row = _state.value.rows.firstOrNull { it.id == id } ?: return
        setPattern(
            id,
            when (row.patternOverride) {
                null -> Pattern.GB
                Pattern.GB -> Pattern.BGB
                Pattern.BGB -> Pattern.GBG
                Pattern.GBG -> null
            },
        )
    }

    /**
     * The reason is MANDATORY here, unlike the web's optional note. A rate that differs from the
     * tier table is the one number on a quote nobody can reconstruct later, and the phone is where
     * it gets changed standing in front of the customer. Blank means the override does not happen.
     */
    fun applyRateOverride(id: String, price: Double, reason: String) {
        val note = reason.trim().take(MAX_REASON)          // 200 — RoomCalcInputBaseSchema
        if (note.isEmpty()) return
        if (M2_OVERRIDE_TIERS.none { it.price == price }) return
        applyToRow(id) { it.copy(m2PriceOverride = true, m2PriceOverrideValue = price, m2PriceReason = note) }
    }

    fun clearRateOverride(id: String) =
        applyToRow(id) { it.copy(m2PriceOverride = false, m2PriceOverrideValue = null, m2PriceReason = null) }

    /**
     * A tier tapped in the rate sheet. «Авто» ([price] `null`) and the tier the engine would pick
     * anyway are NOT overrides — nothing on the quote changes, so there is nothing to justify and
     * they clear whatever override is in place immediately. Every other tier parks in
     * [CalculatorUiState.rateConfirm] until [confirmRate] gets a reason (D5).
     */
    fun pickRate(id: String, price: Double?) {
        val row = _state.value.rows.firstOrNull { it.id == id } ?: return
        if (price == null || price == autoPickedRate(row)) {
            clearRateOverride(id)
            return
        }
        // The tier is checked HERE, on the way in, rather than left to [applyRateOverride] to
        // refuse silently after the reason has been typed: a price the server's Zod would reject
        // must never open a confirmation the operator can fill in and watch do nothing.
        if (M2_OVERRIDE_TIERS.none { it.price == price }) return
        _state.update { it.copy(rateConfirm = RateConfirmState(id, price)) }
    }

    /**
     * «Тасдиқлаш» — returns whether the override actually landed, and only then closes the
     * confirmation. A blank reason is not a refusal to be reported (the button is disabled until
     * there is one), so it simply leaves the sheet open; and if [applyRateOverride] refuses for
     * any other reason, the sheet stays open too rather than closing over an unchanged quote.
     */
    fun confirmRate(reason: String): Boolean {
        val pending = _state.value.rateConfirm ?: return false
        if (reason.isBlank()) return false
        applyRateOverride(pending.rowId, pending.price, reason)
        val applied = _state.value.rows.firstOrNull { it.id == pending.rowId }
            ?.let { it.m2PriceOverride && it.m2PriceOverrideValue == pending.price } == true
        if (applied) _state.update { it.copy(rateConfirm = null) }
        return applied
    }

    fun dismissRateConfirm() = _state.update { it.copy(rateConfirm = null) }

    /** [DiscountMode.PERCENT]/[DiscountMode.AMOUNT] are mutually exclusive at the engine boundary
     *  (see [withTotals]'s comment) — switching mode zeroes the field the OTHER mode owns, so a
     *  stale value left in the field the operator just left cannot silently resurface if they
     *  switch back. */
    fun setDiscountMode(m: DiscountMode) = _state.update { s ->
        recomputeTotals(
            when (m) {
                DiscountMode.PERCENT -> s.copy(discountMode = m, discountAmount = 0.0)
                DiscountMode.AMOUNT -> s.copy(discountMode = m, discountPercent = 0.0)
            },
        )
    }
    fun setDiscountPercent(v: Double) = _state.update { recomputeTotals(it.copy(discountPercent = v.coerceIn(0.0, 100.0))) }
    fun setDiscountAmount(v: Double) = _state.update { recomputeTotals(it.copy(discountAmount = v.coerceAtLeast(0.0))) }
    fun setDeliveryCost(v: Double) = _state.update { recomputeTotals(it.copy(deliveryCost = v.coerceAtLeast(0.0))) }
    fun setOtherCost(v: Double) = _state.update { recomputeTotals(it.copy(otherCost = v.coerceAtLeast(0.0))) }
    fun setGrid(g: Grid) = _state.update { it.copy(grid = g) }

    /** The `calc_round_all_up` ghost button: bumps every room with a width up to the current
     *  [Grid], leaving extras-only rows (no width yet) untouched — same rule [bumpWidth] uses for
     *  one row, applied to all of them at once. */
    fun roundAllWidthsUp() = _state.update { s ->
        val step = s.grid.step
        val newRows = s.rows.map { row ->
            if (row.innerWidth > 0) recomputeRow(row.copy(innerWidth = roundUpToGrid(row.innerWidth, step)), priceConfig) else row
        }
        // The widths moved without anyone typing them, so their cells have to follow — see
        // [syncCellText] for why the text intents do not.
        val drafts = newRows.fold(s.drafts) { acc, row ->
            if (row.innerWidth > 0) acc + (row.id to s.draft(row.id).copy(width = dimensionText(row.innerWidth))) else acc
        }
        withTotals(s.copy(drafts = drafts), newRows)
    }

    fun toggleExpanded(id: String) = _state.update { it.copy(expandedRowId = if (it.expandedRowId == id) null else id) }

    /** Back to a blank quote — rooms, the client bar and the discounts, per «Тозалаш»'s own
     *  brief. `canWrite` is left alone — it is resolved from the session, not part of the
     *  calculator's own data — and `nextRoomSeq` is left alone too, for the same reason deleting
     *  a room never reuses its number. Clears the persisted Room draft too, so reopening the
     *  screen does not bring the just-cleared quote back.
     *
     *  Takes effect immediately, even with a save in flight — the operator moving on to the next
     *  customer must not be stuck waiting on a spinner for a quote they have already abandoned.
     *  What makes that safe is [draftGeneration]: bumping it here means the in-flight save's own
     *  `onSuccess`/`onFailure` (see [saveDraft]) will find their captured generation stale and
     *  discard their result instead of writing it onto the fresh quote below. `saving` is reset
     *  here for the same reason — nothing else ever will, once that stale completion discards
     *  itself, and a spinner left running forever over an empty quote would be its own bug. */
    fun clearAll() {
        draftGeneration++
        draftRowCleared = true
        _state.update {
            it.copy(
                rows = emptyList(), expandedRowId = null, drafts = emptyMap(), rateConfirm = null,
                discountMode = DiscountMode.PERCENT, discountPercent = 0.0, discountAmount = 0.0,
                deliveryCost = 0.0, otherCost = 0.0, grid = Grid.CM10,
                totals = projectTotals(emptyList(), 0.0, 0.0),
                orderTotals = computeOrderTotals(emptyList(), 0.0, 0.0, 0.0, 0.0),
                schedule = emptyList(), error = null,
                clientPhoneDigits = "", clientName = "", clientAddress = ParsedAddress("", "", ""),
                matchedClientId = null, clientLookupError = null, clientFormOpen = true,
                projectId = null, saveMessage = null, toast = null, saving = false,
                // Same reasoning as `saving`: a stale placement's completion discards itself, so
                // nothing else would ever put the spinner down. [rejectedOrders] is deliberately
                // NOT cleared — it is not part of this quote, it is the record of a DIFFERENT one
                // the server refused, and «Тозалаш» must not be a way to lose that.
                placing = false, queueOffered = false,
            )
        }
        // Both pinned Idempotency-Keys go with the quote. The server's TTL on a key is 24 h, so
        // an IDENTICAL submission afterwards — the same customer ordering the same rooms for the
        // same day, which happens — would replay the first response and be silently never placed.
        // Safe only here and after a successful placement: those are the two moments the quote a
        // key belongs to stops existing, and a key must otherwise SURVIVE, which is its whole job.
        saved.remove<String>(KEY_IDEMPOTENCY)
        saved.remove<String>(KEY_IDEMPOTENCY_FOR)
        saved.remove<String>(KEY_PLACE_IDEMPOTENCY)
        saved.remove<String>(KEY_PLACE_IDEMPOTENCY_FOR)
        viewModelScope.launch { clearDraftUseCase() }
    }

    // ── draft persistence and «Лойиҳани сақлаш» ─────────────────────

    fun dismissSaveMessage() = _state.update { it.copy(saveMessage = null) }

    /** The restyled screen shows the save confirmation as a Toast — see [CalculatorUiState.toast]. */
    fun dismissToast() = _state.update { it.copy(toast = null) }

    /** Drops whatever refusal is on screen. `CalculatorActions` calls it when «Буюртма бериш»
     *  opens the placement sheet: a save that failed minutes ago belongs to the quote, and the
     *  sheet renders `state.error` too — a stale one there reads as the placement's own refusal. */
    fun dismissError() = _state.update { it.copy(error = null) }

    /**
     * Refuses the same four ways `CalculatorRepository.saveDraft` does — no `order.create`, an
     * unpersistable room, no rooms, no phone — so a save that would 422 never leaves the device.
     * [SavedStateHandle]-pinned [idempotencyKeyFor] keeps the same Idempotency-Key
     * across a retry of one submission (a dropped response, a 409 `IDEMPOTENT_IN_PROGRESS`) and
     * mints a new one only once the draft's own content changes — the same rule
     * `RecordPaymentViewModel.idempotencyKeyFor` follows for `POST /api/payments`.
     */
    fun saveDraft() {
        val s = _state.value
        if (s.saving) return
        val refusal = saveRefusal(s)
        if (refusal != null) {
            _state.update { it.copy(error = refusal) }
            return
        }
        val draft = s.toDraft()
        // Captured before the request goes out — see clearAll's own doc for why a result that
        // comes back after the operator has cleared the quote must be discarded, not applied.
        val generation = draftGeneration
        _state.update { it.copy(saving = true, error = null, saveMessage = null) }
        viewModelScope.launch {
            saveDraftUseCase(draft, idempotencyKeyFor(draft)).fold(
                onSuccess = { id ->
                    if (draftGeneration == generation) {
                        // Persisted immediately, not left to the autosave debounce: from here a
                        // second save must UPDATE this project, and that fact must survive a
                        // process death in the gap before the debounce would otherwise have
                        // flushed it — mirrors RecordPaymentViewModel persisting KEY_PAYMENT_ID
                        // the moment the row is known to exist.
                        _state.update {
                            it.copy(saving = false, projectId = id, saveMessage = SAVE_SUCCESS_MESSAGE, toast = SAVE_SUCCESS_MESSAGE)
                        }
                        // The CURRENT quote, not the one captured when the request went out: the
                        // operator keeps typing while the save is in flight, and writing the stale
                        // snapshot back would undo up to a debounce window of their edits.
                        persistDraft(_state.value.toDraft())
                        draftRowCleared = false
                    }
                    // else: clearAll ran while this save was in flight. The quote it would UPDATE
                    // no longer exists on screen or in Room — writing the id/content here would
                    // resurrect exactly what the operator just deleted.
                },
                onFailure = { t ->
                    if (draftGeneration == generation) {
                        _state.update { it.copy(saving = false, error = t.toAppError().message) }
                    }
                },
            )
        }
    }

    /** Why this quote may not be SAVED, in Uzbek — or null when it may. The draft route is looser
     *  than placement (no address, no name, no date), but it does demand a phone, and it demands a
     *  room the server will accept: `rooms` defaults to `[]` server-side, so an empty save would be
     *  accepted and create a project holding nothing. Mirrors `CalculatorRepository.saveDraft`'s
     *  refusals so the screen never offers an action the repository would only refuse a layer
     *  later — the same shape [placementRefusal] has for `POST /api/orders`. */
    private fun saveRefusal(s: CalculatorUiState): String? = when {
        !s.canWrite -> NO_PERMISSION_MESSAGE
        s.unpersistableRoomNames.isNotEmpty() -> blockedRoomsMessage(s.unpersistableRoomNames)
        s.rows.none { it.canPersist } -> NO_ROOMS_MESSAGE
        s.clientPhoneDigits.isBlank() -> NO_PHONE_MESSAGE
        else -> null
    }

    /**
     * The Idempotency-Key for ONE submission — see [saveDraft]'s own doc. Fingerprints only what
     * [CalculatorRepository.saveDraft] actually puts on the wire (mirrors [CalculatorDraft.wireFingerprint]'s
     * own doc for why `deliveryCost`/`otherCost` and a row's `result` must stay out of it).
     */
    private fun idempotencyKeyFor(draft: CalculatorDraft): String {
        val fingerprint = draft.wireFingerprint()
        if (saved.get<String>(KEY_IDEMPOTENCY_FOR) != fingerprint) {
            saved[KEY_IDEMPOTENCY_FOR] = fingerprint
            saved[KEY_IDEMPOTENCY] = UUID.randomUUID().toString()
        }
        return requireNotNull(saved.get<String>(KEY_IDEMPOTENCY))
    }

    // ── «Буюртма бериш» ─────────────────────────────────────────────

    /**
     * Places the order now. [scheduledAt] is the ISO-8601 instant the sheet resolved from the
     * operator's picked date; [notes] is whatever they wrote.
     *
     * Refuses the same five ways `CalculatorRepository.toRequest` does — no `order.create`, an
     * unpersistable room, no rooms, an incomplete client, no date — so a placement that would 422
     * never leaves the device and, more importantly, is never QUEUED to fail hours later with the
     * operator nowhere near the customer.
     *
     * On success the quote is cleared, exactly as the web does after Place Order: the deal is
     * committed and the calculator is free for the next customer. On a NETWORK failure the sheet
     * is offered «Навбатга қўйиш» instead — see [queuePlaceOrder] for why that must reuse this
     * submission's key, not mint a new one.
     */
    fun placeOrder(scheduledAt: String, notes: String) = submitPlacement(scheduledAt, notes, queue = false)

    /**
     * Queues the order for the outbox. Its key is the SAME one [placeOrder] pinned for this
     * submission: the ordinary way here is an online attempt that died on the network, where the
     * server may already have committed the order, and a fresh key would place a second real one.
     */
    fun queuePlaceOrder(scheduledAt: String, notes: String) = submitPlacement(scheduledAt, notes, queue = true)

    private fun submitPlacement(scheduledAt: String, notes: String, queue: Boolean) {
        val s = _state.value
        if (s.placing || s.saving) return
        val refusal = placementRefusal(s, scheduledAt)
        if (refusal != null) {
            _state.update { it.copy(error = refusal) }
            return
        }
        val input = PlaceOrderInput(draft = s.toDraft(), scheduledAt = scheduledAt, notes = notes)
        val key = placeIdempotencyKeyFor(input)
        // Captured before the request goes out — see clearAll's own doc for why a result that
        // comes back after the operator has cleared the quote must be discarded, not applied.
        val generation = draftGeneration
        _state.update { it.copy(placing = true, error = null, saveMessage = null, queueOffered = false) }
        viewModelScope.launch {
            val result = if (queue) queuePlaceOrderUseCase(input, key) else placeOrderUseCase(input, key)
            if (draftGeneration != generation) return@launch
            result.fold(
                onSuccess = { id ->
                    // clearAll bumps draftGeneration itself, so nothing captured earlier can
                    // write onto the fresh quote afterwards; both writes below happen after it,
                    // deliberately, because they are about the order that was just committed.
                    // It is also what forgets this submission's Idempotency-Keys — see its own doc
                    // for why a repeat of an identical order would otherwise never be placed.
                    clearAll()
                    if (queue) {
                        _state.update { it.copy(saveMessage = QUEUED_MESSAGE) }
                    } else {
                        _state.update { it.copy(placedOrderId = id) }
                    }
                },
                onFailure = { t ->
                    val err = t.toAppError()
                    _state.update {
                        it.copy(
                            placing = false, error = err.message,
                            // Only a lost signal is queueable. A 422 is the server refusing this
                            // body on the merits; queueing it would fail again, later, invisibly.
                            queueOffered = !queue && err is AppError.Network,
                        )
                    }
                },
            )
        }
    }

    /** The route has navigated to the placed order — see [CalculatorUiState.placedOrderId]. */
    fun consumePlacedOrder() = _state.update { it.copy(placedOrderId = null) }

    /** The operator has read the rejection and is done with it. */
    fun discardRejectedOrder(id: String) {
        viewModelScope.launch { discardRejectedOrderUseCase(id) }
    }

    /** Why this quote may not be placed, in Uzbek — or null when it may. Mirrors
     *  `CalculatorRepository.toRequest`'s refusals so the screen never offers an action the
     *  repository would only refuse a layer later. */
    private fun placementRefusal(s: CalculatorUiState, scheduledAt: String): String? = when {
        !s.canWrite -> NO_PERMISSION_MESSAGE
        s.unpersistableRoomNames.isNotEmpty() -> blockedRoomsMessage(s.unpersistableRoomNames)
        s.rows.none { it.canPersist } -> NO_ROOMS_MESSAGE
        !canPlaceClient(s) -> CLIENT_INCOMPLETE_MESSAGE
        scheduledAt.isBlank() -> NO_DATE_MESSAGE
        else -> null
    }

    /**
     * The Idempotency-Key for ONE placement — the same rule [idempotencyKeyFor] follows for the
     * draft route, over its own [SavedStateHandle] slots (see [KEY_PLACE_IDEMPOTENCY]). The
     * fingerprint covers everything `PlaceOrderRequest` actually sends, which unlike the draft's
     * INCLUDES `deliveryCost`/`otherCost`, the date and the notes: those are real fields here, so
     * changing one is a different submission and must not replay the previous one's response.
     */
    private fun placeIdempotencyKeyFor(input: PlaceOrderInput): String {
        val fingerprint = listOf(
            input.draft.wireFingerprint(), input.draft.deliveryCost, input.draft.otherCost,
            input.scheduledAt, input.notes,
        ).joinToString(";")
        if (saved.get<String>(KEY_PLACE_IDEMPOTENCY_FOR) != fingerprint) {
            saved[KEY_PLACE_IDEMPOTENCY_FOR] = fingerprint
            saved[KEY_PLACE_IDEMPOTENCY] = UUID.randomUUID().toString()
        }
        return requireNotNull(saved.get<String>(KEY_PLACE_IDEMPOTENCY))
    }

    /** Applies a restored draft to state, recomputing every row through the current
     *  [priceConfig] the same way a freshly-typed room is — the persisted snapshot never carries
     *  a `SlabResult`. Runs once, in `init`, before the operator's first keystroke can race it. */
    private fun restoreDraft(draft: CalculatorDraft) {
        val rows = draft.rows.map { recomputeRow(it, priceConfig) }
        nextRoomSeq = (rows.mapNotNull { ROOM_SEQ_REGEX.find(it.name)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0) + 1
        val address = parseAddress(draft.clientAddress)
        val digits = draft.clientPhone.takeLast(CLIENT_PHONE_DIGITS)
        _state.update { s ->
            withTotals(
                s.copy(
                    // The persisted draft carries doubles and nothing else — the ruling for this
                    // phase — so a restored room's cells are derived back from them: «5,20», not
                    // the «5,2» that was typed before the process died.
                    drafts = rows.associate { it.id to draftOf(it) },
                    clientPhoneDigits = digits, clientName = draft.clientName, clientAddress = address,
                    clientFormOpen = !(digits.length == CLIENT_PHONE_DIGITS && draft.clientName.isNotBlank()),
                    discountMode = if (draft.discountAmount > 0.0) DiscountMode.AMOUNT else DiscountMode.PERCENT,
                    discountPercent = draft.discountPercent, discountAmount = draft.discountAmount,
                    deliveryCost = draft.deliveryCost, otherCost = draft.otherCost,
                    projectId = draft.projectId,
                ),
                rows,
            )
        }
    }

    // ── The client bar: who the quote is for ───────────────────────

    /**
     * The nine local digits, already filtered/truncated by the bar's own field (copied
     * field-for-field from `ClientEditSheet`'s phone field — this method just stores what it is
     * handed, exactly as `ClientEditViewModel.setPhoneDigits` does).
     *
     * On the ninth digit this debounces and asks [ClientsRepository.findByPhone]. A hit fills the
     * name and address from the stored client; a miss clears [CalculatorUiState.matchedClientId]
     * without touching anything the operator typed — a new customer is not an error.
     */
    fun setClientPhoneDigits(v: String) {
        if (v == _state.value.clientPhoneDigits) return
        updateClientState { it.copy(clientPhoneDigits = v, matchedClientId = null, clientLookupError = null) }
        clientLookupJob?.cancel()
        if (v.length == CLIENT_PHONE_DIGITS) {
            clientLookupJob = viewModelScope.launch {
                delay(CLIENT_PHONE_LOOKUP_DEBOUNCE_MS)
                lookupClientByPhone(v)
            }
        }
    }

    /** The lookup error banner's retry — the same lookup, without the debounce: the operator
     *  already waited once and is asking again on purpose. */
    fun retryClientLookup() {
        val digits = _state.value.clientPhoneDigits
        if (digits.length != CLIENT_PHONE_DIGITS) return
        clientLookupJob?.cancel()
        clientLookupJob = viewModelScope.launch { lookupClientByPhone(digits) }
    }

    private suspend fun lookupClientByPhone(digits: String) {
        clients.findByPhone(digits).fold(
            onSuccess = { hit ->
                _state.update { it.copy(clientLookupError = null) }
                if (hit != null) {
                    updateClientState {
                        it.copy(clientName = hit.name, clientAddress = parseAddress(hit.address), matchedClientId = hit.id)
                    }
                }
            },
            onFailure = { t -> _state.update { it.copy(clientLookupError = t.toAppError().message) } },
        )
    }

    fun setClientName(v: String) = updateClientState { it.copy(clientName = v.take(MAX_CLIENT_NAME)) }
    fun setClientViloyat(v: String) = updateClientState { s -> s.copy(clientAddress = s.clientAddress.copy(viloyat = v)) }
    fun setClientTuman(v: String) = updateClientState { s -> s.copy(clientAddress = s.clientAddress.copy(tuman = v)) }
    fun setClientStreet(v: String) = updateClientState { s ->
        s.copy(clientAddress = s.clientAddress.copy(street = v.take(streetRoom(s.clientAddress))))
    }

    /** How many characters the street may still take before [composeAddress]'s result would pass
     *  [MAX_CLIENT_ADDRESS]. The viloyat and the tuman come from a fixed catalogue and are short;
     *  the street is the free-text half, so it is the one that gets capped. */
    private fun streetRoom(address: ParsedAddress): Int {
        val withoutStreet = composeAddress(address.viloyat, address.tuman, "")
        val separator = if (withoutStreet.isEmpty()) 0 else 2   // the ", " composeAddress joins with
        return (MAX_CLIENT_ADDRESS - withoutStreet.length - separator).coerceAtLeast(0)
    }

    /** The chevron on the one-line client row. Opens and closes the form without blanking
     *  anything — it only ever moves the flag, never the phone/name/address it is showing. */
    fun toggleClientForm() = _state.update { it.copy(clientFormOpen = !it.clientFormOpen) }

    /**
     * A phone and a name both present is an EDGE, not a level: it fires [transform] and then
     * closes the form only the moment that condition newly becomes true, never on every update
     * while it stays true. That is what lets the chevron's reopen stick — editing a field (the
     * name, the address) while the phone stays complete never re-crosses the edge, so the form
     * cannot snap shut again under the operator's fingers.
     *
     * The falling edge is the same rule read the other way: a quote whose phone or name has been
     * blanked has nothing to show on one line, so the form comes back open.
     */
    private fun updateClientState(transform: (CalculatorUiState) -> CalculatorUiState) {
        _state.update { s ->
            val wasReady = clientReady(s)
            val next = transform(s)
            when {
                !wasReady && clientReady(next) -> next.copy(clientFormOpen = false)
                wasReady && !clientReady(next) -> next.copy(clientFormOpen = true)
                else -> next
            }
        }
    }

    private fun clientReady(s: CalculatorUiState) =
        s.clientPhoneDigits.length == CLIENT_PHONE_DIGITS && s.clientName.isNotBlank()

    /** Recomputes only the row named [id] through the engine, then re-aggregates [CalculatorUiState.totals]
     *  and [CalculatorUiState.schedule] over the full row list — never every row, which the engine
     *  is cheap enough to afford but a live 30-room quote does not need to pay for on each keystroke. */
    private fun applyToRow(id: String, transform: (SlabRow) -> SlabRow) {
        _state.update { s ->
            val newRows = s.rows.map { row -> if (row.id == id) recomputeRow(transform(row), priceConfig) else row }
            withTotals(s, newRows)
        }
    }

    private fun recomputeTotals(s: CalculatorUiState): CalculatorUiState = withTotals(s, s.rows)

    private fun withTotals(s: CalculatorUiState, rows: List<SlabRow>): CalculatorUiState {
        // PERCENT and AMOUNT are mutually exclusive at the engine boundary too — projectTotal's
        // discountAmountOverride wins only when positive, so the mode not in use is passed as 0.0.
        val (percent, amountOverride) = when (s.discountMode) {
            DiscountMode.PERCENT -> s.discountPercent to 0.0
            DiscountMode.AMOUNT -> 0.0 to s.discountAmount
        }
        return s.copy(
            rows = rows,
            totals = projectTotals(rows, percent, amountOverride),
            // computeOrderTotals takes the same PERCENT/AMOUNT split — it resolves discountAmount
            // > 0 the same way projectTotal's discountAmountOverride does (see OrderTotals.kt).
            orderTotals = computeOrderTotals(rows, percent, amountOverride, s.deliveryCost, s.otherCost),
            schedule = beamSchedule(rows),
        )
    }
}

/** The whole quote, as [CalculatorRepository] persists and sends it — see [restoreDraft] for the
 *  inverse. `clientPhone` is normalised at the wire boundary (`CalculatorRepository.saveDraft`),
 *  not here, so the LOCAL draft round-trips the digits exactly as the operator typed them. */
private fun CalculatorUiState.toDraft(): CalculatorDraft = CalculatorDraft(
    rows = rows,
    clientPhone = if (clientPhoneDigits.isEmpty()) "" else normalizePhone(clientPhoneDigits),
    clientName = clientName,
    clientAddress = composeAddress(clientAddress.viloyat, clientAddress.tuman, clientAddress.street),
    discountPercent = discountPercent,
    discountAmount = discountAmount,
    deliveryCost = deliveryCost,
    otherCost = otherCost,
    projectId = projectId,
)

/** A quote with nothing in it — no rooms, no client, no discounts. The autosave collector treats
 *  this as a DELETE rather than a row to write: see [CalculatorViewModel.draftRowCleared]. */
private val EMPTY_DRAFT: CalculatorDraft = CalculatorUiState().toDraft()

/**
 * The subset of [CalculatorDraft] that [CalculatorRepository.saveDraft] actually puts on the
 * wire, joined into one string for [idempotencyKeyFor] to fingerprint. `deliveryCost`/`otherCost`
 * are local-only (`SaveProjectDraftSchema` has no such fields — see [CalculatorDraft]'s own KDoc),
 * and a row's `result` is derived, not input: after a restore every row is briefly re-priced
 * against `DEFAULT_PRICE_CONFIG` until `session.pricing` lands (a coroutine race — see
 * `CalculatorViewModel.init`), so it is momentarily a function of timing rather than what the
 * operator typed. Fingerprinting either would rotate the Idempotency-Key for a reason the server
 * can never see, breaking the one guarantee the key exists to give: the SAME wire content must
 * keep the SAME key across a retry, and changing something the server never receives is not a
 * new submission.
 */
private fun CalculatorDraft.wireFingerprint(): String {
    val rooms = rows.joinToString("|") { r ->
        listOf(
            r.name, r.innerWidth, r.innerLength, r.bearing, r.correction, r.extraBeams,
            r.forceStartBeam, r.patternOverride, r.m2PriceOverride, r.m2PriceOverrideValue, r.m2PriceReason,
        ).joinToString(",")
    }
    return listOf(projectId, clientName, clientPhone, clientAddress, discountPercent, discountAmount, rooms).joinToString(";")
}

@HiltViewModel
class HiltCalculatorViewModel @Inject constructor(
    session: SessionPricing,
    permissions: PermissionGate,
    clients: ClientsRepository,
    repository: CalculatorRepository,
    saved: SavedStateHandle,
) : CalculatorViewModel(
    session = session,
    permissions = permissions,
    clients = clients,
    observeDraft = ObserveDraftUseCase { repository.observeDraft() },
    persistDraft = PersistDraftUseCase { draft -> repository.persistDraft(draft) },
    clearDraftUseCase = ClearDraftUseCase { repository.clearDraft() },
    saveDraftUseCase = SaveDraftUseCase { draft, key -> repository.saveDraft(draft, key) },
    placeOrderUseCase = PlaceOrderUseCase { input, key -> repository.placeOrder(input, key) },
    queuePlaceOrderUseCase = QueuePlaceOrderUseCase { input, key -> repository.queuePlaceOrder(input, key) },
    observeRejectedOrders = ObserveRejectedOrdersUseCase { repository.observeRejectedOrders() },
    discardRejectedOrderUseCase = DiscardRejectedOrderUseCase { id -> repository.discardRejectedOrder(id) },
    saved = saved,
)
