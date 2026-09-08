package uz.etalon.crm.core.calc

import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
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
                // Same per-case pricing fallback as SlabParityTest — see GoldenVectors.SlabCase.pricing.
                val priceConfig = (c.pricing ?: GoldenVectors.slab.pricing).toPriceConfig()
                val m = calculateSlab(c.input.toSlabInput(), priceConfig).money()
                assertMoneyEquals(c.result.getValue("subtotal").content, m.subtotal, c.name)
                assertMoneyEquals(c.result.getValue("m2_cost").content, m.m2Cost, c.name)
                assertMoneyEquals(c.result.getValue("pattern_extra_cost").content, m.patternExtraCost, c.name)
                assertMoneyEquals(c.result.getValue("manual_extra_beams_cost").content, m.manualExtraBeamsCost, c.name)
                assertMoneyEquals(c.result.getValue("m2_price").content, m.m2Price, c.name)
                assertMoneyEquals(c.result.getValue("extra_beam_price_per_m").content, m.extraBeamPricePerM, c.name)
            }
        }

    @TestFactory
    fun `every field of every project golden vector converts to Money losslessly`() =
        GoldenVectors.project.cases.map { c ->
            DynamicTest.dynamicTest(c.name) {
                val rooms = c.roomSubtotals.map { stubRoom(it) }
                val m = projectTotal(rooms, c.discountPercent, c.discountAmountOverride).money()
                assertMoneyEquals(c.result.getValue("rooms_subtotal").content, m.roomsSubtotal, c.name)
                assertMoneyEquals(c.result.getValue("discount_amount").content, m.discountAmount, c.name)
                assertMoneyEquals(c.result.getValue("total").content, m.total, c.name)
                // discountPercent stays BigDecimal, not Money — it's a percentage, not an amount.
                // Compared the same way (numeric value, not scale): the wire literal ("10", "13.33",
                // "100") and BigDecimal.valueOf(Double) need not share a scale to be the same number.
                val expectedPercent = BigDecimal(c.result.getValue("discount_percent").content)
                assertEquals(0, expectedPercent.compareTo(m.discountPercent)) {
                    "${c.name}: expected discountPercent $expectedPercent got ${m.discountPercent}"
                }
            }
        }

    @Test
    fun `the conversion is exact at the Decimal(14,2) ceiling and on a fractional cost`() {
        assertMoneyEquals("999999999999.99", moneyOf(999999999999.99), "ceiling")
        // BigDecimal(0.1) (the constructor) would give 0.1000000000000000055…, which setScale(2,
        // UNNECESSARY) would reject — this is the case that fails if valueOf is swapped for it.
        assertMoneyEquals("0.10", moneyOf(0.1), "fractional cost")
        // moneyOf always lands at scale 2 — Money.equals is scale-sensitive (BigDecimal's is),
        // and ConfirmQueueViewModel.kt:78,131 compares with compareTo rather than != precisely
        // because a server-derived Money and a locally-built one can differ in scale.
        assertEquals(2, moneyOf(999999999999.99).amount.scale())
        assertEquals(2, moneyOf(0.1).amount.scale())
    }

    @Test
    fun `moneyOf throws rather than silently round when a double still carries a third decimal`() {
        // Pins RoundingMode.UNNECESSARY as moneyOf's contract. Every engine money field is
        // round2'd before it reaches this boundary, so in practice this never happens — but the
        // plausible "fix" for a red test here is swapping in RoundingMode.HALF_UP, which would
        // pass every other assertion in this file silently while quietly shaving a sum that's
        // actually invoiced to a customer. This test exists to fail loudly if that swap is ever
        // made: 0.005 has a third decimal, so setScale(2, UNNECESSARY) must throw.
        assertThrows(ArithmeticException::class.java) { moneyOf(0.005) }
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
 *  `DEFAULT_PRICE_CONFIG`'s TS source comments ("4.30", "140000", …), constructed the way
 *  `:core:data`'s `SessionMappers` builds it: from `BigDecimal`/[Money]. The golden file's
 *  `pricing` block reads `4.3`, not `4.30`: the server persists tier boundaries as plain JS
 *  numbers and serialises them as the shortest round-tripping literal (see
 *  `precast-crm/src/lib/pricing-config.ts` and `SessionMappersTest.kt:25`) — same numeric value,
 *  different literal, which is why [Pricing.toPriceConfig] compares tiers as `BigDecimal`/`Double`
 *  and never as strings. */
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

/** A room stub carrying only [subtotal] — `projectTotal` only ever reads `room.subtotal`, matching
 *  the exporter's `{ subtotal } as SlabResult` (`precast-crm/scripts/export-calc-golden.ts`). */
private fun stubRoom(subtotal: Double): SlabResult = SlabResult(
    innerWidth = 0.0,
    innerLength = 0.0,
    bearing = 0.0,
    correction = 0.0,
    extraBeams = 0,
    forceStartBeam = false,
    effectiveLength = 0.0,
    pitches = 0,
    remainder = 0.0,
    pattern = Pattern.GB,
    patternAuto = Pattern.GB,
    beamLength = 0.0,
    blocksPerRow = 0,
    beamCount = 0,
    blockRows = 0,
    totalBlocks = 0,
    monolithLength = 0.0,
    billedLength = 0.0,
    monolithArea = 0.0,
    billedArea = 0.0,
    concreteVolume = 0.0,
    m2Price = 0.0,
    extraBeamPricePerM = 0.0,
    m2Cost = 0.0,
    patternExtraCost = 0.0,
    manualExtraBeamsCost = 0.0,
    subtotal = subtotal,
    isExtrasOnly = false,
)
