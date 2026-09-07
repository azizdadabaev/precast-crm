package uz.etalon.crm.shell

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.R
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.nav.ChangePin
import uz.etalon.crm.nav.ComingSoon
import uz.etalon.crm.nav.Discrepancies
import uz.etalon.crm.nav.More
import uz.etalon.crm.nav.OrderDetail
import uz.etalon.crm.nav.Orders
import uz.etalon.crm.nav.Payments
import uz.etalon.crm.nav.RecordPayment
import uz.etalon.crm.nav.canOpen
import uz.etalon.crm.nav.gatingPermission
import uz.etalon.crm.nav.key
import uz.etalon.crm.nav.startKeyFor

class DestinationsTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)

    @Test
    fun `owner gets four plus More in priority order`() {
        val d = destinationsFor(me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view"))
        assertEquals(
            listOf(
                Destination.HOME, Destination.ORDERS, Destination.CALCULATOR,
                Destination.INBOX, Destination.MORE,
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

    /** Material 3's navigation bar holds five items; MORE is always one of them. */
    @Test
    fun `never more than five items in the bar`() {
        val d = destinationsFor(
            me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view", "client.view"),
        )
        assertEquals(5, d.size)
        assertEquals(Destination.MORE, d.last())
    }

    /** Whatever the bar could not fit has to be reachable from "Яна" — otherwise a permitted
     *  section simply disappears for a user with many permissions. */
    @Test
    fun `More lists exactly what the bar dropped`() {
        val owner = me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view")
        assertEquals(
            listOf(Destination.PAYMENTS, Destination.PRODUCTION, Destination.GAZOBLOK),
            moreDestinationsFor(owner),
        )
    }

    /** The bar and the More list never overlap, and together they cover every allowed
     *  destination exactly once. */
    @Test
    fun `the bar and More partition the allowed destinations`() {
        listOf(
            me(),
            me("inventory.view"),
            me("order.view"),
            me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view"),
        ).forEach { user ->
            val bar = destinationsFor(user).filter { it != Destination.MORE }
            val more = moreDestinationsFor(user)
            assertEquals(emptyList<Destination>(), bar.filter { it in more })
            val allowed = Destination.entries.filter { it != Destination.MORE && (it.requires == null || user.can(it.requires)) }
            assertEquals(allowed, bar + more)
        }
    }

    /** MORE is the screen the list is on; it must never list itself. */
    @Test
    fun `More never lists itself`() {
        assertEquals(emptyList<Destination>(), moreDestinationsFor(me()).filter { it == Destination.MORE })
    }

    /** A user with only a couple of permissions has nothing left over for the More list. */
    @Test
    fun `a user whose destinations all fit the bar has an empty More list`() {
        assertEquals(emptyList<Destination>(), moreDestinationsFor(me("inventory.view")))
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

    // ── The payments slice: the tab is a real screen, and every route behind it is gated ──

    @Test
    fun `the payments tab is a real screen, not a coming-soon notice`() {
        assertEquals(Payments, Destination.PAYMENTS.key())
    }

    /** An operator without `payment.view` must not merely lose the tab — the queue route must not
     *  exist for them at all, so no restored back stack can open it either. */
    @Test
    fun `a user without payment view neither sees the tab nor can reach the queue`() {
        val accountant = me("order.view", "payment.view", "discrepancy.view")
        val driver = me("order.view", "payment.record")
        assertTrue(Destination.PAYMENTS in destinationsFor(accountant) + moreDestinationsFor(accountant))
        assertTrue(accountant.canOpen(Payments))
        assertFalse(Destination.PAYMENTS in destinationsFor(driver) + moreDestinationsFor(driver))
        assertFalse(driver.canOpen(Payments))
    }

    /** A DRIVER holds `payment.record` and nothing else on this slice: they may record against the
     *  order they delivered, and may not read the owner's queue or the discrepancy list. */
    @Test
    fun `recording is gated on payment record, not on payment view`() {
        val driver = me("order.view", "payment.record")
        assertTrue(driver.canOpen(RecordPayment("o1")))
        assertFalse(driver.canOpen(Discrepancies))
        assertFalse(me("payment.view").canOpen(RecordPayment("o1")))
    }

    @Test
    fun `discrepancies are gated on discrepancy view`() {
        assertTrue(me("discrepancy.view").canOpen(Discrepancies))
        assertFalse(me("payment.view").canOpen(Discrepancies))
    }

    /** The entryProvider fallback renders its Uzbek no-access notice for exactly the keys a
     *  permission can legitimately withhold, and still crashes for anything else. A key that is
     *  always registered must therefore never name a permission here. */
    @Test
    fun `an always-registered key names no gating permission`() {
        listOf(Orders, OrderDetail("o1"), More, ChangePin(forced = false), ComingSoon(R.string.nav_production))
            .forEach { assertNull(gatingPermission(it), "$it is registered unconditionally") }
    }
}
