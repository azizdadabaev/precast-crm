package uz.etalon.crm.core.calc

import kotlin.math.ceil
import kotlin.math.floor

/**
 * Line-by-line Kotlin port of `calculateSlab` / `calculateExtrasOnly` in
 * `precast-crm/src/services/calculation-engine.ts` (lines 237-484). Same order, same rounding at
 * the same points — see that file's header comment for the three length concepts and the
 * start-beam promotion; this file does not repeat that explanation.
 *
 * Pure. No Android UI, network, DB, or logging — see the module's ground rules.
 */

private fun validate(input: SlabInput, bearing: Double) {
    if (!input.innerWidth.isFinite() || input.innerWidth <= 0) {
        throw CalculationError("inner_width must be a positive finite number (meters)")
    }

    // length=0 is normally invalid, but is allowed in "extras-only mode": operator wants to bill
    // a few extra beams (reinforcing beams, edge beams in a balcony, etc.) without a full room
    // slab. Requires extras>=1; without extras the row would have nothing to compute.
    val isExtrasOnlyMode = input.innerLength == 0.0 && (input.extraBeams ?: 0) >= 1
    if (!isExtrasOnlyMode) {
        if (!input.innerLength.isFinite() || input.innerLength <= 0) {
            throw CalculationError("inner_length must be a positive finite number (meters)")
        }
    } else if (!input.innerLength.isFinite()) {
        // Even in extras-only mode, NaN/Infinity for length is still wrong.
        throw CalculationError("inner_length must be a finite number")
    }

    if (!bearing.isFinite() || bearing < 0) {
        throw CalculationError("bearing must be a non-negative finite number (meters)")
    }
    // TS also rejects a non-integer extra_beams (e.g. 1.5); Kotlin's Int? makes that
    // unrepresentable at the call site, so only the non-negative check applies here.
    if (input.extraBeams != null && input.extraBeams < 0) {
        throw CalculationError("extra_beams must be a non-negative integer")
    }
}

fun calculateSlab(input: SlabInput, priceConfig: PriceConfig = DEFAULT_PRICE_CONFIG): SlabResult {
    val bearing = input.bearing ?: Calc.DEFAULT_BEARING
    val correction = input.correction ?: 0.0
    val extraBeams = input.extraBeams ?: 0
    val forceStartBeam = input.forceStartBeam ?: false

    validate(input, bearing)

    // Extras-only short-circuit. validate() already accepted the case; the rest of calculateSlab
    // assumes a real slab. See SlabResult.isExtrasOnly's doc for what UI/persistence should do.
    if (input.innerLength == 0.0 && extraBeams >= 1) {
        return calculateExtrasOnly(input, bearing, extraBeams, priceConfig)
    }

    // Geometry that doesn't depend on pattern
    val beamLength = round3(input.innerWidth + 2 * bearing)
    val blocksPerRow = ceil(input.innerWidth / Calc.BLOCK_LENGTH).toInt()

    // Pitch math
    val effectiveLength = round3(input.innerLength + correction)
    var pitches = floor(effectiveLength / Calc.PITCH).toInt()
    var remainder = round3(effectiveLength - pitches * Calc.PITCH)

    // Auto-pick on the floor-pitch remainder
    val auto = autoPickPattern(remainder)
    val patternAuto = auto.pattern

    // Choose final pattern: explicit override > force_start_beam > auto
    var pattern: Pattern
    if (input.pattern != null) {
        pattern = input.pattern
        // Explicit override never bumps pitches; user controls that via `correction`.
    } else if (auto.bumpPitches) {
        // Auto picked GB-at-N+1
        pitches += 1
        remainder = 0.0
        pattern = Pattern.GB
    } else {
        pattern = patternAuto
    }

    // "Add a starting beam" — pattern-aware promotion. The start beam may come from the StartB
    // toggle (forceStartBeam) OR the first manual extra (+B). Whichever is consumed is what
    // produces the conversion.
    var effectiveExtraBeams = extraBeams
    if (pattern == Pattern.GBG && (forceStartBeam || effectiveExtraBeams >= 1)) {
        // Г-Б-Г + start beam → Г-Б at pitches+1 (the extra block row is balanced)
        pitches += 1
        pattern = Pattern.GB
        if (!forceStartBeam) effectiveExtraBeams -= 1
    } else if (pattern == Pattern.GB && forceStartBeam) {
        // Г-Б + start beam → Б-Г-Б at same pitches (closing beam added)
        pattern = Pattern.BGB
    }
    // BGB + start beam: already starts with a beam → no-op

    // Pattern → counts and visual extension
    val beamCountBase: Int
    val blockRows: Int
    val extension: Double
    when (pattern) {
        Pattern.GB -> {
            beamCountBase = pitches
            blockRows = pitches
            extension = 0.0
        }
        Pattern.BGB -> {
            beamCountBase = pitches + 1
            blockRows = pitches
            extension = Calc.BEAM_WIDTH
        }
        Pattern.GBG -> {
            beamCountBase = pitches
            blockRows = pitches + 1
            extension = Calc.BLOCK_VISIBLE
        }
    }

    val beamCount = beamCountBase + effectiveExtraBeams
    val totalBlocks = blocksPerRow * blockRows

    // Lengths — three concepts, see calculation-engine.ts's file header.
    //
    // GBG billing rule: the pattern's closing block row is folded into the billed slab length so
    // it is m²-billed at the tier rate, rather than being a separate per-block line item. BGB
    // still bills its closing beam separately at the per-meter extra-beam tier.
    val patternBilledExtension = if (pattern == Pattern.GBG) extension else 0.0
    val billedLength = round3(pitches * Calc.PITCH + patternBilledExtension)
    val slabLength = round3(pitches * Calc.PITCH + extension)
    val monolithLength = round3(slabLength + effectiveExtraBeams * Calc.BEAM_WIDTH)

    // Areas
    val billedArea = round3(beamLength * billedLength)
    val monolithArea = round3(beamLength * monolithLength)

    // Concrete topping volume — poured over the physically built slab (does NOT include the
    // visual extension from manual extra beams).
    val concreteVolume = round3(beamLength * slabLength * Calc.TOPPING_THICKNESS)

    // Pricing — sourced from the caller's config so AppConfig overrides take effect on every new
    // calculation. Defaults back to the module constants when no override is passed.
    val m2Price = tierPrice(beamLength, priceConfig.m2PriceTiers)
    val extraBeamPricePerM = tierPrice(beamLength, priceConfig.extraBeamPriceTiers)
    val m2Cost = round2(billedArea * m2Price)
    // GBG's patternExtraCost is 0 — the closing block row is m²-billed via the expanded
    // billedLength above. BGB's extra closing beam still bills separately at the per-meter
    // extra-beam tier.
    val patternExtraCost = if (pattern == Pattern.BGB) round2(beamLength * extraBeamPricePerM) else 0.0
    val manualExtraBeamsCost = round2(effectiveExtraBeams * beamLength * extraBeamPricePerM)
    val subtotal = round2(m2Cost + patternExtraCost + manualExtraBeamsCost)

    return SlabResult(
        innerWidth = input.innerWidth,
        innerLength = input.innerLength,
        bearing = bearing,
        correction = correction,
        extraBeams = extraBeams,
        forceStartBeam = forceStartBeam,
        effectiveLength = effectiveLength,
        pitches = pitches,
        remainder = remainder,
        pattern = pattern,
        patternAuto = patternAuto,
        beamLength = beamLength,
        blocksPerRow = blocksPerRow,
        beamCount = beamCount,
        blockRows = blockRows,
        totalBlocks = totalBlocks,
        monolithLength = monolithLength,
        billedLength = billedLength,
        monolithArea = monolithArea,
        billedArea = billedArea,
        concreteVolume = concreteVolume,
        m2Price = m2Price,
        extraBeamPricePerM = extraBeamPricePerM,
        m2Cost = m2Cost,
        patternExtraCost = patternExtraCost,
        manualExtraBeamsCost = manualExtraBeamsCost,
        subtotal = subtotal,
        isExtrasOnly = false,
    )
}

