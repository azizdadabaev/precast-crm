package uz.etalon.crm.feature.orders.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.LoadListCard
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.loadList
import uz.etalon.crm.core.model.totalBlocks
import uz.etalon.crm.core.model.weightKg
import uz.etalon.crm.core.ui.format.formatWeightKg
import uz.etalon.crm.feature.orders.R

/**
 * Design 7a's «Юклаш рўйхати»: one chip per beam length, then the blocks.
 *
 * The shared [LoadListCard] draws its list as label-and-figure rows, which is right on the load
 * and shipment screens where a driver counts each line off against the truck. On the detail the
 * list is not worked through, it is glanced at — so 7a wraps it into chips that fit several to a
 * line and keep the whole load visible without scrolling. Same card, same title, different shape
 * for a different job, which is exactly what the component's content slot is for.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun OrderLoadList(o: OrderDetail, collapsible: Boolean) = LoadListCard(
    collapsible = collapsible,
    trailing = {
        Text(
            stringResource(R.string.detail_loadlist_weight, formatWeightKg(o.weightKg)),
            style = EtalonType.caption,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
    },
) {
    FlowRow(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs + 2.dp),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs + 2.dp),
    ) {
        o.loadList.forEach { line ->
            LoadChip(
                label = line.lengthKey.replace('.', ','),
                unit = stringResource(R.string.detail_loadlist_metre),
                count = line.beams,
            )
        }
        // The blocks travel on the same lorry and are counted the same way, but they are not a
        // beam length — the amber says so at a glance rather than making the loader read the word.
        LoadChip(
            label = stringResource(R.string.detail_loadlist_blocks),
            unit = null,
            count = o.totalBlocks,
            fg = EtalonColors.amberDeep,
            bg = EtalonColors.warningBg,
            border = EtalonColors.amberBorder,
        )
    }
}

/** «3,80 м = 14». The length is read as hard as the count, so both carry weight and the «=» does
 *  not: it is the quietest thing in the chip. */
@Composable
private fun LoadChip(
    label: String,
    unit: String?,
    count: Int,
    fg: Color = EtalonColors.ink,
    bg: Color = EtalonColors.page,
    border: Color = EtalonColors.surfaceBorder,
) = Row(
    Modifier.defaultMinSize(minHeight = ChipHeight).clip(EtalonShapes.md).background(bg)
        .border(EtalonSpace.hairline, border, EtalonShapes.md)
        .padding(horizontal = EtalonSpace.md, vertical = EtalonSpace.sm),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(label, style = EtalonType.label, color = fg, maxLines = 1)
    if (unit != null) {
        Spacer(Modifier.width(2.dp))
        Text(unit, style = EtalonType.caption, color = if (fg == EtalonColors.ink) EtalonColors.ink3 else fg, maxLines = 1)
    }
    Spacer(Modifier.width(EtalonSpace.xs + 2.dp))
    Text(
        stringResource(R.string.detail_loadlist_equals),
        style = EtalonType.meta,
        color = if (fg == EtalonColors.ink) EtalonColors.ink3 else fg,
        maxLines = 1,
    )
    Spacer(Modifier.width(EtalonSpace.xs + 2.dp))
    Text(count.toString(), style = EtalonType.titleSm, color = fg, maxLines = 1)
}

private val ChipHeight = 38.dp
