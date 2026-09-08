package uz.etalon.crm.core.calc

/**
 * Physical constants for the precast beam-and-block engine, ported verbatim from
 * `precast-crm/src/services/calculation-engine.ts` (lines 54-65). Factory-fixed, not
 * user-tunable — see that file's header comment for what each one means geometrically.
 */
object Calc {
    const val PITCH = 0.58
    const val BEAM_WIDTH = 0.12
    const val BLOCK_LENGTH = 0.20
    const val BLOCK_VISIBLE = 0.45
    const val TOPPING_THICKNESS = 0.05
    const val DEFAULT_BEARING = 0.15

    // Auto-pick thresholds on the post-correction remainder R.
    const val SMALL_REMAINDER = 0.20
    const val MEDIUM_REMAINDER = 0.45
}
