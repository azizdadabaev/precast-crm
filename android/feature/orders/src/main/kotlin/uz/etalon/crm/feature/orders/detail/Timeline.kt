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

/** The whole-order load: one photo, one status change. A split order writes `SHIPMENT_LOADED`
 *  per truck instead, which is why the shipments' own `loadedAt` is the fallback. */
private const val ORDER_LOADED = "ORDER_LOADED"

/** A split order's per-truck delivery. A whole-order delivery writes `STATUS_CHANGED` with the
 *  new status in a `payload` this client does not carry, so that case falls through to the check. */
private const val SHIPMENT_DELIVERED = "SHIPMENT_DELIVERED"

/**
 * The «Етказиш» card's three columns: «Буюртма» → «Юкланди» → «Етказилди».
 *
 * Three, not four, because that is what the deal actually has — the web's own ЖАРАЁН chips
 * (`orders/[id]/page.tsx`: PLACED «Қабул қилинди», LOADED «Юкланди», DELIVERED «Етказилди») are
 * the same three, and a phone that draws a fourth column tells a story the desk does not. The two
 * that went are the ones the operator could never act on: «Ишлаб чиқ.» had no instant on the model
 * to date it with, and «Йўлда» split the loaded truck's single fact in two.
 *
 * So IN_PRODUCTION sits with PLACED on step 1, and DISPATCHED sits with LOADED on step 2: a truck
 * that has left is a truck that was loaded, and the dispatch itself is drawn by the card's own
 * «Ҳайдовчи» footer and by the shipments card. CURRENT is the step the order is on; everything
 * before it is DONE with a date where the model has one and a check where it does not. A CANCELED
 * or DRAFT order is on no step at all.
 *
 * Reaching a step is not this function's business: step 2 needs a truck photo and step 3 needs the
 * delivery proof, both enforced by the flows that move the status. The timeline only states where
 * the order got to.
 */
fun timelineFor(o: OrderDetail): List<StepSpec> {
    val s = o.summary.status
    val rank = when (s) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> 0
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> 1
        OrderStatus.DELIVERED -> 2
        else -> -1 // DRAFT, CANCELED, UNKNOWN
    }
    // When the load happened. The whole-order event where there is one; otherwise the FIRST truck
    // to be loaded, which is when the order started going on lorries.
    val loadedAt = o.events.filter { it.type == ORDER_LOADED }.minOfOrNull { it.createdAt }
        ?: o.shipments.mapNotNull { it.loadedAt }.minOrNull()
    // …and when it arrived: the LAST truck to be signed for, since the order is delivered when the
    // last of it is.
    val deliveredAt = o.shipments.mapNotNull { it.deliveredAt }.maxOrNull()
        ?: o.events.filter { it.type == SHIPMENT_DELIVERED }.maxOfOrNull { it.createdAt }
    val dates = listOf(o.summary.placedAt, loadedAt, deliveredAt)
    val labels = listOf(R.string.step_placed, R.string.step_loaded, R.string.step_delivered)
    return labels.mapIndexed { i, label ->
        val state = when {
            rank < 0 -> StepState.UPCOMING
            // A DELIVERED order is finished, not "on" its last step, so step 3 is DONE too and
            // nothing is CURRENT — the capture's «Етказилди» with a date.
            i < rank || (s == OrderStatus.DELIVERED && i == 2) -> StepState.DONE
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