// ── Extras-only mode ───────────────────────────────────────────
//
// Operator entered width and a number of extra beams but NO length — they want N
// reinforcing/edge beams as their own line item, with no underlying slab. Engine produces a row
// that bills purely on the per-meter extra-beam tier; pattern/pitch/m² fields return 0 and the UI
// renders them as em-dashes. concreteVolume covers the actual physical footprint of the extras
// (width × N × BEAM_WIDTH × topping).

private fun calculateExtrasOnly(
    input: SlabInput,
    bearing: Double,
    extraBeams: Int,
    priceConfig: PriceConfig,
): SlabResult {
    val beamLength = round3(input.innerWidth + 2 * bearing)
    val slabLength = round3(extraBeams * Calc.BEAM_WIDTH)
    val slabArea = round3(input.innerWidth * slabLength)

    val extraBeamPricePerM = tierPrice(beamLength, priceConfig.extraBeamPriceTiers)
    val extrasSubtotal = round2(extraBeams * beamLength * extraBeamPricePerM)

    return SlabResult(
        innerWidth = input.innerWidth,
        innerLength = 0.0,
        bearing = bearing,
        correction = input.correction ?: 0.0,
        extraBeams = extraBeams,
        forceStartBeam = input.forceStartBeam ?: false,

        // No pitch math in extras-only mode.
        effectiveLength = 0.0,
        pitches = 0,
        remainder = 0.0,
        pattern = Pattern.GB, // sentinel; UI ignores when isExtrasOnly
        patternAuto = Pattern.GB, // sentinel

        beamLength = beamLength,
        blocksPerRow = 0,
        beamCount = extraBeams,
        blockRows = 0,
        totalBlocks = 0,

        monolithLength = slabLength, // = extras × 0.12
        billedLength = 0.0, // m² billing not used

        monolithArea = slabArea,
        billedArea = 0.0, // m² billing not used

        concreteVolume = round3(input.innerWidth * slabLength * Calc.TOPPING_THICKNESS),

        m2Price = 0.0, // sentinel: not applicable
        extraBeamPricePerM = extraBeamPricePerM,
        m2Cost = 0.0, // not used in extras-only
        patternExtraCost = 0.0, // no pattern, no pattern extras
        manualExtraBeamsCost = extrasSubtotal,
        subtotal = extrasSubtotal,

        isExtrasOnly = true,
    )
}
