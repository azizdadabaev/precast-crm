package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
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

private val SWATCH_W = 10.dp
private val SWATCH_H = 3.dp
private val SWATCH_GAP = 4.dp
private val ITEM_GAP = 10.dp
private val ROW_GAP = 6.dp

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
 */
@Composable
fun CalendarLegend(thresholds: CapacityThresholds, modifier: Modifier = Modifier) = FlowRow(
    modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(ITEM_GAP),
    verticalArrangement = Arrangement.spacedBy(ROW_GAP),
) {
    Item(CapacityTier.AVAILABLE, stringResource(R.string.ds_calendar_legend_le, formatArea(thresholds.low)))
    Item(CapacityTier.MODERATE, stringResource(R.string.ds_calendar_legend_le, formatDecimal(thresholds.moderate, 0)))
    Item(CapacityTier.HEAVY, stringResource(R.string.ds_calendar_legend_le, formatDecimal(thresholds.heavy, 0)))
    Item(CapacityTier.OVERBOOKED, stringResource(R.string.ds_calendar_legend_gt, formatDecimal(thresholds.heavy, 0)))
}

@Composable
private fun Item(tier: CapacityTier, text: String) = Row(verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.width(SWATCH_W).height(SWATCH_H).clip(EtalonShapes.pill).background(tier.color()))
    Spacer(Modifier.width(SWATCH_GAP))
    Text(text, style = EtalonType.captionLight, color = EtalonColors.ink2, maxLines = 1)
}
