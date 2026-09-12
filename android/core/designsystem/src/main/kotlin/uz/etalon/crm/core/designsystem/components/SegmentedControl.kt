package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.text.style.TextOverflow
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
 * Items hug their own label by default — they are not equal-width — which is how §3.2's header
 * switch draws it. [fill] is the other case, the full-width payments filter.
 *
 * D7 vs the drawn geometry: each item reserves the 48 dp slot
 * ([minimumInteractiveComponentSize]) while painting 30, so the item overhangs the 38 dp track by
 * 5 dp top and bottom. The track therefore paints its fill with `background(colour, shape)`
 * rather than `clip(shape).background(colour)` — a clip is a graphics layer, and a layer clips
 * touch as well as paint, which would hand back the 10 dp of hit area D7 just bought.
 *
 * @param onNavy the track sits on a navy sheet, so the track itself is navy2 (§3.2's «Рўйхат»
 * header). False = on the light page, where the track is navy (§3.5's payments filter).
 * @param fill the three-way payments filter of `2b-payments.png`: the track spans the page and the
 * items split it in equal thirds, so the selected pill lands in the same place whichever tab is on
 * and the row reads as one control rather than three words that happen to be adjacent. Off by
 * default — the header switch beside a section title must still hug its own labels, because a
 * full-width track there would push the title out of the row.
 */
@Composable
fun SegmentedControl(
    items: List<SegmentItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    onNavy: Boolean = true,
    fill: Boolean = false,
) = Row(
    modifier
        .then(if (fill) Modifier.fillMaxWidth() else Modifier)
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
                .then(if (fill) Modifier.weight(1f) else Modifier)
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
            // An equal-weight item is wider than its label, so the label has to be centred in it;
            // a hugging item is exactly its label and Start is the same picture with less work.
            horizontalArrangement = if (fill) Arrangement.Center else Arrangement.Start,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Ellipsis, not clip: under `fill` an item is only its third of the track, and on a
            // 360 dp phone at font scale 1,3 «Тасдиқланган» no longer fits it. A label cut
            // mid-glyph reads as a rendering fault; a cut one that ends in «…» reads as a label.
            // In hug mode the item is exactly its label, so this can never fire there — the
            // `ds_controls_light` rows above the filled samples are byte-identical either way.
            Text(item.label, style = EtalonType.labelSm, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
