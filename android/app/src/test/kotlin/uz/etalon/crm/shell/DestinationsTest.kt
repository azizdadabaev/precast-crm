package uz.etalon.crm.shell

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.nav.Calculator
import uz.etalon.crm.nav.ChangePin
import uz.etalon.crm.nav.ClientDetail
import uz.etalon.crm.nav.Clients
import uz.etalon.crm.nav.Drafts
import uz.etalon.crm.nav.Discrepancies
import uz.etalon.crm.nav.Home
import uz.etalon.crm.nav.OrderDetail
import uz.etalon.crm.nav.Orders
import uz.etalon.crm.nav.Payments
import uz.etalon.crm.nav.RecordPayment
import uz.etalon.crm.nav.canOpen
import uz.etalon.crm.nav.gatingPermission
import uz.etalon.crm.nav.key
import uz.etalon.crm.nav.startKeyFor

/**
 * The nav pill (§4, D3). There is no «Яна» cell and no placeholder any more: the bar holds the
 * five cells that have screens, permission-filtered, and everything that used to sit in the
 * overflow is either a cell of its own or lives behind Home's account sheet (ruling R3).
 */
class DestinationsTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)

    @Test
    fun `the bar holds the five cells in order, filtered by permission`() {
        assertEquals(
            listOf(
                Destination.HOME, Destination.ORDERS, Destination.CALCULATOR,
                Destination.PAYMENTS, Destination.DRAFTS,
            ),
            destinationsFor(me("order.view", "calculator.use", "payment.view", "client.view")),
        )
    }

    /**
     * «Мижозлар» left the bar for the drawer and must still be reachable, or the swap
     * would have removed a screen rather than moved it. «Лойиҳалар» is filtered OUT of the
     * drawer while it holds a bar cell: one place per destination on any one screen.
     */
    @Test
    fun `the drawer carries what the bar gave up, and never doubles a bar cell`() {
        val full = me("order.view", "calculator.use", "payment.view", "client.view", "inbox.access")
        val drawer = drawerDestinationsFor(full)
        assertEquals(
            listOf(DrawerDestination.GALLERY, DrawerDestination.CLIENTS, DrawerDestination.INBOX),
            drawer,
        )
        assertFalse(DrawerDestination.DRAFTS_LINK in drawer)
    }

    /** No `inbox.access`, no «Хабарлар» row — the drawer filters the same way the bar does. */
    @Test
    fun `a drawer row without its permission is absent, not disabled`() {
        val noInbox = me("order.view", "client.view")
        assertFalse(DrawerDestination.INBOX in drawerDestinationsFor(noInbox))
    }

    /** A DRIVER holds `order.view` and `payment.record` — which is not `payment.view` — so their
     *  bar is two cells wide. Fewer cells, never a disabled one. */
    @Test
    fun `a driver sees home, orders and drafts`() {
        // «Лойиҳалар» rides on `order.view`, which a DRIVER holds — so they get the cell, exactly as
        // they get /projects on the web, which gates it on the same permission. Matching the desk
        // app matters more here than guessing that a driver would not look.
        assertEquals(
            listOf(Destination.HOME, Destination.ORDERS, Destination.DRAFTS),
            destinationsFor(me("order.view", "payment.record")),
        )
    }

    @Test
    fun `home needs no permission`() {
        assertEquals(listOf(Destination.HOME), destinationsFor(me()))
    }

    @Test
    fun `every cell opens a real screen`() {
        assertEquals(Home, Destination.HOME.key())
        assertEquals(Orders, Destination.ORDERS.key())
        assertEquals(Calculator, Destination.CALCULATOR.key())
        assertEquals(Payments, Destination.PAYMENTS.key())
        assertEquals(Drafts, Destination.DRAFTS.key())
    }

    // ── start keys ────────────────────────────────────────────────────────────────

    @Test
    fun `a user with order view starts on Orders`() {
        assertEquals(Orders, startKeyFor(me("order.view", "payment.view"), deepLinkOrderId = null))
    }

    @Test
    fun `a deep link wins for a user who may read orders`() {
        assertEquals(OrderDetail("o-42"), startKeyFor(me("order.view"), deepLinkOrderId = "o-42"))
    }

    /** An INVENTORY user has no order.view. They land on Home, which needs no permission; a deep
     *  link must still not smuggle them onto the order screen. */
    @Test
    fun `a user without order view never starts on Orders`() {
        assertEquals(Home, startKeyFor(me("inventory.view"), deepLinkOrderId = null))
        assertEquals(Home, startKeyFor(me("inventory.view"), deepLinkOrderId = "o-42"))
    }

    // ── the routes behind the cells are gated on their own permissions ──────────────

    /** An operator without `calculator.use` must not merely lose the cell — the route must not
     *  exist for them at all, so no restored back stack can open it either. */
    @Test
    fun `a user without calculator use neither sees the cell nor can reach it`() {
        val noCalculator = me("order.view")
        assertFalse(Destination.CALCULATOR in destinationsFor(noCalculator))
        assertFalse(noCalculator.canOpen(Calculator))
        assertEquals("calculator.use", gatingPermission(Calculator))
    }

    @Test
    fun `a user with calculator use can reach it`() {
        assertTrue(me("calculator.use").canOpen(Calculator))
    }

    @Test
    fun `a user without payment view neither sees the cell nor can reach the queue`() {
        val accountant = me("order.view", "payment.view", "discrepancy.view")
        val driver = me("order.view", "payment.record")
        assertTrue(Destination.PAYMENTS in destinationsFor(accountant))
        assertTrue(accountant.canOpen(Payments))
        assertFalse(Destination.PAYMENTS in destinationsFor(driver))
        assertFalse(driver.canOpen(Payments))
    }

    /** A DRIVER holds `payment.record` and nothing else here: they may record against the order
     *  they delivered, and may not read the owner's queue or the discrepancy list. */
    @Test
    fun `recording is gated on payment record, not on payment view`() {
        val driver = me("order.view", "payment.record")
        assertTrue(driver.canOpen(RecordPayment("o1")))
        assertFalse(driver.canOpen(Discrepancies))
        assertFalse(me("payment.view").canOpen(RecordPayment("o1")))
    }

    /** The discrepancy list has no cell of its own: the account sheet is its only door, gated on
     *  the same permission the entry is. */
    @Test
    fun `discrepancies are gated on discrepancy view`() {
        assertTrue(me("discrepancy.view").canOpen(Discrepancies))
        assertFalse(me("payment.view").canOpen(Discrepancies))
    }

    @Test
    fun `a user without client view neither sees the cell nor can reach clients`() {
        val noClients = me("order.view")
        assertFalse(DrawerDestination.CLIENTS in drawerDestinationsFor(noClients))
        assertFalse(noClients.canOpen(Clients))
        assertFalse(noClients.canOpen(ClientDetail("c1")))
    }

    @Test
    fun `a user with client view can reach clients and its detail`() {
        val withClients = me("client.view")
        assertTrue(withClients.canOpen(Clients))
        assertTrue(withClients.canOpen(ClientDetail("c1")))
    }

    /** The entryProvider fallback renders its Uzbek no-access notice for exactly the keys a
     *  permission can legitimately withhold, and still crashes for anything else. A key that is
     *  always registered must therefore never name a permission here. */
    @Test
    fun `an always-registered key names no gating permission`() {
        listOf(Home, Orders, OrderDetail("o1"), ChangePin(forced = false))
            .forEach { assertNull(gatingPermission(it), "$it is registered unconditionally") }
    }
}
