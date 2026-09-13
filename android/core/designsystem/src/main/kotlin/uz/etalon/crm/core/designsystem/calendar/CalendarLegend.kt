package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.components.color
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDecimal
import java.math.BigDecimal

private val SWATCH_W = 10.dp
private val SWATCH_H = 3.dp
private val SWATCH_GAP = 4.dp
private val ITEM_GAP = 10.dp
private val ROW_GAP = 6.dp

/**
 * The widest threshold the height reservation plans for. Four digits is «9 999 м²» a day — an
 * order of magnitude above the factory's real 600, and far past anything a settings screen is
 * going to be given. A server that sent five would wrap a line the card had not reserved, which
 * is the hop this constant exists to prevent, not a crash.
 */
private val WIDEST_THRESHOLD = BigDecimal(9999)

/**
 * The four load bands under the grid (design §4.1): «≤300 м²», «≤450», «≤600»,
 * «>600 тўлиб кетган». The numbers are always [thresholds] as the server sent them — the
 * factory's capacity is a business setting, and a literal here would be a lie the day the owner
 * changes it.
 *
 * Only the first band carries «м²». Four units in one 10 sp row read as four separate sentences,
 * and the band that introduces the scale is the one that has to name it. It is formatted with
 * [formatArea] — the app's own area formatter — while the bare numbers go through
 * [formatDecimal] at zero places, which is the same text for the whole-square-metre thresholds
 * the server actually sends.
 *
 * A [FlowRow] rather than a [Row]: at font scale 1.3 on a 360 dp phone the four bands no longer
 * fit on one line, and wrapping is the only answer that neither ellipsizes a threshold nor
 * shrinks the type below 10 sp.
 *
 * **The row reserves the height the widest thresholds would need**, whatever [thresholds] it is
 * actually given. The card seeds its invisible placeholder legend with `CapacityThresholds.DEFAULT`
 * before any month has arrived, so a factory whose real numbers are four digits used to wrap from
 * one line to two the moment the first month landed — the card grew a line under the planner's
 * finger, mid-tap, on the first session of every install. Measuring [WIDEST_THRESHOLD] instead ties
 * the reservation to the width and the font scale, which are known before the fetch, and not to
 * figures that are not: where the worst case fits one line (the roomy phone) nothing is reserved
 * and no frame gains a millimetre; where it cannot (360 dp × 1,3) two lines are held from the
 * start, and the real legend settles into them.
 *
 * **The reservation covers one line or two, and no more.** [reservedHeight] answers with `line` or
 * `line * 2`, because those are the cases the phones this app runs on produce. A third line —
 * narrower than 360 dp, or a font scale past 1,3, with four-digit bands — would wrap into height
 * the card had not held, which is exactly the first-load hop this reservation exists to prevent.
 * If either of those becomes a real target, the arithmetic has to count rows rather than choose
 * between two.
 */
@Composable
fun CalendarLegend(thresholds: CapacityThresholds, modifier: Modifier = Modifier) =
    BoxWithConstraints(modifier.fillMaxWidth()) {
        FlowRow(
            Modifier.fillMaxWidth().heightIn(min = reservedHeight(maxWidth)),
            horizontalArrangement = Arrangement.spacedBy(ITEM_GAP),
            verticalArrangement = Arrangement.spacedBy(ROW_GAP),
        ) {
            Item(CapacityTier.AVAILABLE, stringResource(R.string.ds_calendar_legend_le, formatArea(thresholds.low)))
            Item(CapacityTier.MODERATE, stringResource(R.string.ds_calendar_legend_le, formatDecimal(thresholds.moderate, 0)))
            Item(CapacityTier.HEAVY, stringResource(R.string.ds_calendar_legend_le, formatDecimal(thresholds.heavy, 0)))
            Item(CapacityTier.OVERBOOKED, stringResource(R.string.ds_calendar_legend_gt, formatDecimal(thresholds.heavy, 0)))
        }
    }

/**
 * One line's height, or two, depending on whether the four bands at [WIDEST_THRESHOLD] fit
 * [available] side by side. The four labels are measured as they are laid out — swatch, gap, text,
 * and [ITEM_GAP] between the items — so the answer is the [FlowRow]'s own arithmetic rather than a
 * guess at it.
 */
@Composable
private fun reservedHeight(available: Dp): Dp {
    val labels = listOf(
        stringResource(R.string.ds_calendar_legend_le, formatArea(WIDEST_THRESHOLD)),
        stringResource(R.string.ds_calendar_legend_le, formatDecimal(WIDEST_THRESHOLD, 0)),
        stringResource(R.string.ds_calendar_legend_le, formatDecimal(WIDEST_THRESHOLD, 0)),
        stringResource(R.string.ds_calendar_legend_gt, formatDecimal(WIDEST_THRESHOLD, 0)),
    )
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(labels, available, density) {
        val line = measurer.measure(labels[0], style = EtalonType.captionLight, maxLines = 1, softWrap = false).size.height
        val widest = labels.sumOf { measurer.measure(it, style = EtalonType.captionLight, maxLines = 1, softWrap = false).size.width }
        val chrome = with(density) { (SWATCH_W + SWATCH_GAP).roundToPx() * labels.size + ITEM_GAP.roundToPx() * (labels.size - 1) }
        with(density) {
            if (widest + chrome <= available.roundToPx()) line.toDp() else (line * 2).toDp() + ROW_GAP
        }
    }
}

@Composable
private fun Item(tier: CapacityTier, text: String) = Row(verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.width(SWATCH_W).height(SWATCH_H).clip(EtalonShapes.pill).background(tier.color()))
    Spacer(Modifier.width(SWATCH_GAP))
    Text(text, style = EtalonType.captionLight, color = EtalonColors.ink2, maxLines = 1)
}
