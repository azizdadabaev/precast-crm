package uz.etalon.crm.core.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2 ProgressCard — the order detail's «Тўлов ҳолати» card on `2b-order-detail.png`: white `xl`,
 * the label with the percentage opposite it, an 8 dp pill track and a paid/remaining footer.
 *
 * Every string arrives composed. «Тўланган 6 000 000» and «Қолди 7 350 000» are the *screen's*
 * words about its own order, so the component invents no user-facing text and formats no money.
 *
 * @param fraction paid ÷ total, 0..1; clamped, so a rounding overshoot cannot draw past the track.
 * @param settled there is no debt left — the percentage and the remaining figure turn green.
 */
@Composable
fun ProgressCard(
    label: String,
    fraction: Float,
    percentText: String,
    paidLabel: String,
    remainingLabel: String,
    settled: Boolean,
    modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Text(label, style = EtalonType.label, color = EtalonColors.ink2, maxLines = 1)
        Text(percentText, style = EtalonType.label, color = if (settled) EtalonColors.green else EtalonColors.red)
    }
    Spacer(Modifier.height(10.dp))
    // §1.7: the bar animates its width over 400 ms. It starts *at* the incoming fraction, so the
    // card does not sweep from zero when the screen opens — only a payment landing moves it.
    val width by animateFloatAsState(
        targetValue = fraction.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 400),
        label = "paidFraction",
    )
    Box(Modifier.fillMaxWidth().height(8.dp).clip(EtalonShapes.pill).background(EtalonColors.lavenderBg)) {
        // A settled order still draws a full indigo bar — the colour that says "paid" is the
        // percentage above it, not the track, which stays the progress colour everywhere.
        Box(Modifier.fillMaxWidth(width).fillMaxHeight().clip(EtalonShapes.pill).background(EtalonColors.indigo))
    }
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Text(paidLabel, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1)
        Text(
            remainingLabel,
            style = EtalonType.meta,
            color = if (settled) EtalonColors.green else EtalonColors.red,
            maxLines = 1,
        )
    }
}
