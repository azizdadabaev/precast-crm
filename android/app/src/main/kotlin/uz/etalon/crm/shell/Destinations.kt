package uz.etalon.crm.shell

import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me

/** Bottom-bar destinations. Only ORDERS and MORE have screens in slice 1a; the rest
 *  are declared so the bar is stable across slices and route to a "coming in the next
 *  release" notice via ComingSoonScreen until their feature module lands.
 *  Declaration order is the priority order from spec §5.1. */
enum class Destination(val labelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, null),
    ORDERS(R.string.nav_orders, "order.view"),
    CALCULATOR(R.string.nav_calculator, "calculator.use"),
    INBOX(R.string.nav_inbox, "inbox.access"),
    PAYMENTS(R.string.nav_payments, "payment.view"),
    PRODUCTION(R.string.nav_production, "inventory.view"),
    GAZOBLOK(R.string.nav_gazoblok, null),
    MORE(R.string.nav_more, null),
}

private const val MAX_BEFORE_MORE = 5

/** The permitted destinations in priority order, capped at five, with MORE always last. */
fun destinationsFor(me: Me): List<Destination> {
    val ordered = Destination.entries.filter { it != Destination.MORE }
    val allowed = ordered.filter { it.requires == null || me.can(it.requires) }
    return allowed.take(MAX_BEFORE_MORE) + Destination.MORE
}
