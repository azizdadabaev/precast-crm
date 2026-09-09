package uz.etalon.crm.feature.calculator

import uz.etalon.crm.core.calc.BeamScheduleLine
import uz.etalon.crm.core.calc.OrderTotals
import uz.etalon.crm.core.calc.ProjectTotals
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.ui.regions.ParsedAddress

/** The width/length bump step, in metres — see `CalculatorViewModel.bumpWidth`. */
enum class Grid(val step: Double) { CM10(0.1), CM5(0.05) }

/** Whether the project-level discount is entered as a percentage of the rooms' subtotal or a flat
 *  UZS amount — mutually exclusive, mirroring `projectTotal`'s own `discountAmountOverride` rule. */
enum class DiscountMode { PERCENT, AMOUNT }

/** Which numeric field the docked keypad is pointed at. */
data class KeypadTarget(val rowId: String, val field: Field) {
    enum class Field { WIDTH, LENGTH }
}

/**
 * Everything the calculator screen renders. No `Double` money field lives here on purpose: every
 * figure the UI shows as money is read off a row's `SlabRow.result` or off [totals] through
 * `SlabResult.money()` / `ProjectTotal.money()` at the render site — see `CalculatorViewModel`'s
 * class doc for why a `Double` money field on this class would be a defect.
 */
data class CalculatorUiState(
    val rows: List<SlabRow> = emptyList(),
    val expandedRowId: String? = null,
    val keypad: KeypadTarget? = null,
    val keypadText: String = "",
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
    /** Collapses the bar to one line once a phone and a name are both present — see
     *  `CalculatorViewModel.updateClientState`. The pencil on the collapsed line reopens it. */
    val clientBarCollapsed: Boolean = false,

    // ── draft persistence and «Лойиҳани сақлаш» ─────────────────────
    /** Null until the first successful save; from then on a second save updates this project
     *  instead of creating a duplicate one. Restored from the Room draft, so it survives process
     *  death the same way the rest of the quote does. */
    val projectId: String? = null,
    val saving: Boolean = false,
    /** A transient Uzbek confirmation shown after a successful save — cleared by
     *  `CalculatorViewModel.dismissSaveMessage` once the screen has shown it. */
    val saveMessage: String? = null,
) {
    val totalWeightKg: Double get() = totals.monolithArea * KG_PER_M2

    /** Rooms the engine priced but `SaveProjectDraftSchema`/`PlaceOrderSchema` would reject on
     *  save — an extras-only room, see `SlabRow.canPersist`. Named, not dropped: [totals] still
     *  counts them, and it is on the next screen to block save and point at these names. */
    val unpersistableRoomNames: List<String> get() = rows.filter { it.result != null && !it.canPersist }.map { it.name }
}

const val KG_PER_M2 = 180.0
