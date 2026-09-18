package uz.etalon.crm.nav

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.shell.Destination

/**
 * Ruling R8: the nav pill shows on every signed-in screen, and a stack route lights the cell it
 * belongs to — not nothing, and not the wrong one. A driver deep in the load-truck flow has to be
 * able to see, at a glance, that they are inside «Буюртма».
 */
class TabForTest {
    @Test
    fun `order routes light the orders cell`() {
        listOf(
            OrderDetail("o"), LoadTruck("o", false), Shipments("o"), ShipmentLoad("o", "s"),
            Dispatch("o"), DeliveryProof("o"), DeliveryLocation("o"), RecordPayment("o"),
        ).forEach { assertEquals(Destination.ORDERS, tabFor(it), it.toString()) }
    }

    /** The three screens the Home app bar's account sheet opens belong to Home — they have no
     *  cell of their own and must not leave the bar dark. */
    @Test
    fun `home-sheet routes light the home cell`() {
        listOf(Drivers, Discrepancies, ChangePin(false)).forEach { assertEquals(Destination.HOME, tabFor(it), it.toString()) }
    }

    @Test
    fun `tabs map to themselves`() {
        assertEquals(Destination.HOME, tabFor(Home))
        assertEquals(Destination.ORDERS, tabFor(Orders))
        assertEquals(Destination.CALCULATOR, tabFor(Calculator))
        assertEquals(Destination.PAYMENTS, tabFor(Payments))
        assertEquals(Destination.DRAFTS, tabFor(Drafts))
    }

    /** The signed-out key never reaches the pill, and an index of -1 lights no cell. */
    @Test
    fun `a key outside the bar lights nothing`() {
        assertNull(tabFor(Login))
    }

    /**
     * A forced PIN change is a gate: the server has expired the password, the screen has no back
     * arrow and finishing it signs the operator out, so the shell draws no pill over it. The
     * voluntary one — the account sheet's «PIN ни ўзгартириш» — keeps its bar.
     */
    @Test
    fun `only the forced PIN change hides the pill`() {
        assertTrue(hidesNav(ChangePin(forced = true)))
        assertFalse(hidesNav(ChangePin(forced = false)))
        listOf(Home, Orders, OrderDetail("o"), Calculator, Payments, Clients, Drivers, Discrepancies)
            .forEach { assertFalse(hidesNav(it), it.toString()) }
    }
}
