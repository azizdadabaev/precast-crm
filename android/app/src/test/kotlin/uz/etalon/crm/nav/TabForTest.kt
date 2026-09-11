package uz.etalon.crm.nav

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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
        assertEquals(Destination.CLIENTS, tabFor(Clients))
        assertEquals(Destination.CLIENTS, tabFor(ClientDetail("c")))
    }

    /** The signed-out key never reaches the pill, and an index of -1 lights no cell. */
    @Test
    fun `a key outside the bar lights nothing`() {
        assertNull(tabFor(Login))
    }
}
