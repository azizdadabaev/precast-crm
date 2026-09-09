package uz.etalon.crm.core.calc

/**
 * A single room in the calculator's row layer, sitting above [calculateSlab]. Ported line-for-line
 * from `SlabRow` in `MultiRoomCalculator.tsx:35` — only the fields the engine layer needs (`name`,
 * the box/fromDrawing/originalWidth UI-only fields belong to a later screen-layer port, not here).
 */
data class SlabRow(
    val id: String,
    val name: String,
    val innerWidth: Double = 0.0,
    val innerLength: Double = 0.0,
    val bearing: Double = Calc.DEFAULT_BEARING,
    val correction: Double = 0.0,
    val extraBeams: Int = 0,
    val forceStartBeam: Boolean = false,
    /** null == the web's "AUTO": let the engine auto-pick. */
    val patternOverride: Pattern? = null,
    val m2PriceOverride: Boolean = false,
    val m2PriceOverrideValue: Double? = null,
    val m2PriceReason: String? = null,
    val result: SlabResult? = null,
) {
    /** False for an extras-only room: the engine computes it, but `innerLength` is `.positive()`
     *  in SaveProjectDraftSchema and PlaceOrderSchema, so the server would reject it. The screen
     *  blocks the save and names the room rather than dropping it. */
    val canPersist: Boolean get() = result != null && innerLength > 0
}

val M2_OVERRIDE_TIERS: List<PriceTier> = DEFAULT_PRICE_CONFIG.m2PriceTiers

/**
 * Run the engine for a single row. Returns the row with a fresh [SlabRow.result], or
 * `result = null` when the inputs are not valid yet — line-for-line from `recomputeRow` in
 * MultiRoomCalculator.tsx:241. An engine rejection is a not-yet-valid row, not a crash: the
 * operator is mid-typing, and a CalculationError here is expected traffic.
 */
fun recomputeRow(row: SlabRow, priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG): SlabRow {
    val hasSlab = row.innerLength > 0
    val hasExtrasOnly = row.innerLength == 0.0 && row.extraBeams >= 1
    if (!(row.innerWidth > 0 && row.bearing >= 0 && (hasSlab || hasExtrasOnly))) return row.copy(result = null)
    return try {
        val result = calculateSlab(
            SlabInput(
                innerWidth = row.innerWidth, innerLength = row.innerLength, bearing = row.bearing,
                pattern = row.patternOverride, correction = row.correction,
                extraBeams = row.extraBeams, forceStartBeam = row.forceStartBeam,
            ),
            priceConfig,
        )
        row.copy(result = applyRateOverride(result, row))
    } catch (e: CalculationError) {
        row.copy(result = null)
    }
}

/**
 * Replace the engine's auto-picked `m2Price` and recompute only the two figures that depend on
 * it. Defence in depth exactly as the TS has it: apply only when the value is a real catalogue
 * tier, because a restored draft could carry a corrupt one and the server's Zod would refuse it.
 */
internal fun applyRateOverride(result: SlabResult, row: SlabRow): SlabResult {
    if (!row.m2PriceOverride || row.m2PriceOverrideValue == null) return result
    if (M2_OVERRIDE_TIERS.none { it.price == row.m2PriceOverrideValue }) return result
    val newPrice = row.m2PriceOverrideValue
    val newCost = round2(result.billedArea * newPrice)
    return result.copy(
        m2Price = newPrice,
        m2Cost = newCost,
        subtotal = round2(newCost + result.patternExtraCost + result.manualExtraBeamsCost),
    )
}

/** The auto-picked rate for a row whatever its override state — the "Авто" label and the
 *  override sheet's comparison both read it. 0.0 when the row has not computed yet. */
fun autoPickedRate(row: SlabRow): Double {
    val r = row.result ?: return 0.0
    if (!row.m2PriceOverride) return r.m2Price
    return tierPrice(r.beamLength, M2_OVERRIDE_TIERS)
}
