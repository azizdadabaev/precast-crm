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
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.PriceConfig
import uz.etalon.crm.core.calc.SlabRow
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
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.ui.regions.ParsedAddress
import uz.etalon.crm.core.ui.regions.composeAddress
import uz.etalon.crm.core.ui.regions.parseAddress
import java.util.UUID
import javax.inject.Inject

/** `POST /api/orders` (and the draft route behind it) is gated on this — the calculator itself
 *  stays usable without it; see `CalculatorUiState.canWrite`. */
private const val ORDER_CREATE = "order.create"

/** Mirrors `CalculatorRepository.saveDraft`'s own refusal, so the screen never offers an action
 *  the operator cannot perform and the repository never has to be the first to say no. */
private const val NO_PERMISSION_MESSAGE = "Буюртма яратишга рухсат йўқ"

private const val SAVE_SUCCESS_MESSAGE = "Лойиҳа сақланди"

/** How long after any mutation the ViewModel waits before writing the draft to Room — long
 *  enough that a keystroke walk through a room's fields is one write, not one per keystroke. */
private const val AUTOSAVE_DEBOUNCE_MS = 500L

/** The Idempotency-Key in flight and the submission it belongs to — see `saveDraft`'s own doc,
 *  and `RecordPaymentViewModel`'s identical pair for `POST /api/payments`. */
private const val KEY_IDEMPOTENCY = "calc.idempotencyKey"
private const val KEY_IDEMPOTENCY_FOR = "calc.idempotencyFor"

/** `RoomCalcInputBaseSchema.m2PriceReason`'s cap on the server (validation.ts) — `internal` so
 *  `RateOverrideSheet` can enforce the same limit on the reason field it collects. */
internal const val MAX_REASON = 200

/** `normalizePhone` turns exactly nine digits into `998` + those nine — the same figure
 *  `ClientEditViewModel`'s own `LOCAL_PHONE_DIGITS` uses. */
private const val CLIENT_PHONE_DIGITS = 9

/** How long the client bar waits after the ninth digit before asking `findByPhone` — long enough
 *  that a nine-digit phone is one request, not nine; short enough the operator does not notice.
 *  `internal` so the test measures the real figure, mirroring `CLIENT_SEARCH_DEBOUNCE_MS`. */
internal const val CLIENT_PHONE_LOOKUP_DEBOUNCE_MS = 400L

/** A restored room's name follows «Хона N» — this recovers N so a freshly-added room after a
 *  restore never reuses a number already on screen, the same rule `addRoom` keeps for a deleted
 *  room within one session. */
private val ROOM_SEQ_REGEX = Regex("""(\d+)""")

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

