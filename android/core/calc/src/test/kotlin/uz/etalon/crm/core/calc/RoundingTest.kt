package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Pins the half-away-from-zero rounding rule against values where `Math.rint` or banker's
 * rounding would silently give a different, wrong answer. If this test fails, the port is wrong,
 * not the test — see the values' inline comments for the alternative each one rules out.
 */
class RoundingTest {
    @Test fun `roundN is half away from zero, like the JS engine`() {
        assertEquals(2.5, roundN(2.45, 1))
        assertEquals(-2.5, roundN(-2.45, 1))
        assertEquals(0.13, roundN(0.125, 2)) // rint would give 0.12
        assertEquals(-0.13, roundN(-0.125, 2))
        assertEquals(3.0, roundN(2.5, 0)) // banker's would give 2.0
        assertEquals(-3.0, roundN(-2.5, 0))
        assertEquals(4.646, round3(4.6455)) // the "half-away rounding length" golden input
    }

    @Test fun `roundN rejects a non-finite input instead of silently clamping it to a number`() {
        // Math.round(Double): Long turns NaN into 0 and +-Infinity into Long.MIN/MAX_VALUE — the
        // exact silent-zero failure mode this guard exists to close (see finding 4 of the
        // 2026-09-08 whole-branch review): a NaN price would otherwise quote a wall for free.
        assertThrows<IllegalArgumentException> { roundN(Double.NaN, 2) }
        assertThrows<IllegalArgumentException> { roundN(Double.POSITIVE_INFINITY, 2) }
        assertThrows<IllegalArgumentException> { roundN(Double.NEGATIVE_INFINITY, 2) }
    }
}
