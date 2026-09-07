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

    /** ROLE_TEMPLATES.OWNER, the only role holding `inbox.access`. Its bar used to be HOME,
     *  ORDERS, CALCULATOR, INBOX — three placeholders and one screen — which pushed the payment
     *  confirmation queue into «Яна» for the one person who confirms every payment. */
    private val owner = me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view")

    @Test
    fun `the bar holds only destinations that have a screen, in priority order`() {
        assertEquals(listOf(Destination.ORDERS, Destination.PAYMENTS, Destination.MORE), destinationsFor(owner))
    }

    /** The regression this rule exists for: the owner reaches the queue with one thumb, not
     *  through an overflow menu behind three "кейинги релизда" notices. */
    @Test
    fun `the owner gets payments on the bar`() {
        assertTrue(Destination.PAYMENTS in destinationsFor(owner))
        assertFalse(Destination.PAYMENTS in moreDestinationsFor(owner))
    }

    /** A placeholder is never a bar slot, and is never lost either: «Яна» still lists it. */
    @Test
    fun `a placeholder is kept off the bar but stays in More`() {
        val placeholders = listOf(
            Destination.HOME, Destination.CALCULATOR, Destination.INBOX,
            Destination.PRODUCTION, Destination.GAZOBLOK,
        )
        val bar = destinationsFor(owner)
        val more = moreDestinationsFor(owner)
        placeholders.forEach { d ->
            assertFalse(d in bar, "$d has no screen yet and must not hold a bar slot")
            assertTrue(d in more, "$d must still be reachable from «Яна»")
        }
    }

    /** Every section a factory user may open is still a placeholder, so their bar is «Яна»
     *  alone — and all three are waiting behind it. */
    @Test
    fun `a user whose every section is a placeholder gets a bar of More alone`() {
        val factory = me("inventory.view")
        assertEquals(listOf(Destination.MORE), destinationsFor(factory))
        assertEquals(
            listOf(Destination.HOME, Destination.PRODUCTION, Destination.GAZOBLOK),
            moreDestinationsFor(factory),
        )
    }

    /** Material 3's navigation bar holds five items; MORE is always one of them. The cap is not
     *  what trims the bar today — only two sections have screens — but it must keep holding as
     *  Phase 2 and 3 land and the filtered list grows past four. */
    @Test
    fun `never more than five items in the bar`() {
        val everyone = Destination.entries.mapNotNull { it.requires }.toTypedArray()
        listOf(me(), me("inventory.view"), owner, me(*everyone)).forEach { user ->
            val d = destinationsFor(user)
            assertTrue(d.size <= 5, "Material 3's navigation bar holds five items: $d")
            assertEquals(Destination.MORE, d.last())
        }
    }

    /** Whatever the bar does not hold has to be reachable from "Яна" — otherwise a permitted
     *  section simply disappears. */
    @Test
    fun `More lists exactly what the bar does not`() {
        assertEquals(
            listOf(
                Destination.HOME, Destination.CALCULATOR, Destination.INBOX,
                Destination.PRODUCTION, Destination.GAZOBLOK,
            ),
            moreDestinationsFor(owner),
        )
    }

    /** The bar and the More list never overlap, and together they cover every allowed
     *  destination exactly once. Compared as sets: the bar now takes the destinations that have
     *  screens out of the middle of the priority order, so the two lists no longer concatenate
     *  back into it. */
    @Test
    fun `the bar and More partition the allowed destinations`() {
        listOf(me(), me("inventory.view"), me("order.view"), owner).forEach { user ->
            val bar = destinationsFor(user).filter { it != Destination.MORE }
            val more = moreDestinationsFor(user)
            assertEquals(emptyList<Destination>(), bar.filter { it in more })
            val allowed = Destination.entries.filter { it != Destination.MORE && (it.requires == null || user.can(it.requires)) }
            assertEquals(allowed.toSet(), (bar + more).toSet())
            assertEquals(allowed.size, bar.size + more.size, "each allowed destination appears exactly once")
        }
    }

    /** MORE is the screen the list is on; it must never list itself. */
    @Test
    fun `More never lists itself`() {
        assertEquals(emptyList<Destination>(), moreDestinationsFor(me()).filter { it == Destination.MORE })
    }

    /**
     * This replaces "a user whose destinations all fit the bar has an empty More list", whose
     * premise no longer holds for anyone: HOME needs no permission and has no screen yet, so it
     * sits in «Яна» for every user alive. The claim worth keeping is the narrower and stronger
     * one — while the bar has room, nothing that HAS a screen is left behind in the overflow.
     */
    @Test
    fun `nothing with a screen is left in More while the bar has room`() {
        listOf(me(), me("inventory.view"), me("order.view"), owner).forEach { user ->
            val bar = destinationsFor(user).filter { it != Destination.MORE }
            if (bar.size == 4) return@forEach // the cap, not the placeholder rule, is trimming here
            assertEquals(
                emptyList<Destination>(),
                moreDestinationsFor(user).filter { it.key() !is ComingSoon },
                "a built section was buried in «Яна» with bar slots to spare",
            )
        }
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