/**
 * Rooms, the docked keypad's walk, live pricing and totals for a quote — the state and behaviour
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
            observeDraft().first()?.let { restoreDraft(it) }
            // distinctUntilChanged: a keypad keystroke that does not change the committed value,
            // expandedRowId, saving and saveMessage all touch [_state] without changing what
            // toDraft() would write — none of that belongs in Room. filter: EMPTY_DRAFT is what
            // clearAll leaves behind, and this is the collector that would otherwise re-create the
            // Room row it just deleted the moment its own debounce next elapses — see clearAll's doc.
            _state.map { it.toDraft() }.distinctUntilChanged().filter { it != EMPTY_DRAFT }
                .debounce(AUTOSAVE_DEBOUNCE_MS).collect { draft -> persistDraft(draft) }
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
        _state.update { withTotals(it, it.rows + row) }
    }

    /** Copies every input of [id] into a new row with its own id and the next room name, placed
     *  right after the source. */
    fun duplicateRoom(id: String) {
        val src = _state.value.rows.firstOrNull { it.id == id } ?: return
        val copy = recomputeRow(src.copy(id = UUID.randomUUID().toString(), name = "Хона ${nextRoomSeq++}"), priceConfig)
        _state.update { s ->
            val idx = s.rows.indexOfFirst { it.id == id }
            val newRows = s.rows.toMutableList().apply { add(idx + 1, copy) }
            withTotals(s, newRows)
        }
    }

    /** Removes the room, and — trap the docked keypad and the expanded card would otherwise fall
     *  into — closes the keypad and collapses the card if either was pointed at it. */
    fun deleteRoom(id: String) {
        _state.update { s ->
            val next = withTotals(s, s.rows.filterNot { it.id == id })
            next.copy(
                expandedRowId = next.expandedRowId.takeIf { it != id },
                keypad = next.keypad.takeIf { it?.rowId != id },
                keypadText = if (next.keypad?.rowId == id) "" else next.keypadText,
            )
        }
    }

    /** Reorders only — no row's inputs change, so nothing needs re-running through the engine. */
    fun moveRoom(from: Int, to: Int) {
        _state.update { s ->
            if (from !in s.rows.indices || to !in s.rows.indices) return@update s
            val rows = s.rows.toMutableList()
            rows.add(to, rows.removeAt(from))
            s.copy(rows = rows)
        }
    }

    fun setName(id: String, name: String) = _state.update { s ->
        s.copy(rows = s.rows.map { if (it.id == id) it.copy(name = name) else it })
    }

    /** Opens the keypad on [target] with an empty pad — never prefilled, so every keystroke is
     *  read off [CalculatorUiState.keypadText] alone. */
    fun openKeypad(target: KeypadTarget) = _state.update { it.copy(keypad = target, keypadText = "") }

    fun keypadDigit(c: Char) {
        if (!(c.isDigit() || c == ',')) return
        _state.update { it.copy(keypadText = it.keypadText + c) }
    }

    fun keypadBackspace() = _state.update { it.copy(keypadText = it.keypadText.dropLast(1)) }

    /** Replaces the whole pad text — what the docked [uz.etalon.crm.core.designsystem.components.NumericKeypad]
     *  calls: it applies `applyDigit`/`applyBackspace` itself and hands back the next full string,
     *  unlike [keypadDigit]'s one-character-at-a-time API above. */
    fun setKeypadText(text: String) = _state.update { it.copy(keypadText = text) }

    /** Parses the raw comma string and writes it onto the targeted field. An empty or unparsable
     *  pad commits as `0.0` rather than leaving the field untouched — the same rule the web
     *  calculator's keypad uses. */
    fun commitKeypad() {
        val s = _state.value
        val target = s.keypad ?: return
        val value = s.keypadText.replace(',', '.').toDoubleOrNull() ?: 0.0
        applyToRow(target.rowId) { row ->
            when (target.field) {
                KeypadTarget.Field.WIDTH -> row.copy(innerWidth = value)
                KeypadTarget.Field.LENGTH -> row.copy(innerLength = value)
            }
        }
    }

    /** Commits the field in progress, then walks ЭНИ → БЎЙИ → the next room's ЭНИ, closing the
     *  keypad once the last room's БЎЙИ is passed. */
    fun nextField() {
        commitKeypad()
        val cur = _state.value.keypad ?: return
        val rows = _state.value.rows
        val idx = rows.indexOfFirst { it.id == cur.rowId }
        val target = when (cur.field) {
            KeypadTarget.Field.WIDTH -> KeypadTarget(cur.rowId, KeypadTarget.Field.LENGTH)
            KeypadTarget.Field.LENGTH -> rows.getOrNull(idx + 1)?.let { KeypadTarget(it.id, KeypadTarget.Field.WIDTH) }
        }
        if (target != null) openKeypad(target) else closeKeypad()
    }

    fun closeKeypad() = _state.update { it.copy(keypad = null, keypadText = "") }

    /** Nudges [id]'s width by one step of the currently chosen [Grid], up or down. */
    fun bumpWidth(id: String, up: Boolean) {
        val step = _state.value.grid.step
        applyToRow(id) { row ->
            row.copy(innerWidth = if (up) roundUpToGrid(row.innerWidth, step) else roundDownToGrid(row.innerWidth, step))
        }
    }

    /** Manual extra beams beyond the slab's own pitches — an extras-only room (see
     *  `SlabRow.canPersist`) still prices and still counts in [CalculatorUiState.totals]; only
     *  [CalculatorUiState.unpersistableRoomNames] marks it as unsavable. */
    fun setExtraBeams(id: String, n: Int) = applyToRow(id) { it.copy(extraBeams = n) }

    /** «Қўшимча»'s remaining editable engine inputs — see [SlabRow] for what each one means
     *  geometrically. Every one of these is a plain `updateRow`-then-recompute, same shape as
     *  [setExtraBeams] above. */
    fun setBearing(id: String, v: Double) = applyToRow(id) { it.copy(bearing = v) }
    fun setCorrection(id: String, v: Double) = applyToRow(id) { it.copy(correction = v) }
    fun setForceStartBeam(id: String, on: Boolean) = applyToRow(id) { it.copy(forceStartBeam = on) }
    /** `null` == the web's "Авто": let the engine auto-pick the pattern. */
    fun setPattern(id: String, p: Pattern?) = applyToRow(id) { it.copy(patternOverride = p) }

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
        withTotals(s, newRows)
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
        _state.update {
            it.copy(
                rows = emptyList(), expandedRowId = null, keypad = null, keypadText = "",
                discountMode = DiscountMode.PERCENT, discountPercent = 0.0, discountAmount = 0.0,
                deliveryCost = 0.0, otherCost = 0.0, grid = Grid.CM10,
                totals = projectTotals(emptyList(), 0.0, 0.0),
                orderTotals = computeOrderTotals(emptyList(), 0.0, 0.0, 0.0, 0.0),
                schedule = emptyList(), error = null,
                clientPhoneDigits = "", clientName = "", clientAddress = ParsedAddress("", "", ""),
                matchedClientId = null, clientLookupError = null, clientBarCollapsed = false,
                projectId = null, saveMessage = null, saving = false,
            )
        }
        viewModelScope.launch { clearDraftUseCase() }
    }

    // ── draft persistence and «Лойиҳани сақлаш» ─────────────────────

    fun dismissSaveMessage() = _state.update { it.copy(saveMessage = null) }

    /**
     * Refuses without `order.create` and refuses when any row is not `SlabRow.canPersist` — both
     * checks mirror `CalculatorRepository.saveDraft`'s own, so a save that would 422 never leaves
     * the device. [SavedStateHandle]-pinned [idempotencyKeyFor] keeps the same Idempotency-Key
     * across a retry of one submission (a dropped response, a 409 `IDEMPOTENT_IN_PROGRESS`) and
     * mints a new one only once the draft's own content changes — the same rule
     * `RecordPaymentViewModel.idempotencyKeyFor` follows for `POST /api/payments`.
     */
    fun saveDraft() {
        val s = _state.value
        if (s.saving) return
        if (!s.canWrite) {
            _state.update { it.copy(error = NO_PERMISSION_MESSAGE) }
            return
        }
        val blocked = s.unpersistableRoomNames
        if (blocked.isNotEmpty()) {
            _state.update { it.copy(error = "Сақлаб бўлмайдиган хоналар: " + blocked.joinToString(", ")) }
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
                        val withId = draft.copy(projectId = id)
                        persistDraft(withId)
                        _state.update { it.copy(saving = false, projectId = id, saveMessage = SAVE_SUCCESS_MESSAGE) }
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

    /** The Idempotency-Key for ONE submission — see [saveDraft]'s own doc. */
    private fun idempotencyKeyFor(draft: CalculatorDraft): String {
        val fingerprint = draft.toString()
        if (saved.get<String>(KEY_IDEMPOTENCY_FOR) != fingerprint) {
            saved[KEY_IDEMPOTENCY_FOR] = fingerprint
            saved[KEY_IDEMPOTENCY] = UUID.randomUUID().toString()
        }
        return requireNotNull(saved.get<String>(KEY_IDEMPOTENCY))
    }

    /** Applies a restored draft to state, recomputing every row through the current
     *  [priceConfig] the same way a freshly-typed room is — the persisted snapshot never carries
     *  a `SlabResult`. Runs once, in `init`, before the operator's first keystroke can race it. */
    private fun restoreDraft(draft: CalculatorDraft) {
        val rows = draft.rows.map { recomputeRow(it, priceConfig) }
        nextRoomSeq = (rows.mapNotNull { ROOM_SEQ_REGEX.find(it.name)?.value?.toIntOrNull() }.maxOrNull() ?: 0) + 1
        val address = parseAddress(draft.clientAddress)
        val digits = draft.clientPhone.takeLast(CLIENT_PHONE_DIGITS)
        _state.update { s ->
            withTotals(
                s.copy(
                    clientPhoneDigits = digits, clientName = draft.clientName, clientAddress = address,
                    clientBarCollapsed = digits.length == CLIENT_PHONE_DIGITS && draft.clientName.isNotBlank(),
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

    fun setClientName(v: String) = updateClientState { it.copy(clientName = v) }
    fun setClientViloyat(v: String) = updateClientState { s -> s.copy(clientAddress = s.clientAddress.copy(viloyat = v)) }
    fun setClientTuman(v: String) = updateClientState { s -> s.copy(clientAddress = s.clientAddress.copy(tuman = v)) }
    fun setClientStreet(v: String) = updateClientState { s -> s.copy(clientAddress = s.clientAddress.copy(street = v)) }

    /** The pencil on the collapsed line. Reopens without blanking anything — [reopenClientBar]
     *  only ever clears the collapse flag, never the phone/name/address it is showing. */
    fun reopenClientBar() = _state.update { it.copy(clientBarCollapsed = false) }

    /**
     * A phone and a name both present is a rising EDGE, not a level: it fires [transform] and
     * then collapses the bar only the moment that condition newly becomes true, never on every
     * update while it stays true. That is what lets the pencil's reopen stick — editing a field
     * (the name, the address) while the phone stays complete never re-crosses the edge, so it
     * cannot snap shut again under the operator's fingers. It re-fires only if the phone is edited
     * back below nine digits and then completed again.
     */
    private fun updateClientState(transform: (CalculatorUiState) -> CalculatorUiState) {
        _state.update { s ->
            val wasReady = clientReady(s)
            val next = transform(s)
            if (!wasReady && clientReady(next)) next.copy(clientBarCollapsed = true) else next
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

/** What `clearAll` leaves behind — the autosave collector filters this out so the empty draft it
 *  produces is never written back to Room, re-creating the row `clearAll` just deleted. */
private val EMPTY_DRAFT: CalculatorDraft = CalculatorUiState().toDraft()

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
    saved = saved,
)
