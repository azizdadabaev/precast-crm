package uz.etalon.crm.feature.calculator

import uz.etalon.crm.core.calc.BeamScheduleLine
import uz.etalon.crm.core.calc.ProjectTotals
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.projectTotals

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
    val schedule: List<BeamScheduleLine> = emptyList(),
    val canWrite: Boolean = false,          // order.create
    val error: String? = null,
) {
    val totalWeightKg: Double get() = totals.monolithArea * KG_PER_M2

    /** Rooms the engine priced but `SaveProjectDraftSchema`/`PlaceOrderSchema` would reject on
     *  save — an extras-only room, see `SlabRow.canPersist`. Named, not dropped: [totals] still
     *  counts them, and it is on the next screen to block save and point at these names. */
    val unpersistableRoomNames: List<String> get() = rows.filter { it.result != null && !it.canPersist }.map { it.name }
}

const val KG_PER_M2 = 180.0
