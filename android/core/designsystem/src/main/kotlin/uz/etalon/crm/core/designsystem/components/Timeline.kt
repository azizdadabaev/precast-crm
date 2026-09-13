package uz.etalon.crm.core.designsystem.components

import androidx.annotation.StringRes
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.ui.format.formatDate

/** One column of the «Етказиш» card. [labelRes] rather than a string so this stays pure Kotlin
 *  the tests exercise without an Android context — the screen resolves it. */
data class StepSpec(@StringRes val labelRes: Int, val caption: String?, val state: StepState)

private const val CHECK = "✓"

/** The whole-order load event. Its twin in `:feature:orders`' own `EventLabels` names the same
 *  wire type for the event FEED; this copy is the one [timelineFor] reads, and the two cannot be
 *  shared because each is `internal` to its own module. */
private const val ORDER_LOADED = "ORDER_LOADED"

/** A split order's per-truck delivery — the last of them dates step three when nothing else does. */
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
 *
 * Each step's caption is the DATE it happened where the order knows one and a check where it does
 * not — the order's own `loadedAt`/`deliveredAt` first, then its events, then its shipments. A
 * check is not a failure: a split order that was never stamped at the order level genuinely has no
 * single instant for «Юкланди», and a date invented from the nearest event would be a claim about
 * a lorry nobody made.
 *
 * Ruling R13 moved it here from `:feature:orders`, beside the [StepTimeline] it feeds: the Dispatch
 * screen in `:feature:logistics` draws these same three columns over its form, and one feature
 * module may not reach into another to do it.
 */
fun timelineFor(o: OrderDetail): List<StepSpec> {
    val s = o.summary.status
    val rank = when (s) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> 0
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> 1
        OrderStatus.DELIVERED -> 2
        else -> -1 // DRAFT, CANCELED, UNKNOWN
    }
    // When the load happened. The order's OWN stamp first — `Order.loadedAt`, what the single-truck
    // load flow writes, and the only one of the three that is the order's own fact rather than a
    // trace of it. Then the whole-order event, for a row stamped before that column existed.
    // Otherwise the FIRST truck to be loaded, which is when the order started going on lorries.
    val loadedAt = o.loadedAt
        ?: o.events.filter { it.type == ORDER_LOADED }.minOfOrNull { it.createdAt }
        ?: o.shipments.mapNotNull { it.loadedAt }.minOrNull()
    // …and when it arrived: `Order.deliveredAt` where the server set it, otherwise the LAST truck
    // to be signed for, since the order is delivered when the last of it is.
    val deliveredAt = o.deliveredAt
        ?: o.shipments.mapNotNull { it.deliveredAt }.maxOrNull()
        ?: o.events.filter { it.type == SHIPMENT_DELIVERED }.maxOfOrNull { it.createdAt }
    val dates = listOf(o.summary.placedAt, loadedAt, deliveredAt)
    val labels = listOf(R.string.ds_step_placed, R.string.ds_step_loaded, R.string.ds_step_delivered)
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
