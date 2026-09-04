package uz.etalon.crm.shell

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role

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
}
