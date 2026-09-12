package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.etalonRipple

/**
 * §2's key: `md` with the system's hairline, filling its row's share of the width. The one shape
 * behind both of this app's keypads — `NumericKeypad`'s 60 dp keys for sums and counts, and the
 * PIN pad's 64 dp ones — which had been two hand-copies of the same twenty lines.
 *
 * @param height the pad's own key height; the two differ because a PIN is typed one-handed and
 *   often outdoors. Both are past D7's 48 dp floor, so the caller states it rather than the
 *   component guessing.
 * @param fill the resting ground. The numeric pad sits INSIDE a white sheet, so its keys take the
 *   page colour to separate from it; the PIN pad sits ON the page, so its keys are white.
 * @param pressedFill what the key turns while a finger is on it — pass the same colour as [fill]
 *   for a pad where the ripple alone is feedback enough. The PIN pad states the press in fill as
 *   well, because a wrong PIN is three tries from locked out and the operator has to be able to
 *   see which digit their thumb actually landed on.
 * @param enabled false blocks the tap and drops the ripple; the caller greys the CONTENT, since
 *   only it knows whether that is a digit or an icon.
 */
@Composable
fun RowScope.EtalonKey(
    height: Dp,
    fill: Color,
    pressedFill: Color,
    onClick: () -> Unit,
    enabled: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        Modifier
            .weight(1f)
            .height(height)
            .clip(EtalonShapes.md)
            .background(if (pressed && enabled) pressedFill else fill)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
            .clickable(
                enabled = enabled,
                role = Role.Button,
                indication = etalonRipple(),
                interactionSource = interaction,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
        content = content,
    )
}
