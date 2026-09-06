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

/** Shown once the server has rejected a queued photo. Distinct from [BLOCKED_UPLOADING] so the bar
 *  never claims a send is still in progress while the banner above it reports the failure. */
internal const val BLOCKED_FAILED = "Юборилмади"

/**
 * The statuses on which another loaded photo may be attached.
 *
 * These mirror the server's `canAddLoadedPhoto` (precast-crm/src/lib/loaded-photos.ts): the FIRST
 * truck photo goes through /load, which performs the PLACED→LOADED transition, so
 * POST /orders/{id}/loaded-photos refuses anything earlier with a 422 ("Order must be loaded
 * first"). Offering the tile before LOADED would queue a photo that can never land, and the
 * permanently failed row would then block this order's action bar.
 */
private val PHOTO_STATUSES = setOf(
    OrderStatus.LOADED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED,
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
 *
 * [pendingUploads] counts only the rows still on their way. A row the server has already rejected
 * is counted by [failedUploads] instead and blocks with its own wording — a bar reading "sending"
 * directly under a banner reading "failed" tells the operator two different stories. Both block:
 * the rejected row is still in the queue, so the way out is the banner's retry or cancel, never a
 * second copy of the same action.
 */
fun nextStepFor(order: OrderDetail, me: Me, pendingUploads: Int, failedUploads: Int = 0): NextStep {
    if (!me.can("order.edit")) return NextStep.None
    val status = order.summary.status
    if (status == OrderStatus.DELIVERED || status == OrderStatus.CANCELED || status == OrderStatus.DRAFT) return NextStep.None
    if (failedUploads > 0) return NextStep.Blocked(BLOCKED_FAILED)
    if (pendingUploads > 0) return NextStep.Blocked(BLOCKED_UPLOADING)
    if (order.shipments.isNotEmpty()) return NextStep.ManageShipments
    return when (status) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> NextStep.LoadTruck
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> NextStep.DeliveryProof
        else -> NextStep.None
    }
}

/** Whether the photo strip offers its "add" tile. Independent of [nextStepFor]: an extra photo is
 *  welcome on a truck that is already loaded, on its way, or delivered — statuses where the next
 *  *step* is something else entirely, or nothing at all. See [PHOTO_STATUSES] for why the set is
 *  narrower than "the order is live". */
fun canAddPhoto(order: OrderDetail, me: Me): Boolean =
    me.can("order.edit") && order.summary.status in PHOTO_STATUSES
