package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** §3.4: a form input is `page`-filled with a hairline, radius md; the touch slot is D7's 48 dp. */
private val FIELD_MIN_HEIGHT = 48.dp

object EtalonTextFieldDefaults {
    /**
     * §1.1 tokens on M3's outlined field: the container is the page colour rather than white (a
     * white field on a white card has no edge), the hairline is [EtalonColors.surfaceBorder] and
     * only focus paints it [EtalonColors.indigo]. Text is `ink`, the placeholder and the
     * supporting line are `ink3`, and every error state is the one `red`.
     *
     * Disabled is deliberately the same fill at `ink3` text: this app disables a field to say
     * "not yet", never "never", and a greyed-out container reads as broken.
     */
    @Composable
    fun colors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = EtalonColors.ink,
        unfocusedTextColor = EtalonColors.ink,
        disabledTextColor = EtalonColors.ink3,
        errorTextColor = EtalonColors.ink,
        focusedContainerColor = EtalonColors.page,
        unfocusedContainerColor = EtalonColors.page,
        disabledContainerColor = EtalonColors.page,
        errorContainerColor = EtalonColors.page,
        cursorColor = EtalonColors.indigo,
        errorCursorColor = EtalonColors.red,
        focusedBorderColor = EtalonColors.indigo,
        unfocusedBorderColor = EtalonColors.surfaceBorder,
        disabledBorderColor = EtalonColors.surfaceBorder,
        errorBorderColor = EtalonColors.red,
        focusedPlaceholderColor = EtalonColors.ink3,
        unfocusedPlaceholderColor = EtalonColors.ink3,
        disabledPlaceholderColor = EtalonColors.ink3,
        errorPlaceholderColor = EtalonColors.ink3,
        focusedPrefixColor = EtalonColors.ink2,
        unfocusedPrefixColor = EtalonColors.ink2,
        disabledPrefixColor = EtalonColors.ink3,
        errorPrefixColor = EtalonColors.ink2,
        focusedSupportingTextColor = EtalonColors.ink3,
        unfocusedSupportingTextColor = EtalonColors.ink3,
        disabledSupportingTextColor = EtalonColors.ink3,
        errorSupportingTextColor = EtalonColors.red,
    )
}

/**
 * The app's one text input. An M3 [OutlinedTextField] with [EtalonTextFieldDefaults.colors] and
 * [EtalonShapes.md], so no screen has to remember the token list — and so the global constraint
 * "no `OutlinedTextField` with default colours" has somewhere to point.
 *
 * **This is the form field, not the table cell.** [FIELD_MIN_HEIGHT] is a floor, not the drawn
 * height: with [EtalonType.body] and M3's own content padding the field measures ~56 dp, and the
 * overload wrapped here takes no `contentPadding` to shrink it. §3.4's 40 dp numeric cells — the
 * room card's ЭНИ/БЎЙИ and the rate sheet's figures — are [androidx.compose.foundation.text.BasicTextField]s
 * drawn to their own geometry, the way [SearchField]'s 40 dp pill already is.
 *
 * @param prefix a fixed run before the value that is not part of it — «+998 » on a phone number.
 *   It is drawn, never typed, so [onValueChange] never sees it.
 * @param supportingText the line under the field. With [isError] it is the reason, in `red`;
 *   without, a hint in `ink3`.
 * @param enabled false greys the text to `ink3` and keeps the same `page` fill — this app disables
 *   a field to say "not yet", never "never", and a greyed-out container reads as broken.
 * @param readOnly the value is shown and selectable but not editable: a field waiting on a picker,
 *   not a disabled one.
 * @param keyboardActions what the IME action key does; pair it with [keyboardOptions]'s
 *   `imeAction` when a field hands focus on to the next one.
 * @param maxLines how far a multi-line field may grow before it scrolls inside itself — M3's own
 *   default, so a single-line field is still exactly one line. The comment composer caps at three.
 */
@Composable
fun EtalonTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    textStyle: TextStyle = EtalonType.body,
    prefix: String? = null,
    isError: Boolean = false,
    supportingText: String? = null,
) = OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = modifier.heightIn(min = FIELD_MIN_HEIGHT),
    enabled = enabled,
    readOnly = readOnly,
    textStyle = textStyle,
    placeholder = placeholder?.let { { Text(it, style = textStyle, maxLines = 1) } },
    prefix = prefix?.let { { Text(it, style = textStyle) } },
    supportingText = supportingText?.let { { Text(it, style = EtalonType.meta) } },
    isError = isError,
    singleLine = singleLine,
    maxLines = maxLines,
    keyboardOptions = keyboardOptions,
    keyboardActions = keyboardActions,
    visualTransformation = visualTransformation,
    shape = EtalonShapes.md,
    colors = EtalonTextFieldDefaults.colors(),
)
