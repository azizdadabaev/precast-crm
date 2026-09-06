package uz.etalon.crm.shell

import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me

/** Bottom-bar destinations. Only ORDERS and MORE have screens in slice 1a; the rest
 *  are declared so the bar is stable across slices and route to a "coming in the next
 *  release" notice via ComingSoonScreen until their feature module lands.
 *  Declaration order is the priority order from spec §5.1. */
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    INBOX(R.string.nav_inbox, R.string.nav_inbox_short, "inbox.access"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    PRODUCTION(R.string.nav_production, R.string.nav_production_short, "inventory.view"),
    GAZOBLOK(R.string.nav_gazoblok, R.string.nav_gazoblok_short, null),
    MORE(R.string.nav_more, R.string.nav_more_short, null),
}

/** Material 3 caps the navigation bar at five items, and MORE always takes one of them —
 *  six labelled items crowd into overlapping text on a 411 dp phone. */
private const val MAX_BEFORE_MORE = 4

/** The permitted destinations in priority order, capped at four, with MORE always last. */
fun destinationsFor(me: Me): List<Destination> = allowedFor(me).take(MAX_BEFORE_MORE) + Destination.MORE

/**
 * What the "Яна" screen lists: everything this user may open that the bar had no room for.
 * MORE itself is never in it — it is the screen you are already on — and neither is anything
 * the user lacks the permission for.
 */
fun moreDestinationsFor(me: Me): List<Destination> {
    val onBar = destinationsFor(me).toSet()
    return allowedFor(me).filterNot { it in onBar }
}

private fun allowedFor(me: Me): List<Destination> = Destination.entries
    .filter { it != Destination.MORE }
    .filter { it.requires == null || me.can(it.requires) }
