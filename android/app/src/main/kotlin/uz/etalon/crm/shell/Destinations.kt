package uz.etalon.crm.shell

import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me

/** The five nav-pill cells (design doc D3, §4), in bar order. Every one has a screen. */
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    CLIENTS(R.string.nav_clients, R.string.nav_clients_short, "client.view"),
}

/** The permitted cells, in bar order. A role lacking a permission simply has fewer cells (§4). */
fun destinationsFor(me: Me): List<Destination> =
    Destination.entries.filter { it.requires == null || me.can(it.requires) }
