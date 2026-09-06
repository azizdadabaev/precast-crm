package uz.etalon.crm.feature.orders.detail

import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus

sealed interface NextStep {
    data object LoadTruck : NextStep
    data object DeliveryProof : NextStep
    data object ManageShipments : NextStep
    /** The action exists but cannot run right now; [reason] is shown on the bar. */
    data class Blocked(val reason: String) : NextStep
    data object None : NextStep
}

/** Shown on the bar while a photo for this order is still sitting in the outbox. Written here,
 *  not pulled from a string resource, because [nextStepFor] is pure Kotlin the tests exercise
 *  without an Android context. */
internal const val BLOCKED_UPLOADING = "Юборилмоқда…"

/** The statuses on which another loaded photo may still be attached: work has started and the
 *  order has not finished or been called off. */
private val PHOTO_STATUSES = setOf(
    OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.LOADED, OrderStatus.DISPATCHED,
)

/**
 * The single action the cockpit puts under the operator's thumb.
 *
 * Once an order is split across trucks the whole-order LOAD step no longer
 * applies — the server refuses it and each truck advances on its own — so the
 * bar sends the operator to the shipment list instead.
 *
 * A queued upload blocks the bar rather than offering the same action again: the photo the
 * operator took offline has not reached the server yet, so the order still looks un-loaded, and
 * a second tap would enqueue a duplicate that the server rejects with a 422 nobody can act on.
 */
fun nextStepFor(order: OrderDetail, me: Me, pendingUploads: Int): NextStep {
    if (!me.can("order.edit")) return NextStep.None
    val status = order.summary.status
    if (status == OrderStatus.DELIVERED || status == OrderStatus.CANCELED || status == OrderStatus.DRAFT) return NextStep.None
    if (pendingUploads > 0) return NextStep.Blocked(BLOCKED_UPLOADING)
    if (order.shipments.isNotEmpty()) return NextStep.ManageShipments
    return when (status) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> NextStep.LoadTruck
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> NextStep.DeliveryProof
        else -> NextStep.None
    }
}

/** Whether the photo strip offers its "add" tile. Independent of [nextStepFor]: an extra photo is
 *  welcome on a truck that is already loaded or on its way, where the next *step* is something
 *  else entirely. */
fun canAddPhoto(order: OrderDetail, me: Me): Boolean =
    me.can("order.edit") && order.summary.status in PHOTO_STATUSES
