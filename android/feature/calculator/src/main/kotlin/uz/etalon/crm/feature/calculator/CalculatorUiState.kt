package uz.etalon.crm.feature.calculator

import uz.etalon.crm.core.calc.BeamScheduleLine
import uz.etalon.crm.core.calc.Calc
import uz.etalon.crm.core.calc.OrderTotals
import uz.etalon.crm.core.calc.ProjectTotals
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.math.BigDecimal
import java.math.RoundingMode

/** The width/length bump step, in metres — see `CalculatorViewModel.bumpWidth`. */
enum class Grid(val step: Double) { CM10(0.1), CM5(0.05) }

/** Whether the project-level discount is entered as a percentage of the rooms' subtotal or a flat
 *  UZS amount — mutually exclusive, mirroring `projectTotal`'s own `discountAmountOverride` rule. */
enum class DiscountMode { PERCENT, AMOUNT }

/**
 * What the operator has TYPED into one room's four numeric cells, verbatim, before it is a number.
 *
 * The engine's [SlabRow] holds `Double`s and nothing else, so it cannot represent a half-typed
 * «5,» — round-tripping the double back into the cell would erase the separator the instant it
 * was typed and make the decimal unreachable. The text is therefore the cell's source of truth
 * while the operator is in it, and the double is derived from it on every keystroke
 * ([parseDecimal]); an unparsable or blank cell prices as `0.0` and keeps its text.
 *
 * Held in memory only — never persisted. A room restored from the Room draft derives its texts
 * back from the doubles ([draftOf]), so «5,20» rather than the «5,2» that was typed.
 */
data class RoomDraft(
    val width: String = "",
    val length: String = "",
    val bearing: String = DEFAULT_BEARING_TEXT,
    val correction: String = "0",
)

/** [Calc.DEFAULT_BEARING] as the bearing cell shows it — the text a room starts with. */
private val DEFAULT_BEARING_TEXT: String = dimensionText(Calc.DEFAULT_BEARING)

/** A rate the operator picked in the rate sheet that is NOT the one the engine would pick, held
 *  while `RateConfirm` collects the mandatory reason — see `CalculatorViewModel.pickRate` for why
 *  the auto-equal tier never gets here. */
data class RateConfirmState(val rowId: String, val price: Double)

/**
 * The ONE text → `Double` boundary in the calculator. `,` and `.` are both accepted (the system
 * decimal keyboard emits whichever the device's locale gives it); anything else — a blank cell, a
 * sign, a stray letter, two separators — is `null`, which the caller prices as `0.0` without
 * touching the text.
 *
 * A trailing separator parses: «5,» is 5.0 while the operator is still mid-number, so the row
 * prices off the 5 it already has rather than dropping to 0 for one keystroke.
 */
fun parseDecimal(text: String): Double? {
    if (text.isEmpty()) return null
    if (text.any { !(it.isDigit() || it == ',' || it == '.') }) return null
    return text.replace(',', '.').toDoubleOrNull()
}

/** What a numeric cell will accept as it is typed: digits and AT MOST one separator, always shown
 *  as the comma (D8's decimal mark). A trailing separator survives — dropping it would make «5,»
 *  un-typable, and with it every decimal. */
internal fun filterDecimalText(text: String): String {
    val out = StringBuilder(text.length)
    var separator = false
    for (c in text) {
        when {
            c.isDigit() -> out.append(c)
            (c == ',' || c == '.') && !separator -> { separator = true; out.append(',') }
        }
    }
    return out.toString()
}

/** A metre value as a cell shows it: two decimals, decimal comma, no grouping — a room dimension
 *  never reaches four digits, and the thin space `formatDecimal` groups with is not typable back. */
internal fun dimensionText(v: Double): String =
    BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',')

/** The cell texts a room restored from the persisted draft shows. Zero is a BLANK width/length —
 *  «0,00» in the cell would read as a dimension the operator had entered — while the bearing and
 *  the correction keep their own defaults, which is what [RoomDraft]'s own defaults say. */
internal fun draftOf(row: SlabRow): RoomDraft = RoomDraft(
    width = if (row.innerWidth > 0.0) dimensionText(row.innerWidth) else "",
    length = if (row.innerLength > 0.0) dimensionText(row.innerLength) else "",
    bearing = dimensionText(row.bearing),
    correction = if (row.correction == 0.0) "0" else dimensionText(row.correction),
)

/**
 * Everything the calculator screen renders. No `Double` money field lives here on purpose: every
 * figure the UI shows as money is read off a row's `SlabRow.result` or off [totals] through
 * `SlabResult.money()` / `ProjectTotal.money()` at the render site — see `CalculatorViewModel`'s
 * class doc for why a `Double` money field on this class would be a defect.
 *
 * The one carve-out is [RateConfirmState.price] in [rateConfirm]: it is not an amount this class
 * computed but a catalogue TIER, echoed back verbatim from `M2_OVERRIDE_TIERS` (whose own prices
 * are `Double` because the engine's `PriceConfig` is) on its way to `SlabRow.m2PriceOverrideValue`
 * — the same `Double` the wire carries. It becomes `Money` for display at `tierPriceMoney`, the
 * sanctioned boundary, and is never added to anything here.
 */
