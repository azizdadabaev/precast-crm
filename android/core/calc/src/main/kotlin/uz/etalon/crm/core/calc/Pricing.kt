package uz.etalon.crm.core.calc

/** One bracket of a per-beam-length price tier table: this price applies up to [maxBeamLength]. */
data class PriceTier(val maxBeamLength: Double, val price: Double)

/**
 * Live, editable pricing config. Bracket boundaries ([PriceTier.maxBeamLength]) are physical
 * factory constants — fixed. Only the prices inside the brackets are owner-editable server-side.
 */
data class PriceConfig(
    val m2PriceTiers: List<PriceTier>,
    val extraBeamPriceTiers: List<PriceTier>,
    val blockUnitPrice: Double,
)

// Ported verbatim from M2_PRICE_TIERS / EXTRA_BEAM_PRICE_TIERS / BLOCK_UNIT_PRICE in
// calculation-engine.ts. UZS integers, stored as Double per this module's IEEE-754 parity rule.
private val M2_PRICE_TIERS = listOf(
    PriceTier(4.30, 140_000.0),
    PriceTier(5.30, 160_000.0),
    PriceTier(6.30, 180_000.0),
    PriceTier(7.30, 200_000.0),
    PriceTier(8.30, 230_000.0),
)

private val EXTRA_BEAM_PRICE_TIERS = listOf(
    PriceTier(4.30, 60_000.0),
    PriceTier(5.30, 70_000.0),
    PriceTier(6.30, 80_000.0),
    PriceTier(7.30, 100_000.0),
    PriceTier(8.30, 120_000.0),
)

val DEFAULT_PRICE_CONFIG = PriceConfig(
    m2PriceTiers = M2_PRICE_TIERS,
    extraBeamPriceTiers = EXTRA_BEAM_PRICE_TIERS,
    blockUnitPrice = 6_000.0,
)

/** Picks the price for a beam length from a tier table; clamps above the last tier to its price. */
fun tierPrice(beamLength: Double, tiers: List<PriceTier>): Double {
    val eps = 1e-9
    for (t in tiers) if (beamLength <= t.maxBeamLength + eps) return t.price
    return tiers.last().price
}

/** The three precast layout patterns (Шаблон): Г-Б, Б-Г-Б, Г-Б-Г. */
enum class Pattern { GB, BGB, GBG }

data class AutoPick(val pattern: Pattern, val bumpPitches: Boolean)

/**
 * Auto-pick pattern from a post-correction remainder R. Caller bumps `pitches` for the
 * GB-at-N+1 case (`bumpPitches == true`).
 */
fun autoPickPattern(remainder: Double): AutoPick {
    val eps = 1e-9
    if (remainder <= eps) return AutoPick(Pattern.GB, false)
    if (remainder <= Calc.SMALL_REMAINDER + eps) return AutoPick(Pattern.BGB, false)
    if (remainder <= Calc.MEDIUM_REMAINDER + eps) return AutoPick(Pattern.GBG, false)
    return AutoPick(Pattern.GB, true)
}
