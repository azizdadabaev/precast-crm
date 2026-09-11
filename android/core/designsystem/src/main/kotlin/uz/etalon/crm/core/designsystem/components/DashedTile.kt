package uz.etalon.crm.core.designsystem.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonShapes

/**
 * §2's "add one of these" outline: a 1 dp dash, 6 on / 5 off, drawn on the `lg` corner. Compose
 * has no dashed-border modifier, so it is a `drawBehind` stroke with a `PathEffect`.
 *
 * The radius is read from [EtalonShapes.lg] rather than restated, so the dash can never drift from
 * the `clip` it is drawn inside — that pair is the one place a 12 dp literal used to live twice,
 * in `AddTile` and in `PhotoStrip`'s add square.
 *
 * The stroke is inset by half its width: drawn on the boundary it would be half-eaten by the clip.
 * Apply it **after** the `clip` and before the `clickable`.
 */
internal fun Modifier.dashedTileBorder(color: Color): Modifier = drawBehind {
    val w = DASH_STROKE.toPx()
    val radius = EtalonShapes.lg.topStart.toPx(size, this)
    drawRoundRect(
        color = color,
        topLeft = Offset(w / 2f, w / 2f),
        size = Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(radius - w / 2f),
        style = Stroke(
            width = w,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(DASH_ON.toPx(), DASH_OFF.toPx())),
        ),
    )
}

private val DASH_STROKE = 1.dp
private val DASH_ON = 6.dp
private val DASH_OFF = 5.dp
