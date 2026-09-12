package uz.etalon.crm.core.designsystem

import androidx.compose.ui.text.AnnotatedString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.PhoneDigitsMask

/** §3.4's `+998 90 ___ __ __`, moved here with the mask itself so both fields that draw a phone —
 *  the calculator's client form and the client edit sheet — are covered by one set of cases. */
class PhoneDigitsMaskTest {

    /** The nine stored digits as the field DRAWS them, behind its own fixed «+998 » prefix. The
     *  stored value never changes — `normalizePhone` and the lookup want bare digits. */
    @Test fun `the mask groups nine digits as 90 111 22 33`() {
        assertEquals("90 111 22 33", PhoneDigitsMask.filter(AnnotatedString("901112233")).text.text)
    }

    /** Half-typed numbers too: the mask is applied on every keystroke, not only to a full one. */
    @Test fun `the mask groups a partial number without trailing separators`() {
        listOf(
            "" to "",
            "9" to "9",
            "90" to "90",
            "901" to "90 1",
            "90111" to "90 111",
            "901112" to "90 111 2",
            "9011122" to "90 111 22",
            "90111223" to "90 111 22 3",
        ).forEach { (digits, drawn) ->
            assertEquals(drawn, PhoneDigitsMask.filter(AnnotatedString(digits)).text.text)
        }
    }

    /**
     * The offset mapping, both ways, across every group boundary of «90 111 22 33».
     *
     * This is the whole reason the mask is a `VisualTransformation` rather than a formatted value:
     * with the inserted spaces unmapped the caret and any selection drift by one character per
     * group, and backspace starts eating the wrong digit. Each original offset is checked against
     * the drawn one, and the round trip back.
     */
    @Test fun `the offset mapping survives every group boundary in both directions`() {
        val mapping = PhoneDigitsMask.filter(AnnotatedString("901112233")).offsetMapping
        // original 0..9 → transformed: +1 after «90», +1 more after «111», +1 more after «22».
        listOf(0 to 0, 1 to 1, 2 to 2, 3 to 4, 5 to 6, 6 to 8, 7 to 9, 8 to 11, 9 to 12)
            .forEach { (original, transformed) ->
                assertEquals(
                    transformed,
                    mapping.originalToTransformed(original),
                    "original $original draws at $transformed",
                )
                assertEquals(
                    original,
                    mapping.transformedToOriginal(transformed),
                    "and back again from $transformed",
                )
            }
    }

    /** A caret dropped ON one of the inserted spaces belongs to the digit before it — never past
     *  the end of the nine digits actually stored. */
    @Test fun `an offset inside an inserted space maps back to the digit before it`() {
        val mapping = PhoneDigitsMask.filter(AnnotatedString("901112233")).offsetMapping
        assertEquals(2, mapping.transformedToOriginal(3))  // the space after «90»
        assertEquals(5, mapping.transformedToOriginal(7))  // the space after «111»
        assertEquals(7, mapping.transformedToOriginal(10)) // the space after «22»
    }
}
