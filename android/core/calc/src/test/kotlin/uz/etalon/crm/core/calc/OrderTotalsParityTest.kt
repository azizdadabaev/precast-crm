package uz.etalon.crm.core.calc

import kotlinx.serialization.json.double
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Replays every case in `docs/api/calc-golden.json`'s `orderTotals` block — real `computeOrderTotals`
 * output from `order-totals.ts` — against this Kotlin port. Unlike [ProjectTotalTest]/[SlabParityTest]
 * this is the ORDER-PLACEMENT roll-up (delivery/other included, no internal rounding except the
 * back-computed percent) — see `OrderTotals.kt`'s class doc for why it exists separately from
 * [projectTotal]. Each case's rooms are built through [recomputeRow] first, exactly the way
 * `CalculatorViewModel` builds [SlabRow.result] before calling [computeOrderTotals].
 */
class OrderTotalsParityTest {

    @TestFactory
    fun `every order-totals golden vector replays bit for bit`() = GoldenVectors.orderTotals.cases.map { c ->
        DynamicTest.dynamicTest(c.name) {
            val rows = c.rooms.mapIndexed { i, (width, length) ->
                recomputeRow(SlabRow(id = "r$i", name = "Хона ${i + 1}", innerWidth = width, innerLength = length))
            }
            val r = computeOrderTotals(rows, c.discountPercent, c.discountAmount, c.deliveryCost, c.otherCost)

            assertEquals(c.result.getValue("rooms_subtotal").double, r.roomsSubtotal, "${c.name}: roomsSubtotal")
            assertEquals(c.result.getValue("discount_amount").double, r.discountAmount, "${c.name}: discountAmount")
            assertEquals(c.result.getValue("resolved_discount_percent").double, r.resolvedDiscountPercent, "${c.name}: resolvedDiscountPercent")
            assertEquals(c.result.getValue("discount_mode").content, r.discountMode.name, "${c.name}: discountMode")
            assertEquals(c.result.getValue("total_price").double, r.totalPrice, "${c.name}: totalPrice")
        }
    }

    @Test
    fun `the order-totals vector file carries exactly the 8 cases the exporter produced`() {
        assertEquals(8, GoldenVectors.orderTotals.cases.size)
    }

    @Test
    fun `an empty room list gives a zero subtotal — delivery and other alone form the total`() {
        val r = computeOrderTotals(emptyList(), discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 100_000.0, otherCost = 50_000.0)
        assertEquals(0.0, r.roomsSubtotal)
        assertEquals(0.0, r.discountAmount)
        assertEquals(DiscountMode.PERCENT, r.discountMode)
        assertEquals(150_000.0, r.totalPrice)
    }

    @Test
    fun `unlike projectTotal, discountPercent is NOT clamped to 0 to 100`() {
        val row = recomputeRow(SlabRow(id = "r", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        val over = computeOrderTotals(listOf(row), discountPercent = 150.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0)
        assertEquals(150.0, over.resolvedDiscountPercent)
        assertEquals(row.result!!.subtotal * 1.5, over.discountAmount)

        val under = computeOrderTotals(listOf(row), discountPercent = -5.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0)
        assertEquals(-5.0, under.resolvedDiscountPercent)
    }

    @Test
    fun `delivery and other visibly move the headline total`() {
        val row = recomputeRow(SlabRow(id = "r", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        val base = computeOrderTotals(listOf(row), discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0)
        val withExtras = computeOrderTotals(listOf(row), discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 150_000.0, otherCost = 25_000.0)
        assertEquals(base.totalPrice + 175_000.0, withExtras.totalPrice)
    }
}
