package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.LoadLine
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatWeightKg
import java.math.BigDecimal

/**
 * «Юклаш рўйхати» — what goes on the truck: every beam length with the number of beams of it, the
 * block total, and the weight the lorry has to carry. Spec §5.1a's Load job.
 *
 * It lives in the design system rather than in the order detail because three screens draw the
 * same list for the same reason (ruling R11): the detail shows it so a loader never has to open
 * the web page in the yard, the load-truck screen shows it above the camera, and the
 * shipment-load screen counts against it. One card, one wording, one geometry.
 *
 * The lines arrive already derived ([LoadLine], the web's `beamGroups` rule) — the design system
 * does not decide how an order is grouped. The key arrives as «3.80»; the point becomes the house
 * decimal comma here and the figure is never rounded a second time.
 *
 * @param collapsible a canceled order: the list is history rather than a job, so it opens shut
 *   behind a chevron instead of taking a screenful above the payments that were actually taken.
 *   The state is `rememberSaveable` — a loader who opened the list and then turned the phone to
 *   read a long row must not find it folded shut again.
 */
@Composable
fun LoadListCard(
    lines: List<LoadLine>,
    totalBlocks: Int,
    weightKg: BigDecimal,
    modifier: Modifier = Modifier,
    collapsible: Boolean = false,
) = LoadListCard(modifier = modifier, collapsible = collapsible) {
    lines.forEach { line ->
        LoadListRow(
            stringResource(R.string.ds_load_list_row, line.lengthKey.replace('.', ',')),
            formatCount(line.beams),
        )
    }
    HorizontalDivider(
        Modifier.padding(vertical = EtalonSpace.sm),
        thickness = EtalonSpace.hairline,
        color = EtalonColors.surfaceBorder,
    )
    LoadListRow(stringResource(R.string.ds_load_list_blocks), formatCount(totalBlocks))
    Text(
        stringResource(R.string.ds_load_list_weight, formatWeightKg(weightKg)),
        style = EtalonType.meta,
        color = EtalonColors.ink2,
        modifier = Modifier.padding(top = EtalonSpace.sm),
    )
}

/**
 * The same card with its rows supplied by the caller — §2's white card (`xl`, hairline, 16/14
 * padding, a 14/700 «Юклаш рўйхати» over its content), carrying whatever stands in for the list.
 *
 * The shipment-load screen is why this slot exists: there the rows are not read, they are counted,
 * so each one is a [CountStepper] rather than a label and a figure. It is still the same list on
 * the same surface under the same title, which is what a driver comparing the two screens needs.
 */
@Composable
fun LoadListCard(
    modifier: Modifier = Modifier,
    collapsible: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by rememberSaveable(collapsible) { mutableStateOf(!collapsible) }
    Column(
        modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .then(
                if (collapsible) {
                    Modifier.clickable(role = Role.Button) { expanded = !expanded }
                } else {
                    Modifier
                },
            )
            .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
    ) {
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            Text(
                stringResource(R.string.ds_load_list_title),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (collapsible) {
                EtalonIcon(
                    if (expanded) EtalonIcons.ChevronUp else EtalonIcons.ChevronDown,
                    null,
                    tint = EtalonColors.ink3,
                )
            }
        }
        Spacer(Modifier.height(EtalonSpace.rowGap))
        if (!expanded) return@Column
        content()
    }
}

/** One «3,80 м … 14 та» line. Both halves are the card's own weight: a loader counting beams at
 *  the truck reads the length as hard as the count. */
@Composable
private fun LoadListRow(label: String, amount: String) = Row(
    Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
    Arrangement.SpaceBetween,
    Alignment.CenterVertically,
) {
    Text(
        label,
        style = EtalonType.label,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    Spacer(Modifier.width(EtalonSpace.sm))
    Text(amount, style = EtalonType.rowAmount, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
}
