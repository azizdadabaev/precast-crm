package uz.etalon.crm.feature.calculator

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.time.LocalDate

/**
 * The submit rule behind «Буюртма бериш», tested without Compose — `canPlaceOrder` is a plain
 * function over the state plus the one thing the sheet itself owns (the picked date) precisely so
 * this can be a plain JUnit suite.
 *
 * Every case below is a way an operator can reach the sheet with something the SERVER would refuse:
 * a room `PlaceOrderSchema` rejects, a client the draft route would have accepted, no date.
 */
class PlaceOrderSheetStateTest {

    private val date: LocalDate = LocalDate.of(2026, 9, 20)

    private fun room(name: String, length: Double = 6.0) =
        recomputeRow(SlabRow(id = "id-$name", name = name, innerWidth = 4.0, innerLength = length), DEFAULT_PRICE_CONFIG)

    /** Priced but extras-only — `SlabRow.canPersist` is false because `innerLength` is not
     *  `.positive()` in `PlaceOrderSchema`. */
    private fun extrasOnlyRoom(name: String) =
        recomputeRow(
            SlabRow(id = "id-$name", name = name, innerWidth = 4.0, innerLength = 0.0, extraBeams = 2),
            DEFAULT_PRICE_CONFIG,
        )

    /** Everything present: the one state that may be submitted. */
    private fun ready() = CalculatorUiState(
        rows = listOf(room("Хона 1")),
        canWrite = true,
        clientPhoneDigits = "901234567",
        clientName = "Aziz",
        clientAddress = ParsedAddress("Тошкент", "Юнусобод", "12-уй"),
    )

    @Test fun `a complete quote with a date may be placed`() {
        assertTrue(canPlaceOrder(ready(), date))
    }

    @Test fun `no date, no order — the field has no default and the server has none either`() {
        assertFalse(canPlaceOrder(ready(), null))
    }

    @Test fun `without order_create there is nothing to place`() {
        assertFalse(canPlaceOrder(ready().copy(canWrite = false), date))
    }

    @Test fun `an empty quote cannot be placed — PlaceOrderSchema rooms is min one`() {
        assertFalse(canPlaceOrder(ready().copy(rows = emptyList()), date))
    }

    /** A room still being typed has no `SlabResult` yet, so it is not persistable — and it is also
     *  not UNPERSISTABLE (that flag is only for rooms the engine DID price). A quote of nothing but
     *  such a room must still be refused: there would be no room to send. */
    @Test fun `a quote of only untyped rooms cannot be placed`() {
        assertFalse(canPlaceOrder(ready().copy(rows = listOf(SlabRow(id = "r1", name = "Хона 1"))), date))
    }

    /** Named, never dropped: sending the other rooms would place an order for less than the
     *  operator quoted, and the customer would never see the difference until delivery. */
    @Test fun `an extras-only room blocks the whole order rather than being dropped from it`() {
        val s = ready().copy(rows = listOf(room("Хона 1"), extrasOnlyRoom("Хона 2")))
        assertEquals(listOf("Хона 2"), s.unpersistableRoomNames)
        assertFalse(canPlaceOrder(s, date))
    }

    /**
     * All three client fields are `min(1)`/`min(5)` on `PlaceOrderSchema` but optional on
     * `SaveProjectDraftSchema` — a quote that saves perfectly well as a project can still be
     * unplaceable, and this is the rule that says so before the customer waits for a 422.
     */
    @Test fun `every missing client field blocks the order on its own`() {
        assertFalse(canPlaceOrder(ready().copy(clientName = "   "), date))
        assertFalse(canPlaceOrder(ready().copy(clientPhoneDigits = "90123"), date))
        assertFalse(canPlaceOrder(ready().copy(clientAddress = ParsedAddress("", "", "  ")), date))
    }

    /** A street alone is a real address — the region widget is not mandatory. */
    @Test fun `a street with no region still counts as an address`() {
        assertTrue(canPlaceClient(ready().copy(clientAddress = ParsedAddress("", "", "Навоий кўчаси, 5"))))
    }

    @Test fun `a submission already in flight cannot be submitted again`() {
        assertFalse(canPlaceOrder(ready().copy(placing = true), date))
        assertFalse(canPlaceOrder(ready().copy(saving = true), date))
    }

    /**
     * The picked calendar day must resolve at the START of that day in `Asia/Tashkent`, not UTC.
     * The server buckets an order into a delivery day in its own local zone, and a Tashkent day
     * resolved as UTC midnight lands five hours early — on the PREVIOUS day in the calendar the
     * factory schedules from.
     */
    @Test fun `the picked day is resolved at Tashkent midnight, not UTC`() {
        assertEquals("2026-09-19T19:00:00Z", scheduledAtInstant(date))
    }

    // ── D10's three money fields ───────────────────────────────────────────────────

    /**
     * The whole of the focus swap in one property: the digits a field hands the operator when they
     * tap into it must parse back to the very number it was showing them a moment earlier.
     *
     * The idle text is `formatMoney`/`formatDecimal`, which groups thousands with U+202F — a
     * character no keyboard can type and [parseDecimal] refuses. Handing that back on focus would
     * make any figure above 999 uneditable: one keystroke and the cell would read 0.
     */
    @Test fun `what a money field hands to the keyboard parses back to the same number`() {
        listOf(0.0, 5.0, 300_000.0, 13_542_460.0).forEach { v ->
            val typable = plainText(v, allowDecimal = false)
            assertEquals(typable, typable.filter(Char::isDigit), "«$typable» is plain digits")
            assertEquals(v, parseDecimal(typable) ?: 0.0)
        }
    }

    /** The percentage field is the one that may carry decimals — with D8's comma, which is what
     *  the decimal keyboard offers and what [parseDecimal] accepts. */
    @Test fun `what the percent field hands to the keyboard round-trips through the comma`() {
        assertEquals("5", plainText(5.0, allowDecimal = true))
        assertEquals("7,5", plainText(7.5, allowDecimal = true))
        assertEquals("12,25", plainText(12.25, allowDecimal = true))
        assertEquals(7.5, parseDecimal(plainText(7.5, allowDecimal = true)))
    }

    /**
     * The three costs never block the submit. They are money the operator agreed to, not fields
     * the server requires: `PlaceOrderSchema` defaults every one of them to 0, and an order with
     * no delivery charge is an ordinary order.
     */
    @Test fun `a discount, a delivery charge and an other cost do not change what may be placed`() {
        val s = ready().copy(
            discountMode = DiscountMode.PERCENT,
            discountPercent = 5.0,
            deliveryCost = 300_000.0,
            otherCost = 50_000.0,
        )
        assertTrue(canPlaceOrder(s, date))
        assertTrue(canPlaceOrder(ready().copy(discountMode = DiscountMode.AMOUNT, discountAmount = 1_000_000.0), date))
    }
}
