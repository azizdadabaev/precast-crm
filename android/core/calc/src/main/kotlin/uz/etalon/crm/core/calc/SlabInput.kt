package uz.etalon.crm.core.calc

/**
 * Ported verbatim from `SlabInput` in `calculation-engine.ts` (lines 118-136). Field docs there —
 * summarized here only where the Kotlin type differs from the TS one.
 */
data class SlabInput(
    /** Inside-wall to inside-wall, perpendicular to beams (m). */
    val innerWidth: Double,
    /** Inside-wall to inside-wall, parallel to beams (m). */
    val innerLength: Double,
    /** How far the beam sits onto the wall on each side (m). Default [Calc.DEFAULT_BEARING]. */
    val bearing: Double? = null,
    /** Explicit pattern override; omit to use auto-pick. */
    val pattern: Pattern? = null,
    /** Length adjustment applied before pitch math. Default 0. */
    val correction: Double? = null,
    /** Manual extra beams (charged per linear meter at the extra-beam tier). Default 0. */
    val extraBeams: Int? = null,
    /**
     * Force a "starting beam" — promotes auto-picked GB to BGB by adding one beam. Has no effect
     * on BGB/GBG. (Excel column "Боши балка булиши шарт".)
     */
    val forceStartBeam: Boolean? = null,
)
