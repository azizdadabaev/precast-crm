package uz.etalon.crm.shell

import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.nav.ComingSoon
import uz.etalon.crm.nav.key

/** Bottom-bar destinations. Only ORDERS, PAYMENTS and MORE have screens so far; the rest
 *  are declared so the bar is stable across slices and route to a "coming in the next
 *  release" notice via ComingSoonScreen until their feature module lands.
 *  Declaration order is the priority order from spec §5.1. */
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    INBOX(R.string.nav_inbox, R.string.nav_inbox_short, "inbox.access"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    // The spec's §5.1 table lists Clients only as an example under "More" — but it is broadly
    // held (every ROLE_TEMPLATES role but DRIVER) and phone-first client lookup is a field task
    // an operator reaches for as often as Orders, so it is worth its own bar slot rather than an
    // extra tap into «Яна» every time. Declared here, after Payments, so the bar's priority order
    // still matches the spec for everything the spec does name.
    CLIENTS(R.string.nav_clients, R.string.nav_clients_short, "client.view"),
    PRODUCTION(R.string.nav_production, R.string.nav_production_short, "inventory.view"),
    GAZOBLOK(R.string.nav_gazoblok, R.string.nav_gazoblok_short, null),
    MORE(R.string.nav_more, R.string.nav_more_short, null),
}

/** Material 3 caps the navigation bar at five items, and MORE always takes one of them —
 *  six labelled items crowd into overlapping text on a 411 dp phone. */
private const val MAX_BEFORE_MORE = 4

/**
 * Whether this destination's feature module has landed. `key()` is the one place that knows —
 * everything it still answers with a [ComingSoon] is a placeholder — so the bar reads that
 * rather than keeping a second list that would drift as each module arrives.
 */
private fun Destination.hasScreen(): Boolean = key() !is ComingSoon

/**
 * The permitted destinations that have a screen, in priority order, capped at four, with MORE
 * always last.
 *
 * A placeholder is deliberately kept OFF the bar. It would otherwise hold a thumb-reachable slot
 * to say "кейинги релизда" while a destination that does have a screen is pushed into «Яна»
 * behind it — and that was not hypothetical: INBOX requires `inbox.access`, which only the OWNER
 * holds, so the OWNER was the single user whose four slots went to HOME, ORDERS, CALCULATOR and
 * INBOX, burying the payment confirmation queue in the overflow behind three placeholders. The
 * one person who approves every payment had the longest walk to it.
 *
 * Nothing is lost by the exclusion: «Яна» lists every placeholder the user may open, and each one
 * takes its priority slot on the bar by itself as its module lands, without this ordering — the
 * spec's §5.1 priority — needing to be rewritten now and again later.
 */
fun destinationsFor(me: Me): List<Destination> =
    allowedFor(me).filter { it.hasScreen() }.take(MAX_BEFORE_MORE) + Destination.MORE

/**
 * What the "Яна" screen lists: everything this user may open that is not on the bar — the
 * placeholders, plus whatever the cap of four pushed off. MORE itself is never in it — it is the
 * screen you are already on — and neither is anything the user lacks the permission for.
 */
fun moreDestinationsFor(me: Me): List<Destination> {
    val onBar = destinationsFor(me).toSet()
    return allowedFor(me).filterNot { it in onBar }
}

/** Every destination this user may open, bar or overflow, in the spec's priority order. */
internal fun allowedFor(me: Me): List<Destination> = Destination.entries
    .filter { it != Destination.MORE }
    .filter { it.requires == null || me.can(it.requires) }
