package uz.etalon.crm.core.designsystem.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonElevation
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.designsystem.theme.etalonShadow

/** One cell. [contentDescription] is what the screen reader announces on an **icon-only** cell,
 *  where there is no [label] drawn to read; on the active cell the label is the announcement and
 *  the glyph is decorative, so the two are not the same string. */
data class BottomNavItem(
    @DrawableRes val icon: Int,
    val label: String,
    val contentDescription: String,
)

private val BAR_HEIGHT = 60.dp
private val BAR_INNER_PAD = 6.dp
private val BAR_SIDE_MARGIN = 16.dp
private val BAR_BOTTOM_MARGIN = 12.dp
private val DOT = 6.dp
private val CELL_GAP = 6.dp
private val ICON = 20.dp
/** How much air the active white pill keeps around dot-icon-label. `2b-payments.png` draws ~7 dp
 *  either side of «Тўлов»; 10 reads the same at 12 sp and still leaves the 360 dp bar its margin. */
private val ACTIVE_PAD = 10.dp

/**
 * §4 / design decision D3: a floating navy pill with **five** cells — Бош · Буюртма · Ҳисоб ·
 * Тўлов · Мижоз. Five, not the spec's four: the calculator earned a permanent slot and there is
 * no «Яна». The caller passes whatever the signed-in role may see, so a driver's bar may be
 * shorter.
 *
 * The **inactive** cells are equal-width; the active one hugs its own content. That is how the
 * designer draws it in `2b-orders.png` and `2b-payments.png`, and it is what makes five cells fit
 * a 360 dp phone. Five *equal* cells do not: 360 less the 32 dp margins and the 12 dp inner
 * padding is 316, so a cell is 63,2 dp, of which the dot, the icon and the two 6 dp gaps take 38
 * — leaving 25 dp for a label that measures 53. Measured, not estimated:
 * `BottomNavScreenshotTest.fiveCellsFitAt360dp` reported «drawn 25.0 dp of 53.0 dp» against that
 * layout, and it is the gate that keeps this one honest.
 *
 * The cells are 48 dp tall (60 less the 6 dp inner padding, twice) and never narrower than
 * 48 dp — D7 without needing `minimumInteractiveComponentSize`.
 *
 * **The labels are load-bearing and there is no runtime floor.** Nothing here caps the active
 * cell: it takes what its own label needs and the four icon-only cells divide the rest, so a
 * label longer than «Буюртма» eats into their hit area until one of them drops under 48 dp.
 * `fiveCellsFitAt360dpAtFontScale13` measures the tightest case the app is tested at — 62,0 dp
 * of label, a 120,0 dp active cell and 49,0 dp each for the other four — which leaves 1 dp of
 * headroom. Any new label, or a sixth cell, must be re-measured against that gate before it ships.
 */
@Composable
fun BottomNav(
    items: List<BottomNavItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) = Row(
    modifier
        .fillMaxWidth()
        .padding(horizontal = BAR_SIDE_MARGIN)
        .navigationBarsPadding()
        .padding(bottom = BAR_BOTTOM_MARGIN)
        // `shadow` clips to the shape it is given whenever the elevation is non-zero, so the navy
        // fill and the cells are already inside the pill — a second `clip` here would be a second
        // graphics layer for nothing.
        .etalonShadow(EtalonElevation.floatingNav, EtalonShapes.pill, EtalonColors.navy)
        .background(EtalonColors.navy)
        .height(BAR_HEIGHT)
        .padding(BAR_INNER_PAD),
    verticalAlignment = Alignment.CenterVertically,
) {
    items.forEachIndexed { i, item ->
        val active = i == selectedIndex
        Row(
            (if (active) Modifier else Modifier.weight(1f))
                .fillMaxHeight()
                .clip(EtalonShapes.pill)
                .then(if (active) Modifier.background(EtalonColors.surface) else Modifier)
                // `selectable`, not `clickable`: it publishes the selected state, which is how
                // TalkBack tells the active cell from the other four. The white pill alone says
                // nothing to a screen reader.
                .selectable(
                    selected = active,
                    role = Role.Tab,
                    indication = etalonRipple(!active),
                    interactionSource = remember { MutableInteractionSource() },
                ) { onSelect(i) }
                .then(if (active) Modifier.padding(horizontal = ACTIVE_PAD) else Modifier),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (active) {
                Box(Modifier.size(DOT).clip(EtalonShapes.pill).background(EtalonColors.indigo))
                Spacer(Modifier.width(CELL_GAP))
                // The label is drawn on this cell, so the glyph is decorative here — described, it
                // would make TalkBack read the destination twice («Буюртмалар, Буюртма»).
                EtalonIcon(item.icon, null, size = ICON, tint = EtalonColors.navy)
                Spacer(Modifier.width(CELL_GAP))
                Text(item.label, style = EtalonType.label, color = EtalonColors.navy, maxLines = 1)
            } else {
                EtalonIcon(item.icon, item.contentDescription, size = ICON, tint = EtalonColors.onDark.copy(alpha = 0.62f))
            }
        }
    }
}

/**
 * The white→page gradient §4 puts beneath the floating bar, so a row scrolling under the pill
 * fades out instead of being sliced by it. The screen places it above its own content, aligned to
 * the bottom; its height is [EtalonSpace.underNav], the same figure the screen uses as bottom
 * content padding.
 */
@Composable
fun BottomNavScrim(modifier: Modifier = Modifier) = Box(
    modifier
        .fillMaxWidth()
        .height(EtalonSpace.underNav)
        .background(Brush.verticalGradient(listOf(EtalonColors.page.copy(alpha = 0f), EtalonColors.page))),
)
