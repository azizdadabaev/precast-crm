package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavKey
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.destinationsFor

internal const val PERM_DRIVER_VIEW = "driver.view"
internal const val PERM_DISPATCH_CREATE = "dispatch.create"
internal const val PERM_PAYMENT_VIEW = "payment.view"
internal const val PERM_PAYMENT_RECORD = "payment.record"
internal const val PERM_DISCREPANCY_VIEW = "discrepancy.view"

/** The key a bottom-bar destination opens. The rest have no feature module yet. */
internal fun Destination.key(): Key = when (this) {
    Destination.ORDERS -> Orders
    Destination.PAYMENTS -> Payments
    Destination.MORE -> More
    else -> ComingSoon(labelRes)
}

/**
 * The permission a key's NavEntry is registered behind, or null when the entry always exists.
 *
 * One source for two things that must never drift apart: the `if (me.can(…))` guards around the
 * entries in `SignedInShell`, and that entryProvider's fallback allowance list. A key named here
 * may legitimately have no entry — this operator lacks the permission — so a back stack restored
 * after a permission change lands on the Uzbek no-access notice instead of crashing them out of
 * the app. Any OTHER unregistered key, and any key named here whose permission the operator
 * *does* hold, is a wiring mistake and must still fail loudly in development.
 */
internal fun gatingPermission(key: NavKey): String? = when (key) {
    is Drivers -> PERM_DRIVER_VIEW
    is Shipments, is ShipmentLoad, is Dispatch -> PERM_DISPATCH_CREATE
    is Payments -> PERM_PAYMENT_VIEW
    is RecordPayment -> PERM_PAYMENT_RECORD
    is Discrepancies -> PERM_DISCREPANCY_VIEW
    else -> null
}

/** Whether this operator's shell registers an entry for [key] at all. */
internal fun Me.canOpen(key: NavKey): Boolean = gatingPermission(key)?.let { can(it) } ?: true

/**
 * Where a signed-in user lands. Orders is not universal — a DRIVER or INVENTORY user has no
 * `order.view` and must not be dropped on a screen they are not allowed to read, so they start
 * on their first real bottom-bar destination instead (a ComingSoon notice in slice 1a).
 */
fun startKeyFor(me: Me, deepLinkOrderId: String?): Key = when {
    me.can("order.view") && deepLinkOrderId != null -> OrderDetail(deepLinkOrderId)
    me.can("order.view") -> Orders
    else -> destinationsFor(me)
        .firstOrNull { it != Destination.HOME && it != Destination.MORE }
        ?.key()
        ?: More
}
