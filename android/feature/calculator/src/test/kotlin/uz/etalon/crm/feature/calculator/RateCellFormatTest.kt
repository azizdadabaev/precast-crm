package uz.etalon.crm.feature.calculator

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** §3.4 row 2 writes the rate cell's price in thousands: «140k · авто». */
class RateCellFormatTest {
    @Test fun `a whole-thousand tier drops its decimals`() {
        assertEquals("140k", formatRateK(140_000.0))
        assertEquals("230k", formatRateK(230_000.0))
    }

    @Test fun `a half-thousand price keeps one decimal, with the comma`() {
        assertEquals("162,5k", formatRateK(162_500.0))
    }
}
