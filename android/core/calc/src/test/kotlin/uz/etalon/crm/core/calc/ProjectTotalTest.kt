package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Ports `projectTotal`'s docstring behaviour from `calculation-engine.ts` (lines 495-508). The TS
 * unit-test file (`precast-crm/tests/calculation-engine.test.ts`, `describe("projectTotal...")`)
 * only covers the percent path and the percent clamp; the amount-override, cap-at-subtotal, and
 * empty-room-list cases are ported from the docstring itself, per the task-3 brief — see the
 * task-3 report's Deviation note. Expected values are derived the same way the source computes
 * them (via [round2]) rather than hand-computed literals, so a real port bug still fails loudly.
 */
class ProjectTotalTest {

    @Test
    fun `sums room subtotals and applies a percent discount on the grand total`() {
        val room1 = calculateSlab(SlabInput(4.0, 6.0)) // BGB
        val room2 = calculateSlab(SlabInput(4.0, 4.3)) // GBG
        val expectedSubtotal = round2(room1.subtotal + room2.subtotal)

        val t0 = projectTotal(listOf(room1, room2))
        assertEquals(expectedSubtotal, t0.roomsSubtotal)
        assertEquals(0.0, t0.discountAmount)
        assertEquals(expectedSubtotal, t0.total)

        val t10 = projectTotal(listOf(room1, room2), 10.0)
        val expectedDiscount10 = round2(expectedSubtotal * 10.0 / 100)
        assertEquals(expectedDiscount10, t10.discountAmount)
        assertEquals(round2(expectedSubtotal - expectedDiscount10), t10.total)
    }

    @Test
    fun `clamps discount_percent into 0 to 100`() {
        val r = calculateSlab(SlabInput(4.0, 6.0))
        assertEquals(100.0, projectTotal(listOf(r), 150.0).discountPercent)
        assertEquals(0.0, projectTotal(listOf(r), -5.0).discountPercent)
    }

    @Test
    fun `an amount override wins over percent and back-computes the percent`() {
        val room = calculateSlab(SlabInput(4.0, 6.0))
        val subtotal = round2(room.subtotal)
        val override = 500_000.0 // well under the room's subtotal

        val t = projectTotal(listOf(room), discountPercent = 25.0, discountAmountOverride = override)

        val expectedAmount = round2(minOf(override, subtotal))
        val expectedPercent = round2((expectedAmount / subtotal) * 100)
        assertEquals(expectedAmount, t.discountAmount)
        assertEquals(expectedPercent, t.discountPercent)
        assertEquals(round2(subtotal - expectedAmount), t.total)
    }

    @Test
    fun `an amount override above the subtotal is capped at the subtotal`() {
        val room = calculateSlab(SlabInput(4.0, 6.0))
        val subtotal = round2(room.subtotal)
        val override = subtotal + 1_000_000.0

        val t = projectTotal(listOf(room), discountAmountOverride = override)

        assertEquals(subtotal, t.discountAmount)
        assertEquals(100.0, t.discountPercent)
        assertEquals(0.0, t.total)
    }

    @Test
    fun `an empty room list gives all zeros`() {
        val t = projectTotal(emptyList())
        assertEquals(0.0, t.roomsSubtotal)
        assertEquals(0.0, t.discountPercent)
        assertEquals(0.0, t.discountAmount)
        assertEquals(0.0, t.total)
    }
}
