package uz.etalon.crm.core.calc

import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.model.PriceTier as ModelPriceTier

/**
 * Tests the only boundary in the app where a calc-engine `Double` becomes `Money`. See
 * [Boundary.kt][moneyOf] for why `BigDecimal.valueOf` is safe here and the constructor is not.
 *
 * Money-field assertions compare two real [Money] values, never a `Double` to a `Double` — a
 * `Double`-to-`Double` comparison would prove nothing about the conversion itself. They compare
 * via [BigDecimal.compareTo] (numeric value), not [Money.equals]: `Money` is a value class over
 * `BigDecimal`, and `BigDecimal.equals` is scale-sensitive (`2.0 != 2.00`). A golden vector's wire
 * literal like `"3491600"` parses at scale 0, while [moneyOf] always produces scale 2 (per the
 * `setScale(2, UNNECESSARY)` in the boundary itself) — so a raw `assertEquals(Money, Money)` on
 * those two would fail even on a correct conversion, for a reason that has nothing to do with
 * correctness. `compareTo` asserts what actually matters: the same amount.
 */
class BoundaryTest {

    /** Parses [expectedWire] as [Money] and asserts it equals [actual] by numeric value, not by
     *  `BigDecimal` scale — see the class doc for why scale differs legitimately here. */
    private fun assertMoneyEquals(expectedWire: String, actual: Money, message: String) {
        val expected = Money.parse(expectedWire)
        assertEquals(0, expected.amount.compareTo(actual.amount)) { "$message: expected $expected got $actual" }
    }

    @TestFactory
    fun `every money field of every golden vector converts to Money losslessly`() =
        GoldenVectors.slab.cases.map { c ->
            DynamicTest.dynamicTest(c.name) {
                val m = calculateSlab(c.input.toSlabInput(), GoldenVectors.slab.pricing.toPriceConfig()).money()
                assertMoneyEquals(c.result.getValue("subtotal").content, m.subtotal, c.name)
                assertMoneyEquals(c.result.getValue("m2_cost").content, m.m2Cost, c.name)
                assertMoneyEquals(c.result.getValue("pattern_extra_cost").content, m.patternExtraCost, c.name)
                assertMoneyEquals(c.result.getValue("manual_extra_beams_cost").content, m.manualExtraBeamsCost, c.name)
                assertMoneyEquals(c.result.getValue("m2_price").content, m.m2Price, c.name)
                assertMoneyEquals(c.result.getValue("extra_beam_price_per_m").content, m.extraBeamPricePerM, c.name)
            }
        }

    @Test
    fun `the conversion is exact at the Decimal(14,2) ceiling and on a fractional cost`() {
        assertMoneyEquals("999999999999.99", moneyOf(999999999999.99), "ceiling")
        // BigDecimal(0.1) (the constructor) would give 0.1000000000000000055…, which setScale(2,
        // UNNECESSARY) would reject — this is the case that fails if valueOf is swapped for it.
        assertMoneyEquals("0.10", moneyOf(0.1), "fractional cost")
    }

    @Test
    fun `Android pricing converts to engine doubles that pick the same tiers as the exported pricing block`() {
        val fromAndroid = androidDefaultPricing().toPriceConfig()
        val fromGolden = GoldenVectors.slab.pricing.toPriceConfig()
        assertEquals(fromGolden, fromAndroid)
        listOf(4.3, 4.3000001, 5.3, 9.0).forEach {
            assertEquals(tierPrice(it, fromGolden.m2PriceTiers), tierPrice(it, fromAndroid.m2PriceTiers))
        }
    }
}

/** The `Pricing` the server's bootstrap sends for the default tiers — same wire strings as
 *  [DEFAULT_PRICE_CONFIG] ("4.30", "140000", …) and the golden file's `pricing` block, but
 *  constructed the way `:core:data`'s `SessionMappers` builds it: from `BigDecimal`/[Money]. */
private fun androidDefaultPricing(): Pricing = Pricing(
    m2Tiers = listOf(
        ModelPriceTier(BigDecimal("4.30"), Money.parse("140000")),
        ModelPriceTier(BigDecimal("5.30"), Money.parse("160000")),
        ModelPriceTier(BigDecimal("6.30"), Money.parse("180000")),
        ModelPriceTier(BigDecimal("7.30"), Money.parse("200000")),
        ModelPriceTier(BigDecimal("8.30"), Money.parse("230000")),
    ),
    extraBeamTiers = listOf(
        ModelPriceTier(BigDecimal("4.30"), Money.parse("60000")),
        ModelPriceTier(BigDecimal("5.30"), Money.parse("70000")),
        ModelPriceTier(BigDecimal("6.30"), Money.parse("80000")),
        ModelPriceTier(BigDecimal("7.30"), Money.parse("100000")),
        ModelPriceTier(BigDecimal("8.30"), Money.parse("120000")),
    ),
    blockUnitPrice = Money.parse("6000"),
)
