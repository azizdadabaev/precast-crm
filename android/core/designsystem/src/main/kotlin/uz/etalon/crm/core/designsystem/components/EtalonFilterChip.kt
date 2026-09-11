package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple

/**
 * §2: h32 pill, 12/600. Idle is white with the hairline and ink text; selected is navy with
 * onDark. The count rides at 60 % of the label's own colour — never as a second pill, which is
 * what keeps a selected chip reading as one object.
 *
 * Named with the `Etalon` prefix on purpose: `androidx.compose.material3.FilterChip` is on the
 * classpath, and an unprefixed name would shadow it in every file that imports both.
 *
 * D7 again: 32 dp drawn inside the 48 dp slot [minimumInteractiveComponentSize] reserves.
 *
 * The chip assumes nothing about its parent. §2's row is a `LazyRow` at the call site with
 * `horizontalArrangement = Arrangement.spacedBy(6.dp)` and
 * `contentPadding = PaddingValues(horizontal = 20.dp)` — that belongs to each screen's own phase.
 */
@Composable
fun EtalonFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
) {
    val fg = if (selected) EtalonColors.onDark else EtalonColors.ink
    Row(
        modifier
            .minimumInteractiveComponentSize()
            .height(32.dp)
            .clip(EtalonShapes.pill)
            .background(if (selected) EtalonColors.navy else EtalonColors.surface)
            .then(
                if (selected) Modifier
                else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.pill),
            )
            // `selectable`, not `clickable`: the navy fill is the whole of the selected state, so
            // without it TalkBack reads every chip in the row the same way.
            .selectable(
                selected = selected,
                role = Role.Tab,
                indication = etalonRipple(selected),
                interactionSource = remember { MutableInteractionSource() },
                onClick = onClick,
            )
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = EtalonType.label, color = fg, maxLines = 1)
        if (count != null) {
            Text(
                "$count",
                style = EtalonType.label,
                color = fg.copy(alpha = 0.6f),
                maxLines = 1,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}
