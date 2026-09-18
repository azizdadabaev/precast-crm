package uz.etalon.crm.shell

import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me

/**
 * The nav-pill cells, in bar order. Every one has a screen.
 *
 * «Мижозлар» used to hold the fifth seat and now lives in the drawer ([DrawerDestination]). The
 * bar is the work an operator does all day — take an order, price one, take a payment, pick a
 * saved draft back up — and a client list is something you go *look* at, which is what the drawer
 * is for. The web makes the same split: its own top bar carries the working screens and the
 * sidebar carries the rest.
 */
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    DRAFTS(R.string.nav_drafts, R.string.nav_drafts_short, "order.view"),
}

/** The permitted cells, in bar order. A role lacking a permission simply has fewer cells (§4). */
fun destinationsFor(me: Me): List<Destination> =
    Destination.entries.filter { it.requires == null || me.can(it.requires) }

/**
 * What the drawer lists, in the web sidebar's own order and wording.
 *
 * Kept deliberately to the sections that have a screen on the phone. The web sidebar is longer —
 * Ҳисоб журнали, Омбор, Фойдаланувчилар and the rest — and an entry that opens nothing is worse
 * than an entry that is absent, so those wait until their screens exist rather than being drawn
 * greyed out.
 */
enum class DrawerDestination(val labelRes: Int, val requires: String) {
    GALLERY(R.string.nav_gallery, "order.view"),
    DRAFTS_LINK(R.string.nav_drafts, "order.view"),
    CLIENTS(R.string.nav_clients, "client.view"),
    INBOX(R.string.nav_inbox, "inbox.access"),
}

/**
 * The drawer's permitted entries.
 *
 * «Лойиҳалар» is filtered out when it is already a bar cell: listing it twice on one screen would
 * make the drawer look like a different place to the same thing. It stays in the enum because a
 * role without `order.view` has neither, and one gained later should light both.
 */
fun drawerDestinationsFor(me: Me): List<DrawerDestination> {
    val bar = destinationsFor(me)
    return DrawerDestination.entries.filter { entry ->
        me.can(entry.requires) && !(entry == DrawerDestination.DRAFTS_LINK && Destination.DRAFTS in bar)
    }
}
