package uz.etalon.crm.shell

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.nav.ComingSoon
import uz.etalon.crm.nav.OrderDetail
import uz.etalon.crm.nav.Orders
import uz.etalon.crm.nav.startKeyFor

class DestinationsTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)

    @Test
    fun `owner gets five plus More in priority order`() {
        val d = destinationsFor(me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view"))
        assertEquals(
            listOf(
                Destination.HOME, Destination.ORDERS, Destination.CALCULATOR,
                Destination.INBOX, Destination.PAYMENTS, Destination.MORE,
            ),
            d,
        )
    }

    @Test
    fun `factory user gets home, production, gazoblok, more`() {
        assertEquals(
            listOf(Destination.HOME, Destination.PRODUCTION, Destination.GAZOBLOK, Destination.MORE),
            destinationsFor(me("inventory.view")),
        )
    }

    @Test
    fun `never more than five before More`() {
        val d = destinationsFor(
            me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view", "client.view"),
        )
        assertEquals(6, d.size)
        assertEquals(Destination.MORE, d.last())
    }

    @Test
    fun `a user with order view starts on Orders`() {
        assertEquals(Orders, startKeyFor(me("order.view", "payment.view"), deepLinkOrderId = null))
    }

    @Test
    fun `a deep link wins for a user who may read orders`() {
        assertEquals(OrderDetail("o-42"), startKeyFor(me("order.view"), deepLinkOrderId = "o-42"))
    }

    @Test
    fun `a user without order view never starts on Orders`() {
        // An INVENTORY user has no order.view; a deep link must not smuggle them onto the order screen.
        assertEquals(ComingSoon(R.string.nav_production), startKeyFor(me("inventory.view"), deepLinkOrderId = null))
        assertEquals(ComingSoon(R.string.nav_production), startKeyFor(me("inventory.view"), deepLinkOrderId = "o-42"))
    }
}
