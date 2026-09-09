package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SlabRowTest {
    private fun row(w: Double, l: Double, extras: Int = 0, bearing: Double = 0.15) =
        SlabRow(id = "r", name = "Хона 1", innerWidth = w, innerLength = l, extraBeams = extras, bearing = bearing)

    @Test fun `a row with no dimensions yet has no result`() {
        assertNull(recomputeRow(row(0.0, 0.0)).result)
        assertNull(recomputeRow(row(4.0, 0.0)).result)            // length 0 and no extras
        assertNull(recomputeRow(row(0.0, 6.0)).result)            // width 0
        assertNull(recomputeRow(row(4.0, 6.0, bearing = -0.1)).result)
    }
    @Test fun `extras-only is computable but not persistable`() {
        val r = recomputeRow(row(4.2, 0.0, extras = 3))
        assertNotNull(r.result); assertTrue(r.result!!.isExtrasOnly); assertFalse(r.canPersist)
    }
    @Test fun `a real room computes and persists`() {
        val r = recomputeRow(row(4.0, 6.0))
        assertNotNull(r.result); assertTrue(r.canPersist)
    }
    @Test fun `an engine rejection leaves result null instead of throwing`() {
        assertNull(recomputeRow(row(Double.NaN, 6.0)).result)
    }
}
