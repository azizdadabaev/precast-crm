package uz.etalon.crm.core.calc

/**
 * Ported verbatim from `SlabResult` in `calculation-engine.ts` (lines 138-198). See that file's
 * header and per-field docs for what each one means geometrically; not repeated here.
 *
 * Count fields (`pitches`, `blocksPerRow`, `beamCount`, `blockRows`, `totalBlocks`) are `Int` —
 * they come from `Math.floor`/`Math.ceil` in the TS source, ported as `kotlin.math.floor`/`ceil`
 * then `.toInt()`. Every other quantity is `Double`, matching the TS engine's untyped `number` so
 * the golden-vector replay can assert bit-for-bit parity.
 */
data class SlabResult(
    // Echoed inputs
    val innerWidth: Double,
    val innerLength: Double,
    val bearing: Double,
    val correction: Double,
    val extraBeams: Int,
    val forceStartBeam: Boolean,

    // Pitch math
    val effectiveLength: Double,
    val pitches: Int,
    val remainder: Double,
    val pattern: Pattern,
    val patternAuto: Pattern,

    // Geometry
    val beamLength: Double,
    val blocksPerRow: Int,
    val beamCount: Int,
    val blockRows: Int,
    val totalBlocks: Int,

    // Lengths (m)
    val monolithLength: Double,
    val billedLength: Double,

    // Areas (m²)
    val monolithArea: Double,
    val billedArea: Double,

    // Concrete topping volume (m³)
    val concreteVolume: Double,

    // Pricing
    val m2Price: Double,
    val extraBeamPricePerM: Double,
    val m2Cost: Double,
    val patternExtraCost: Double,
    val manualExtraBeamsCost: Double,
    val subtotal: Double,

    val isExtrasOnly: Boolean,
)

/**
 * The wire representation, keyed by the TS engine's snake_case field names — exactly the 28 keys
 * `docs/api/calc-golden.json` uses for a case's `result`. Count fields go through `.toDouble()`
 * here: the JSON they're compared against has no int/double distinction, so the parity test's
 * `asKotlin()` always decodes a JSON number as `Double`; [SlabResult] itself keeps them typed
 * `Int` as the real domain type for callers elsewhere in this module.
 */
internal fun SlabResult.toWireMap(): Map<String, Any> = mapOf(
    "inner_width" to innerWidth,
    "inner_length" to innerLength,
    "bearing" to bearing,
    "correction" to correction,
    "extra_beams" to extraBeams.toDouble(),
    "force_start_beam" to forceStartBeam,
    "effective_length" to effectiveLength,
    "pitches" to pitches.toDouble(),
    "remainder" to remainder,
    "pattern" to pattern.name,
    "pattern_auto" to patternAuto.name,
    "beam_length" to beamLength,
    "blocks_per_row" to blocksPerRow.toDouble(),
    "beam_count" to beamCount.toDouble(),
    "block_rows" to blockRows.toDouble(),
    "total_blocks" to totalBlocks.toDouble(),
    "monolith_length" to monolithLength,
    "billed_length" to billedLength,
    "monolith_area" to monolithArea,
    "billed_area" to billedArea,
    "concrete_volume" to concreteVolume,
    "m2_price" to m2Price,
    "extra_beam_price_per_m" to extraBeamPricePerM,
    "m2_cost" to m2Cost,
    "pattern_extra_cost" to patternExtraCost,
    "manual_extra_beams_cost" to manualExtraBeamsCost,
    "subtotal" to subtotal,
    "is_extras_only" to isExtrasOnly,
)
