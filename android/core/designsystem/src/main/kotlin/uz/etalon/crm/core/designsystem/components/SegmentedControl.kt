package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple

/** One cell of a [SegmentedControl]. The count is optional — §3.2's «Барчаси 9» carries one,
 *  §3.3's plain two-way switch does not. */
data class SegmentItem(val label: String, val count: Int? = null)

/** 4 dp pad + 30 dp items, §2's «pad 3–4, pill items h28–32». */
private val TRACK_HEIGHT = 38.dp
private val ITEM_HEIGHT = 30.dp

/**
 * §2's switch: a pill track carrying pill items, the active one inverted to white with navy text.
 * Items hug their own label — they are not equal-width — which is how `2b-payments.png` draws it.
 *
 * D7 vs the drawn geometry: each item reserves the 48 dp slot
 * ([minimumInteractiveComponentSize]) while painting 30, so the item overhangs the 38 dp track by
 * 5 dp top and bottom. The track therefore paints its fill with `background(colour, shape)`
 * rather than `clip(shape).background(colour)` — a clip is a graphics layer, and a layer clips
 * touch as well as paint, which would hand back the 10 dp of hit area D7 just bought.
 *
 * @param onNavy the track sits on a navy sheet, so the track itself is navy2 (§3.2's «Рўйхат»
 * header). False = on the light page, where the track is navy (§3.5's payments filter).
 */
@Composable
fun SegmentedControl(
    items: List<SegmentItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    onNavy: Boolean = true,
) = Row(
    modifier
        .height(TRACK_HEIGHT)
        .background(if (onNavy) EtalonColors.navy2 else EtalonColors.navy, EtalonShapes.pill)
        .padding(horizontal = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    items.forEachIndexed { i, item ->
        val active = i == selectedIndex
        val fg = if (active) EtalonColors.navy else EtalonColors.onDark.copy(alpha = 0.7f)
        Row(
            Modifier
                .minimumInteractiveComponentSize()
                .height(ITEM_HEIGHT)
                .clip(EtalonShapes.pill)
                .then(if (active) Modifier.background(EtalonColors.surface) else Modifier)
                // `selectable`, not `clickable`: the inverted white pill is the only thing that
                // says which segment is on, and a screen reader cannot see it.
                .selectable(
                    selected = active,
                    role = Role.Tab,
                    indication = etalonRipple(!active),
                    interactionSource = remember { MutableInteractionSource() },
                ) { onSelect(i) }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(item.label, style = EtalonType.labelSm, color = fg, maxLines = 1)
            if (item.count != null) {
                Text(
                    "${item.count}",
                    style = EtalonType.labelSm,
                    color = fg.copy(alpha = 0.55f),
                    maxLines = 1,
                    modifier = Modifier.padding(start = 5.dp),
                )
            }
        }
    }
}
