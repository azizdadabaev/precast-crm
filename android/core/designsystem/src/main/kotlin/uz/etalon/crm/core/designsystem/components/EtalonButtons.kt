package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonElevation
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.designsystem.theme.etalonShadow

private val H_REGULAR = 46.dp
private val H_COMPACT = 36.dp

/**
 * The one shape every button in the system has. `clickable` is used rather than M3's `Button` so
 * the container, the ripple and the pressed fill are ours — M3's own colours, elevation overlay
 * and 40 dp minimum are all things this system does not want.
 *
 * D7: the painted height is 46 (36 compact), but [minimumInteractiveComponentSize] reserves the
 * 48 dp square around it that Compose's hit testing expands into, so the touch target is 48 dp
 * even where the pill is shorter. It has to sit outermost — it adds space around the button, it
 * does not stretch it.
 */
@Composable
private fun EtalonButtonBase(
    onClick: () -> Unit, enabled: Boolean, modifier: Modifier,
    height: Dp, shape: Shape, fill: Color, pressedFill: Color, border: Color?,
    onDark: Boolean, shadow: Color? = null, content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            .minimumInteractiveComponentSize()
            // §1.5: the primary button carries the system's only button shadow, and a disabled one
            // must not float — hence the colour is passed, not assumed. Shadow before the fill.
            .then(if (shadow != null) Modifier.etalonShadow(EtalonElevation.primaryButton, shape, shadow) else Modifier)
            .height(height)
            .clip(shape)
            .background(if (pressed && enabled) pressedFill else fill)
            .then(if (border != null) Modifier.border(EtalonSpace.hairline, border, shape) else Modifier)
            .clickable(
                enabled = enabled, role = Role.Button,
                interactionSource = interaction, indication = etalonRipple(onDark), onClick = onClick,
            )
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun RowScope.ButtonBody(text: String?, loading: Boolean, leading: ImageVector?, leadingIcon: Int?, color: Color) {
    when {
        loading -> { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = color); Spacer(Modifier.width(10.dp)) }
        leadingIcon != null -> { EtalonIcon(leadingIcon, null, size = 18.dp, tint = color); if (text != null) Spacer(Modifier.width(10.dp)) }
        // Kept for the feature screens that still pass a Material vector; phases 2–5 move each of
        // them to `leadingIcon` as they are redrawn.
        leading != null -> { Icon(leading, null, Modifier.size(18.dp), tint = color); if (text != null) Spacer(Modifier.width(10.dp)) }
    }
    if (text != null) Text(text, style = EtalonType.rowTitle, color = color, maxLines = 1)
}

/** The one action a screen exists for. Indigo pill, the system's only coloured shadow. */
@Composable
fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) {
    val on = enabled && !loading
    EtalonButtonBase(
        onClick = onClick, enabled = on,
        modifier = if (compact) modifier else modifier.fillMaxWidth(),
        height = if (compact) H_COMPACT else H_REGULAR,
        shape = EtalonShapes.pill,
        fill = if (on) EtalonColors.indigo else EtalonColors.lavenderBg,
        pressedFill = EtalonColors.indigoPressed,
        border = null, onDark = true,
        shadow = if (on) EtalonColors.indigo else null,
    ) { ButtonBody(text, loading, leading, leadingIcon, if (on) EtalonColors.onDark else EtalonColors.indigo.copy(alpha = 0.5f)) }
}

@Composable
fun SecondaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled && !loading,
    modifier = if (compact) modifier else modifier.fillMaxWidth(),
    height = if (compact) H_COMPACT else H_REGULAR,
    shape = EtalonShapes.pill,
    fill = EtalonColors.surface, pressedFill = EtalonColors.lavenderBg,
    border = EtalonColors.surfaceBorder, onDark = false,
) { ButtonBody(text, loading, leading, leadingIcon, if (enabled) EtalonColors.ink else EtalonColors.ink3) }

/** Destructive: delete a shipment, remove a photo. Not in §2 — kept because five feature files
 *  call it and deleting a payment-adjacent action is exactly where a red button earns its keep. */
@Composable
fun DangerButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled && !loading,
    modifier = if (compact) modifier else modifier.fillMaxWidth(),
    height = if (compact) H_COMPACT else H_REGULAR,
    shape = EtalonShapes.pill,
    fill = if (enabled) EtalonColors.red else EtalonColors.redBg, pressedFill = EtalonColors.red,
    border = null, onDark = true,
) { ButtonBody(text, loading, leading, leadingIcon, if (enabled) EtalonColors.onDark else EtalonColors.red) }

/** On navy: the quiet half of a pair («Рад этиш», the two icon actions on the summary sheet). */
@Composable
fun DarkButton(
    text: String? = null, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, leadingIcon: Int? = null,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled, modifier = modifier, height = H_REGULAR, shape = EtalonShapes.pill,
    fill = EtalonColors.navy2, pressedFill = EtalonColors.navy, border = null, onDark = true,
) { ButtonBody(text, false, null, leadingIcon, EtalonColors.onDark) }

/** On navy: the affirmative half — white pill, navy text. Give it `Modifier.weight(1f)`. */
@Composable
fun InverseButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) =
    EtalonButtonBase(
        onClick = onClick, enabled = enabled, modifier = modifier, height = H_REGULAR, shape = EtalonShapes.pill,
        fill = EtalonColors.surface, pressedFill = EtalonColors.lavenderBg, border = null, onDark = false,
    ) { ButtonBody(text, false, null, null, if (enabled) EtalonColors.navy else EtalonColors.ink3) }

/**
 * 36–40 dp square or pill. On light: white with a hairline. On dark: navy2, no border.
 * [badge] is the unread dot from `2b-home.png` — 7 dp red with a 1.5 dp ring in the surface
 * colour, so it reads as a hole punched in the button rather than a sticker on top of it.
 * The outer box is the 48 dp hit area (D7); [size] is what is painted inside it.
 */
@Composable
fun EtalonIconButton(
    icon: Int, contentDescription: String?, onClick: () -> Unit, modifier: Modifier = Modifier,
    onDark: Boolean = false, badge: Boolean = false, size: Dp = 40.dp,
    shape: Shape = EtalonShapes.pill, tint: Color? = null,
) = Box(modifier.size(EtalonSpace.minTouch), contentAlignment = Alignment.Center) {
    Box(
        Modifier
            .size(size).clip(shape)
            .background(if (onDark) EtalonColors.navy2 else EtalonColors.surface)
            .then(if (onDark) Modifier else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, shape))
            .clickable(indication = etalonRipple(onDark), interactionSource = remember { MutableInteractionSource() }, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { EtalonIcon(icon, contentDescription, size = 18.dp, tint = tint ?: if (onDark) EtalonColors.onDark else EtalonColors.ink) }
    if (badge) Box(
        Modifier.align(Alignment.TopEnd).offset(x = (-2).dp, y = 2.dp)
            .size(10.dp).clip(EtalonShapes.pill)
            .background(if (onDark) EtalonColors.navy2 else EtalonColors.surface)
            .padding(1.5.dp).clip(EtalonShapes.pill).background(EtalonColors.red),
    )
}
