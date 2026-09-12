package uz.etalon.crm.feature.calculator

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.OrderTotals
import uz.etalon.crm.core.calc.ProjectTotal
import uz.etalon.crm.core.calc.ProjectTotals
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.math.BigDecimal
import java.math.RoundingMode
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

    // ── the roll-up's four printed lines ──────────────────────────

    /** A quote whose engine figures are stated outright rather than typed through rooms: this
     *  suite is about the DISPLAY arithmetic over the totals, and a subtotal that lands a discount
     *  on an exact half is easier to state than to reach by picking room sizes. */
    /** `projectTotal` rounds its discount and its total to two decimals before either can become
     *  `Money` (`moneyOf` throws on anything else, on purpose). `round2` is internal to
     *  `:core:calc`, so the same rounding is spelt here — this fixture stands in for the engine,
     *  and a fixture that skipped it would be testing a state the engine cannot produce. */
    private fun r2(v: Double): Double = BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).toDouble()

    private fun quote(
        subtotal: Double,
        percent: Double,
        delivery: Double,
        other: Double = 0.0,
        /**
         * What `OrderTotals` carries: Σ of the rooms' own subtotals exactly as they summed, tiyin
         * and all — the engine leaves that one raw, while the `ProjectTotal` beside it is `round2`'d
         * (it could not reach `Money` otherwise; `moneyOf` throws on a third decimal). The roll-up
         * reads the rounded one for the subtotal line and the raw one, through `totalPrice`, for
         * «Жами». Defaults to [subtotal] — the ordinary case of rooms that summed to a whole UZS.
         */
        rawSubtotal: Double = subtotal,
    ): CalculatorUiState {
        val discount = r2(subtotal * (percent / 100))
        return ready().copy(
            discountMode = DiscountMode.PERCENT,
            discountPercent = percent,
            deliveryCost = delivery,
            otherCost = other,
            totals = ProjectTotals(
                projTotal = ProjectTotal(subtotal, percent, discount, r2(subtotal - discount)),
                beams = 0, blocks = 0, monolithLength = 0.0, monolithArea = 0.0, concrete = 0.0,
            ),
            orderTotals = OrderTotals(
                roomsSubtotal = rawSubtotal,
                discountAmount = discount,
                // The ENGINE's enum, not this feature's same-named one — `OrderTotals` is
                // `:core:calc`'s, and the two `DiscountMode`s are distinct types.
                discountMode = uz.etalon.crm.core.calc.DiscountMode.PERCENT,
                resolvedDiscountPercent = percent,
                totalPrice = rawSubtotal - discount + delivery + other,
            ),
        )
    }

    private fun whole(m: uz.etalon.crm.core.model.Money): Long = m.amount.toLong()

    /**
     * The half case the helper exists for: 5 % of 15 125 470 is 756 273,5. Rounded on its own that
     * line prints «756 274» while «Жами» — computed from 14 669 196,50 — prints «14 669 197», and
     * the four figures a customer adds up come to one UZS less than the bottom line.
     */
    @Test fun `a discount on an exact half still leaves a column that adds up`() {
        val lines = rollupLines(quote(subtotal = 15_125_470.0, percent = 5.0, delivery = 300_000.0))
        assertEquals(15_125_470L, whole(lines.roomsSubtotal))
        assertEquals(756_273L, whole(lines.discount))
        assertEquals(300_000L, whole(lines.delivery))
        assertEquals(14_669_197L, whole(lines.total))
        assertEquals(
            whole(lines.total),
            whole(lines.roomsSubtotal) - whole(lines.discount) + whole(lines.delivery) + whole(lines.other),
        )
    }

    /** Nothing taken off and nothing added: the discount line derives to zero, so the sheet leaves
     *  it out and «Жами» is the subtotal. */
    @Test fun `with no discount the derived line is nothing at all`() {
        val lines = rollupLines(quote(subtotal = 13_542_460.0, percent = 0.0, delivery = 0.0))
        assertEquals(0L, whole(lines.discount))
        assertEquals(13_542_460L, whole(lines.total))
    }

    /**
     * The engine's two subtotals are not the same number. `ProjectTotal.roomsSubtotal` is `round2`'d
     * — `moneyOf`'s `RoundingMode.UNNECESSARY` would throw on anything else — while
     * `OrderTotals.roomsSubtotal` is Σ of the rooms exactly as they summed, and it is the second one
     * that reaches «Жами» through `totalPrice`. A fixture that made them identical would never
     * exercise the pair the screen actually holds, so this case gives the raw sum a tenth of a tiyin
     * the rounded one does not have.
     */
    @Test fun `the column adds up when the engine's two subtotals differ below a tiyin`() {
        val lines = rollupLines(
            quote(subtotal = 15_125_470.0, percent = 5.0, delivery = 300_000.0, rawSubtotal = 15_125_470.004),
        )
        assertEquals(15_125_470L, whole(lines.roomsSubtotal))
        assertEquals(14_669_197L, whole(lines.total))
        assertEquals(
            whole(lines.total),
            whole(lines.roomsSubtotal) - whole(lines.discount) + whole(lines.delivery),
        )
        assertTrue(lines.discount.amount.signum() >= 0, "the derived discount is not negative")
    }

    /** Delivery and other are whole UZS already (the fields refuse a decimal and
     *  `operatorAmountMoney` truncates), so they cancel out of the derivation exactly — what is
     *  left is the subtotal against the discounted subtotal, whatever else was added. */
    @Test fun `delivery and other cannot disturb the derived discount`() {
        val bare = rollupLines(quote(subtotal = 15_125_470.0, percent = 5.0, delivery = 0.0))
        val loaded = rollupLines(quote(subtotal = 15_125_470.0, percent = 5.0, delivery = 300_000.0, other = 50_000.0))
        assertEquals(whole(bare.discount), whole(loaded.discount))
        assertEquals(
            whole(loaded.total),
            whole(loaded.roomsSubtotal) - whole(loaded.discount) + whole(loaded.delivery) + whole(loaded.other),
        )
    }

    /** Every whole percent of a half-landing subtotal, so the derivation is pinned across the
     *  rounding boundary rather than on the one case that prompted it. */
    @Test fun `the column adds up at every whole percent`() {
        (0..100).forEach { pct ->
            val lines = rollupLines(quote(subtotal = 15_125_470.0, percent = pct.toDouble(), delivery = 300_000.0))
            assertEquals(
                whole(lines.total),
                whole(lines.roomsSubtotal) - whole(lines.discount) + whole(lines.delivery),
                "at $pct%",
            )
            assertTrue(lines.discount.amount.signum() >= 0, "at $pct% the discount is not negative")
        }
    }
}
