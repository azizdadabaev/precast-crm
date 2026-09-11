package uz.etalon.crm.feature.orders.detail

import androidx.annotation.StringRes
import uz.etalon.crm.core.designsystem.components.StepState
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.feature.orders.R

/** One column of the «Етказиш» card. [labelRes] rather than a string so this stays pure Kotlin
 *  the tests exercise without an Android context — the screen resolves it. */
data class StepSpec(@StringRes val labelRes: Int, val caption: String?, val state: StepState)

private const val CHECK = "✓"

/**
 * The «Етказиш» card's four columns. CURRENT is the step the order is on; everything before it is
 * DONE with a date where the model has one and a check where it does not. A CANCELED order is on
 * no step.
 *
 * IN_PRODUCTION and LOADED share step 1: the model distinguishes them, the prototype's four
 * columns do not, and «Ишлаб чиқ.» is true of both (a loaded truck has been made).
 */
fun timelineFor(o: OrderDetail): List<StepSpec> {
    val s = o.summary.status
    val rank = when (s) {
        OrderStatus.PLACED -> 0
        OrderStatus.IN_PRODUCTION, OrderStatus.LOADED -> 1
        OrderStatus.DISPATCHED -> 2
        OrderStatus.DELIVERED -> 3
        else -> -1 // DRAFT, CANCELED, UNKNOWN
    }
    // The whole-order dispatch where there is one; otherwise the last truck to leave, which is
    // when a split order is actually on its way.
    val dispatchedAt = o.dispatch?.dispatchedAt ?: o.shipments.mapNotNull { it.dispatchedAt }.maxOrNull()
    val deliveredAt = o.shipments.mapNotNull { it.deliveredAt }.maxOrNull()
    // Step 1 has no date of its own: the model records no "production started" instant, so a
    // reached step-1 shows the check instead.
    val dates = listOf(o.summary.placedAt, null, dispatchedAt, deliveredAt)
    val labels = listOf(R.string.step_placed, R.string.step_production, R.string.step_dispatched, R.string.step_delivered)
    return labels.mapIndexed { i, label ->
        val state = when {
            rank < 0 -> StepState.UPCOMING
            // A DELIVERED order is finished, not "on" its last step, so step 3 is DONE too and
            // nothing is CURRENT — which is what the capture's «Етказилди» with a date shows.
            i < rank || (s == OrderStatus.DELIVERED && i == 3) -> StepState.DONE
            i == rank -> StepState.CURRENT
            else -> StepState.UPCOMING
        }
        val caption = when (state) {
            StepState.UPCOMING -> null
            else -> dates[i]?.let(::formatDate) ?: CHECK
        }
        StepSpec(label, caption, state)
    }
}
