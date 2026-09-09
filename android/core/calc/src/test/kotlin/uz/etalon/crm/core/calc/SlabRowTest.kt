package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
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

    /** `recomputeRow`'s own guard is `bearing >= 0` and `validate()` calls it "non-negative": a
     *  room resting wall to wall with no bearing at all is a REAL room, and a `>` slipping into
     *  either place would silently blank every one of them while every other test still passed. */
    @Test fun `a bearing of exactly zero is accepted, not treated as invalid`() {
        val r = recomputeRow(row(4.0, 6.0, bearing = 0.0))
        assertNotNull(r.result); assertTrue(r.canPersist)
        assertEquals(4.0, r.result!!.beamLength, "with no bearing the beam is the room's own width")
    }

    @Test fun `an engine rejection leaves result null instead of throwing`() {
        // NaN width never reaches the engine — `innerWidth > 0` is false, so the early guard
        // returns first. Kept because that guard is worth pinning too.
        assertNull(recomputeRow(row(Double.NaN, 6.0)).result)
        // +Infinity length is the case that actually exercises the try/catch: it PASSES the early
        // guard (`innerLength > 0`) and is then rejected inside validate() as non-finite. Without
        // this the catch has no executed coverage at all and could be deleted unnoticed.
        assertNull(recomputeRow(row(4.0, Double.POSITIVE_INFINITY)).result)
    }
}
