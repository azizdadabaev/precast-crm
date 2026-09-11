package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.heightIn
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
 * [SearchField] stays its own thing: it is a 40 dp pill with a leading glyph, not a form field.
 *
 * @param prefix a fixed run before the value that is not part of it — «+998 » on a phone number.
 *   It is drawn, never typed, so [onValueChange] never sees it.
 * @param supportingText the line under the field. With [isError] it is the reason, in `red`;
 *   without, a hint in `ink3`.
 */
@Composable
fun EtalonTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    textStyle: TextStyle = EtalonType.body,
    prefix: String? = null,
    isError: Boolean = false,
    supportingText: String? = null,
) = OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = modifier.heightIn(min = FIELD_MIN_HEIGHT),
    textStyle = textStyle,
    placeholder = placeholder?.let { { Text(it, style = textStyle, maxLines = 1) } },
    prefix = prefix?.let { { Text(it, style = textStyle) } },
    supportingText = supportingText?.let { { Text(it, style = EtalonType.meta) } },
    isError = isError,
    singleLine = singleLine,
    keyboardOptions = keyboardOptions,
    visualTransformation = visualTransformation,
    shape = EtalonShapes.md,
    colors = EtalonTextFieldDefaults.colors(),
)
