package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Defect M8. Tapping a nav cell trims the stack down to that tab — but re-tapping the cell the
 * operator is *already on* used to re-add the key, replacing the back-stack entry and with it the
 * `ViewModelStore` the entry decorator holds. On Orders that threw away the query, the chip and the
 * scroll position on a tap that asked for nothing.
 */
class SwitchTabTest {
    private fun stack(vararg keys: NavKey) = NavBackStack<NavKey>(*keys)

    @Test
    fun `re-tapping the active cell changes nothing`() {
        val bs = stack(Orders)
        switchTab(bs, Orders)
        assertEquals(listOf<NavKey>(Orders), bs.toList())
    }

    @Test
    fun `tapping another cell replaces the stack with that tab`() {
        val bs = stack(Orders)
        switchTab(bs, Home)
        assertEquals(listOf<NavKey>(Home), bs.toList())
    }

    /** A stack route under the same tab is a different screen: «Буюртма» is lit on an order
     *  detail, and tapping it must still take the operator back to the list. */
    @Test
    fun `tapping the lit cell from a stack route under it returns to the tab`() {
        val bs = stack(Orders, OrderDetail("o1"))
        switchTab(bs, Orders)
        assertEquals(listOf<NavKey>(Orders), bs.toList())
    }

    /** Whatever was underneath goes: a tab tap is a reset, never a push onto a growing stack. */
    @Test
    fun `switching always leaves exactly one entry`() {
        val bs = stack(Home, OrderDetail("o1"), RecordPayment("o1"))
        switchTab(bs, Clients)
        assertEquals(listOf<NavKey>(Clients), bs.toList())
    }
}
