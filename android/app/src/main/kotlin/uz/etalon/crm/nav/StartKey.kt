package uz.etalon.crm.nav

import uz.etalon.crm.core.model.Me
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.destinationsFor

/** The key a bottom-bar destination opens. Only ORDERS and MORE have real screens in slice 1a. */
internal fun Destination.key(): Key = when (this) {
    Destination.ORDERS -> Orders
    Destination.MORE -> More
    else -> ComingSoon(labelRes)
}

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
