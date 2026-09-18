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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
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
 * @param fraction paid ÷ total, 0..1. Clamped, so a rounding overshoot cannot draw past the
 *   track, and checked for NaN first: paid ÷ 0 is a real arrival here (an order still being
 *   priced), `coerceIn` passes NaN through untouched, and `fillMaxWidth(NaN)` throws.
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
    /** The order's own AWAITING / PARTIALLY / FULLY tag, beside the label. The percentage says
     *  how far along the money is; this says what the order's payment state is called — the two
     *  disagree in the one case that matters, an order 100 % covered by payments nobody has
     *  confirmed yet. */
    stateTag: (@Composable () -> Unit)? = null,
    /** Money recorded but not yet confirmed. Drawn under the bar because it is neither paid nor
     *  outstanding: leaving it out makes «Қолди» look wrong to whoever recorded the payment. */
    pendingLabel: String? = null,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Row(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs), verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = EtalonType.label, color = EtalonColors.ink2, maxLines = 1)
            if (stateTag != null) stateTag()
        }
            if (stateTag != null) stateTag()
        }
        Text(
            percentText,
            style = EtalonType.label,
            color = if (settled) EtalonColors.green else EtalonColors.red,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    Spacer(Modifier.height(10.dp))
    // §1.7: the bar animates its width over 400 ms. It starts *at* the incoming fraction, so the
    // card does not sweep from zero when the screen opens — only a payment landing moves it.
    val width by animateFloatAsState(
        targetValue = if (fraction.isFinite()) fraction.coerceIn(0f, 1f) else 0f,
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
        // The weight makes the *paid* line the one that gives way when the two do not both fit:
        // «Қолди …» is the figure the owner is reading the card for, and it is measured first.
        // `fill = false` keeps it at its own width when there is room, so nothing moves.
        Text(
            paidLabel,
            style = EtalonType.meta,
            color = EtalonColors.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Text(
            remainingLabel,
            style = EtalonType.meta,
            color = if (settled) EtalonColors.green else EtalonColors.red,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    if (pendingLabel != null) {
        Spacer(Modifier.height(EtalonSpace.xs))
        Text(pendingLabel, style = EtalonType.meta, color = EtalonColors.heavy, maxLines = 2)
    }
}
