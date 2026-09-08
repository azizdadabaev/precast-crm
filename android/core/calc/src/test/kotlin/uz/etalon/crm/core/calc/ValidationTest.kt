package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows

/**
 * Ports the input-rejection contract from `calculateSlab`/`validate` in `calculation-engine.ts`
 * (rejection cases in `precast-crm/tests/calculation-engine.test.ts:574-589`) against this
 * module's `validate()`, reached through [calculateSlab]. `validate()` itself was written in
 * Task 2's `CalculateSlab.kt`; this file only exercises it.
 *
 * One TS case — non-integer `extra_beams` (`1.5`) — is unrepresentable here: `SlabInput.extraBeams`
 * is `Int?`, which cannot hold a fractional value. See the task-3 report for that note.
 *
 * Each case asserts the thrown message verbatim (copied from `validate()` in
 * `calculation-engine.ts`) — not just that SOME `CalculationError` was thrown — the same
 * technique `GazoblokParityTest`'s `rejects` replay already uses on the gazoblok side. Without
 * this, a message typo in `CalculateSlab.kt`'s `validate()` would ship silently.
 */
class ValidationTest {

    @Test
    fun `the engine rejects what the server rejects, with the server's verbatim message`() {
        listOf(
            SlabInput(0.0, 6.0) to "inner_width must be a positive finite number (meters)",
            SlabInput(-1.0, 6.0) to "inner_width must be a positive finite number (meters)",
            SlabInput(4.0, 0.0) to "inner_length must be a positive finite number (meters)", // length 0 without extras
            SlabInput(Double.NaN, 6.0) to "inner_width must be a positive finite number (meters)",
            SlabInput(4.0, Double.POSITIVE_INFINITY) to "inner_length must be a positive finite number (meters)",
            SlabInput(4.0, 6.0, bearing = -0.1) to "bearing must be a non-negative finite number (meters)",
            SlabInput(4.0, 6.0, extraBeams = -1) to "extra_beams must be a non-negative integer",
        ).forEach { (input, expectedMessage) ->
            val ex = assertThrows<CalculationError>(input.toString()) { calculateSlab(input) }
            assertEquals(expectedMessage, ex.message, input.toString())
        }
    }

    @Test
    fun `extras-only mode is accepted, but not with a non-finite length`() {
        assertTrue(calculateSlab(SlabInput(4.2, 0.0, extraBeams = 3)).isExtrasOnly)
        assertThrows<CalculationError> { calculateSlab(SlabInput(4.2, Double.NaN, extraBeams = 3)) }
    }
}
