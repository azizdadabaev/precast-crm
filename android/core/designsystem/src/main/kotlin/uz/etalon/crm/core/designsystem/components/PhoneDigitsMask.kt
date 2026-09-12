package uz.etalon.crm.core.designsystem.components

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation

/** `normalizePhone` turns exactly nine local digits into `998` + those nine — the length every
 *  phone field in the app stores and the length [PhoneDigitsMask] draws.
 *
 *  A field wearing this mask must filter its input with **ASCII** `'0'..'9'`, never
 *  `Char.isDigit()`: Kotlin's is Unicode-aware and accepts an Arabic-Indic or Devanagari digit
 *  that `normalizePhone`'s own filter — and the server's `/\D+/` — throws away, so the number the
 *  operator sees typed and the number the CRM stores would differ. Phone is this product's unique
 *  customer identity, so that difference is a customer saved under a phone nobody can look up. */
const val PHONE_LOCAL_DIGITS = 9

/**
 * §3.4's phone mask, `+998 90 ___ __ __`: the nine stored digits drawn as `90 123 45 67` behind an
 * [EtalonTextField]'s own fixed «+998 » prefix.
 *
 * Only the DRAWING changes — the field's value stays nine bare digits, which is what
 * `normalizePhone` and the by-phone lookup want. The offset mapping is the reason this is a
 * transformation rather than a formatted value: with the spaces unmapped the caret and any
 * selection drift by one character per group, and backspace starts eating the wrong digit.
 *
 * It lives here rather than beside one screen because a phone is the same object wherever it is
 * typed — the calculator's client form and the client edit sheet are the same field, and an
 * operator who learns to read the grouping in one must find it in the other.
 */
object PhoneDigitsMask : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val d = text.text.take(PHONE_LOCAL_DIGITS)
        val out = buildString {
            d.forEachIndexed { i, c ->
                // The group boundaries of `90 123 45 67`, counted in original digits.
                if (i == 2 || i == 5 || i == 7) append(' ')
                append(c)
            }
        }
        return TransformedText(AnnotatedString(out), PhoneOffsets)
    }
}

/** How many spaces [PhoneDigitsMask] has inserted before a given original offset, and back. */
private object PhoneOffsets : OffsetMapping {
    override fun originalToTransformed(offset: Int): Int = when {
        offset <= 2 -> offset
        offset <= 5 -> offset + 1
        offset <= 7 -> offset + 2
        else -> offset + 3
    }

    override fun transformedToOriginal(offset: Int): Int = when {
        offset <= 2 -> offset
        offset <= 6 -> offset - 1
        offset <= 9 -> offset - 2
        else -> offset - 3
    }
}
