package uz.etalon.crm.feature.calculator

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import java.util.UUID
import javax.inject.Inject

/** `POST /api/orders` (and the draft route behind it) is gated on this — the calculator itself
 *  stays usable without it; see `CalculatorUiState.canWrite`. */
private const val ORDER_CREATE = "order.create"

/** `RoomCalcInputBaseSchema.m2PriceReason`'s cap on the server (validation.ts) — `internal` so
 *  `RateOverrideSheet` can enforce the same limit on the reason field it collects. */
internal const val MAX_REASON = 200

/**
 * Rooms, the docked keypad's walk, live pricing and totals for a quote — the state and behaviour
 * behind the calculator screen, with no Compose in it: the screen (a later task) is built on top
 * of this and must be able to drive it from plain JUnit.
 *
 * [session] and [permissions] are taken directly rather than wrapped in a use-case fun interface
 * the way `ClientsViewModel`/`HomeViewModel` wrap their repositories: both are already narrow,
 * already-fakeable abstractions (see [SessionPricing], [PermissionGate]), so a second layer of
 * indirection here would buy nothing.
 *
 * `:core:calc` is a `Double` engine on purpose (bit-parity with the server's TS engine); this
 * class holds that `Double` state for live recompute, but never exposes a `Double` as money —
 * `SlabResult.money()` / `ProjectTotal.money()` do that conversion at the render site, not here.
 */
@HiltViewModel
class CalculatorViewModel @Inject constructor(
    private val session: SessionPricing,
    private val permissions: PermissionGate,
) : ViewModel() {

    private var priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG

    /** Only ever increases — see `addRoom`'s doc for why a deleted room's number is never reused. */
    private var nextRoomSeq = 1

    private val _state = MutableStateFlow(CalculatorUiState())
    val state: StateFlow<CalculatorUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val canWrite = permissions.can(ORDER_CREATE)
            _state.update { it.copy(canWrite = canWrite) }
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

    /** Back to a blank quote. `canWrite` is left alone — it is resolved from the session, not part
     *  of the calculator's own data — and `nextRoomSeq` is left alone too, for the same reason
     *  deleting a room never reuses its number. */
    fun clearAll() = _state.update {
        it.copy(
            rows = emptyList(), expandedRowId = null, keypad = null, keypadText = "",
            discountMode = DiscountMode.PERCENT, discountPercent = 0.0, discountAmount = 0.0,
            deliveryCost = 0.0, otherCost = 0.0, grid = Grid.CM10,
            totals = projectTotals(emptyList(), 0.0, 0.0),
            orderTotals = computeOrderTotals(emptyList(), 0.0, 0.0, 0.0, 0.0),
            schedule = emptyList(), error = null,
        )
    }

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
