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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
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
 *
 * @param trailingIcon the day filter's «12 сен ×» (design §3): a glyph after the label saying that
 *   this chip is dismissible. It is **not** a second target. A 48 dp slot of its own inside a 32 dp
 *   pill would push the × a finger's width away from the label it belongs to and leave the chip
 *   reading «12 сен      ×»; the chip is already well past 48 dp in both directions, so the whole
 *   pill is the target and [onClick] is what the × does. Null for every other chip in the app.
 * @param contentDescription what the chip says when it does something its label does not name —
 *   «12 сен кун фильтрини олиб ташлаш» for the dismissible one. Null leaves the label to speak,
 *   which is right for a filter chip that only selects itself.
 */
@Composable
fun EtalonFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
    trailingIcon: Int? = null,
    contentDescription: String? = null,
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
            .then(
                if (contentDescription == null) Modifier
                else Modifier.semantics { this.contentDescription = contentDescription },
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
        if (trailingIcon != null) {
            // Decorative: the chip already carries the action and, where it needs one, the
            // sentence that names it. A content description here would be read twice.
            EtalonIcon(
                trailingIcon, contentDescription = null, size = TRAILING_ICON, tint = fg,
                modifier = Modifier.padding(start = TRAILING_GAP),
            )
        }
    }
}

/** The × itself: smaller than the 18 dp an icon button carries, because it rides inside a 32 dp
 *  pill beside 12 sp text rather than standing on its own. */
private val TRAILING_ICON = 14.dp

/** The same 6 dp the count sits from the label — one gap for whatever follows the label. */
private val TRAILING_GAP = 6.dp
