package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavKey
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.shell.Destination

internal const val PERM_DRIVER_VIEW = "driver.view"
internal const val PERM_DISPATCH_CREATE = "dispatch.create"
internal const val PERM_PAYMENT_VIEW = "payment.view"
internal const val PERM_PAYMENT_RECORD = "payment.record"
internal const val PERM_DISCREPANCY_VIEW = "discrepancy.view"
internal const val PERM_CLIENT_VIEW = "client.view"
internal const val PERM_CALCULATOR_USE = "calculator.use"

/** The key a nav-pill cell opens. Every cell has a screen (§4). */
internal fun Destination.key(): Key = when (this) {
    Destination.HOME -> Home
    Destination.ORDERS -> Orders
    Destination.CALCULATOR -> Calculator
    Destination.CLIENTS -> Clients
    Destination.PAYMENTS -> Payments
}

/**
 * Which cell is lit while [key] is on top of the stack (ruling R8). A stack route belongs to the
 * tab it was opened from: every order-scoped screen lights «Буюртма», and the three the Home app
 * bar's account sheet opens light «Бош». A key that belongs to no cell — the login flow — lights
 * nothing, and `BottomNav` draws no active pill for an index it does not hold.
 */
internal fun tabFor(key: NavKey): Destination? = when (key) {
    is Home, is Drivers, is Discrepancies, is ChangePin -> Destination.HOME
    is Orders, is OrderDetail, is LoadTruck, is Shipments, is ShipmentLoad, is Dispatch,
    is DeliveryProof, is DeliveryLocation, is RecordPayment,
    -> Destination.ORDERS
    is Calculator -> Destination.CALCULATOR
    is Payments -> Destination.PAYMENTS
    is Clients, is ClientDetail -> Destination.CLIENTS
    else -> null
}

/**
 * Whether [key] is a gate the nav pill must not be drawn over at all — see `SignedInShell`'s
 * KDoc. Only the forced PIN change is one: the server has expired this operator's password, the
 * screen has no back arrow, and finishing it signs them out, so no cell on the bar leads anywhere
 * they may go. The voluntary ChangePin reached from the account sheet keeps its pill.
 */
internal fun hidesNav(key: NavKey): Boolean = key is ChangePin && key.forced

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
    is Clients, is ClientDetail -> PERM_CLIENT_VIEW
    is Calculator -> PERM_CALCULATOR_USE
    else -> null
}

/** Whether this operator's shell registers an entry for [key] at all. */
internal fun Me.canOpen(key: NavKey): Boolean = gatingPermission(key)?.let { can(it) } ?: true

/**
 * Where a signed-in user lands. Orders is not universal — a user with no `order.view` must not
 * be dropped on a screen they are not allowed to read, so a deep link to one is not honoured
 * either.
 *
 * The fallback is simply Home: it needs no permission and, since this slice, is a real screen
 * rather than a placeholder — Home used to be excluded here for exactly the opposite reason (it
 * had no screen yet, so landing on it meant landing on nothing). Every role in `ROLE_TEMPLATES`
 * holds `order.view`, so today this branch is reached only by a CUSTOM role built with none of
 * the permissions a start key could use.
 */
fun startKeyFor(me: Me, deepLinkOrderId: String?): Key = when {
    me.can("order.view") && deepLinkOrderId != null -> OrderDetail(deepLinkOrderId)
    me.can("order.view") -> Orders
    else -> Home
}
