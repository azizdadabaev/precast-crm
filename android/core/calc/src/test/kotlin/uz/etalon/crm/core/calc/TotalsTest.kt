package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TotalsTest {
    @Test fun `an empty list totals to zero everywhere`() {
        val t = projectTotals(emptyList(), 0.0, 0.0)
        assertEquals(0.0, t.projTotal.total); assertEquals(0, t.beams); assertEquals(0.0, t.monolithArea)
    }
    @Test fun `only computed rows count, and the discount goes through projectTotal`() {
        val a = recomputeRow(SlabRow("a", "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        val t = projectTotals(listOf(a, SlabRow("b", "Хона 2")), 10.0, 0.0)
        assertEquals(projectTotal(listOf(a.result!!), 10.0, 0.0), t.projTotal)
        assertEquals(a.result!!.beamCount, t.beams)
    }
    @Test fun `an explicit discount amount wins over the percent, as the engine resolves it`() {
        val a = recomputeRow(SlabRow("a", "Хона 1", innerWidth = 4.0, innerLength = 6.0))
        assertEquals(50_000.0, projectTotals(listOf(a), 10.0, 50_000.0).projTotal.discountAmount)
    }
}
