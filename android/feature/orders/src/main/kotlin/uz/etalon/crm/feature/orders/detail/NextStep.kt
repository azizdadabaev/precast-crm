package uz.etalon.crm.feature.orders.detail

import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.SHIPMENT_CREATE_STATUSES

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
    // Every action behind this branch — loading a truck, dispatching it, delivering it, deleting
    // it — is wrapped in withPermission("dispatch.create") on the server, and ROLE_TEMPLATES.SALES
    // (the largest operator role) has order.edit WITHOUT it. Offering the split path to that
    // operator walks them through shooting a photo and counting beams for a 403 they cannot act on.
    if (order.shipments.isNotEmpty()) return if (me.can(DISPATCH_CREATE)) NextStep.ManageShipments else NextStep.None
    return when (status) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> NextStep.LoadTruck
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> NextStep.DeliveryProof
        else -> NextStep.None
    }
}

/** The permission every shipment and dispatch route is wrapped in server-side. Not `order.edit`:
 *  the two are granted separately and a SALES operator holds only the latter. */
internal const val DISPATCH_CREATE = "dispatch.create"

/**
 * Whether the shipments section is a door rather than a read-only summary — the one entry point to
 * the split-truck flow, including creating an order's FIRST shipment, which Android otherwise had
 * no way to do at all (the web app has a dedicated button for it).
 *
 * Two conditions, both taken from the server. The permission is the same one every shipment route
 * is wrapped in. The status set is what `POST /api/orders/{id}/shipments` accepts — offering the
 * door on, say, a LOADED order would only produce a 422.
 */
fun canOpenShipments(order: OrderDetail, me: Me): Boolean =
    me.can(DISPATCH_CREATE) &&
        (order.shipments.isNotEmpty() || order.summary.status in SHIPMENT_CREATE_STATUSES)

/** Whether the photo strip offers its "add" tile. Independent of [nextStepFor]: an extra photo is
 *  welcome on a truck that is already loaded, on its way, or delivered — statuses where the next
 *  *step* is something else entirely, or nothing at all. See [PHOTO_STATUSES] for why the set is
 *  narrower than "the order is live". */
fun canAddPhoto(order: OrderDetail, me: Me): Boolean =
    me.can("order.edit") && order.summary.status in PHOTO_STATUSES

/** The permission `POST /api/payments` is wrapped in, server-side. Deliberately not `order.edit`:
 *  ROLE_TEMPLATES.DRIVER holds this and nothing else that writes. */
internal const val PAYMENT_RECORD = "payment.record"

/**
 * Whether the payments card offers the record-a-payment door.
 *
 * The two status refusals are the server's own (`POST /api/payments`): a CANCELED order, and a
 * DELIVERED order that is already FULLY_PAID. Offering the door there would walk an operator
 * through the whole form — amount, method, receipt photos — for a 422 they cannot act on.
 *
 * The amount cap is deliberately NOT checked here. It is `recordableRemaining`, which moves every
 * time a payment lands in the confirmation queue, and the record screen already shows it and
 * refuses to submit above it; hiding the door on a cap of zero would leave an operator with a
 * pending payment no way to see why.
 */
fun canRecordPayment(order: OrderDetail, me: Me): Boolean {
    if (!me.can(PAYMENT_RECORD)) return false
    val s = order.summary
    if (s.status == OrderStatus.CANCELED) return false
    return !(s.status == OrderStatus.DELIVERED && s.paymentState == PaymentState.FULLY_PAID)
}

/** What the sticky bar does with «Тўлов қайд қилиш» — see [paymentDoorFor]. */
sealed interface PaymentDoor {
    /** Offered, and the server will accept something. */
    data object Open : PaymentDoor

    /** Offered but greyed: money is still owed and every som of it is already awaiting
     *  confirmation, so the server's cap is zero. [pending] is that queued sum — the composable
     *  turns it into the sentence, because this file stays free of an Android `Context`. */
    data class Blocked(val pending: Money) : PaymentDoor

    /** Not offered at all — this role, or this order's lifecycle, has no payment to record. */
    data object Hidden : PaymentDoor
}

/**
 * Spec §5.1a's hide-vs-disable rule applied to the payment door.
 *
 * A refusal that belongs to the role or to the lifecycle **hides** the button: a DRIVER without
 * `payment.record`, a canceled order, a delivered order already settled — nothing an operator can
 * do here, and a greyed button would only invite tapping.
 *
 * A refusal that is merely true *right now* **disables with a reason**. There is exactly one:
 * `recordableRemaining` is zero (`POST /api/payments` would 422) while `remaining` is not, i.e.
 * the whole outstanding balance is sitting in the confirmation queue. Hiding the door there would
 * leave the operator who just recorded that payment with no explanation of where it went; a
 * missing button reads as a bug, a greyed one with a sentence teaches.
 */
fun paymentDoorFor(order: OrderDetail, me: Me): PaymentDoor = when {
    !canRecordPayment(order, me) -> PaymentDoor.Hidden
    order.recordableRemaining.isZero && !order.remaining.isZero -> PaymentDoor.Blocked(order.pendingAmount)
    else -> PaymentDoor.Open
}