data class CalculatorUiState(
    val rows: List<SlabRow> = emptyList(),
    val expandedRowId: String? = null,
    /** Keyed by [SlabRow.id] — what is in each room's cells right now. A row with no entry has
     *  never been typed into and shows [RoomDraft]'s defaults. */
    val drafts: Map<String, RoomDraft> = emptyMap(),
    /** A non-auto rate waiting on its mandatory reason — see [RateConfirmState]. */
    val rateConfirm: RateConfirmState? = null,
    val discountMode: DiscountMode = DiscountMode.PERCENT,
    val discountPercent: Double = 0.0,
    val discountAmount: Double = 0.0,
    val deliveryCost: Double = 0.0,
    val otherCost: Double = 0.0,
    val grid: Grid = Grid.CM10,
    val totals: ProjectTotals = projectTotals(emptyList(), 0.0, 0.0),
    // The order-PLACEMENT roll-up — the sheet's headline number. Distinct from [totals]'s own
    // `projTotal`: that one never includes delivery/other and rounds at three internal points
    // (see `OrderTotals.kt`'s class doc for why the two must not be conflated).
    val orderTotals: OrderTotals = computeOrderTotals(emptyList(), 0.0, 0.0, 0.0, 0.0),
    val schedule: List<BeamScheduleLine> = emptyList(),
    val canWrite: Boolean = false,          // order.create
    val error: String? = null,

    // ── The client bar: who the quote is for — see `ClientBar.kt` and
    // `CalculatorViewModel`'s client-bar section. ──
    /** The NINE local digits only, exactly like `ClientEditState.phoneDigits` — the `+998` the
     *  bar shows is display-only. */
    val clientPhoneDigits: String = "",
    val clientName: String = "",
    val clientAddress: ParsedAddress = ParsedAddress("", "", ""),
    /** Set once `findByPhone` finds this exact number already on file — cleared the moment the
     *  phone is edited away from that match, since it no longer names the same customer. */
    val matchedClientId: String? = null,
    /** A failed lookup, shown as a retryable banner. Never blocks typing — only a real answer
     *  (hit or miss) clears it. */
    val clientLookupError: String? = null,
    /** Whether the full client FORM is showing rather than the one-line row. Open while the phone
     *  or the name is still missing, closed the moment both are on file, and toggled by hand with
     *  the chevron — see `CalculatorViewModel.updateClientState` and `toggleClientForm`. */
    val clientFormOpen: Boolean = true,

    // ── draft persistence and «Лойиҳани сақлаш» ─────────────────────
    /** Null until the first successful save; from then on a second save updates this project
     *  instead of creating a duplicate one. Restored from the Room draft, so it survives process
     *  death the same way the rest of the quote does. */
    val projectId: String? = null,
    /** True once the persisted draft has been looked for — whether or not there was one. The
     *  screen's «start with one blank room» rule (R8) waits on it: asked on the first composition
     *  instead, it would add a room that the draft then lands beside, and the operator would find
     *  their restored quote with a stray empty card in it. */
    val restored: Boolean = false,
    val saving: Boolean = false,
    /** A transient Uzbek confirmation shown after a successful save — cleared by
     *  `CalculatorViewModel.dismissSaveMessage` once the screen has shown it. */
    val saveMessage: String? = null,
    /** The same confirmation as a TOAST, which is where the restyled screen shows it — cleared by
     *  `CalculatorViewModel.dismissToast`. [saveMessage] stays the field the queued-placement
     *  notice is read from: that one is a banner on the placement sheet, not a toast. */
    val toast: String? = null,

    // ── «Буюртма бериш» — see `PlaceOrderSheet.kt` ──────────────────
    val placing: Boolean = false,
    /** True once a placement failed for want of a signal — the sheet then offers «Навбатга қўйиш»
     *  instead of a bare retry. Only a network failure sets it: a 422 is the server saying no, and
     *  queueing that same body would only fail again hours later. */
    val queueOffered: Boolean = false,
    /** Set once, after a successful ONLINE placement, for the route to navigate with — cleared by
     *  `CalculatorViewModel.consumePlacedOrder` so a recomposition cannot navigate twice. */
    val placedOrderId: String? = null,
    /** Orders the server permanently refused while they sat in the queue. By then the quote has
     *  been cleared, so this list is the only place the operator can learn it happened — see
     *  `CalculatorRepository.observeRejectedOrders`. */
    val rejectedOrders: List<RejectedOrder> = emptyList(),
) {
    val totalWeightKg: Double get() = totals.monolithArea * KG_PER_M2

    /** Rooms the engine priced but `SaveProjectDraftSchema`/`PlaceOrderSchema` would reject on
     *  save — an extras-only room, see `SlabRow.canPersist`. Named, not dropped: [totals] still
     *  counts them, and it is on the next screen to block save and point at these names. */
    val unpersistableRoomNames: List<String> get() = rows.filter { it.result != null && !it.canPersist }.map { it.name }

    /** What [id]'s cells show — [RoomDraft]'s defaults for a room nobody has typed into yet. */
    fun draft(id: String): RoomDraft = drafts[id] ?: RoomDraft()
}

/** Same rule of thumb as [uz.etalon.crm.core.model.ORDER_KG_PER_M2], for the calculator's
 *  in-progress (not-yet-an-order) Double totals. */
const val KG_PER_M2 = 180.0
