package uz.etalon.crm.feature.calculator

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import java.math.BigDecimal

/** §3.4 row 2 writes the rate cell's price in thousands: «140k · авто». */
class RateCellFormatTest {
    @Test fun `a whole-thousand tier drops its decimals`() {
        assertEquals("140k", formatRateK(140_000.0))
        assertEquals("230k", formatRateK(230_000.0))
    }

    @Test fun `a half-thousand price keeps one decimal, with the comma`() {
        assertEquals("162,5k", formatRateK(162_500.0))
    }

    /**
     * M2. `formatRateK` rounds to ONE decimal, which is enough for every tier the catalogue has
     * (140 000 · 162 500 · 185 000 · 207 500 · 230 000 — halves of a thousand at worst). A tier
     * priced 162 550 would print «162,6k» — a rate cell, and the rate sheet's own rows, showing a
     * price nobody set, with no visible sign that a digit was dropped.
     *
     * So the rule is pinned where it can be checked instead of trusted: every catalogue price must
     * be exact at one decimal of a thousand. An owner who adds a tier that is not fails HERE, with
     * the price in the message, rather than shipping a rounded figure to an operator quoting a
     * customer.
     */
    @Test fun `every catalogue tier is exact at one decimal of a thousand`() {
        for (tier in M2_OVERRIDE_TIERS) {
            val printed = formatRateK(tier.price)
            val thousands = BigDecimal(printed.removeSuffix("k").replace(',', '.'))
            assertEquals(
                BigDecimal.valueOf(tier.price).stripTrailingZeros(),
                thousands.multiply(BigDecimal(1000)).stripTrailingZeros(),
                "«$printed» is not the tier priced ${tier.price} — formatRateK keeps one decimal",
            )
        }
    }
}
