package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2: the first letters of the first two words, uppercased.
 * «Yusupov & Sons» → YS, «Раҳимов Аброр Тоҳирович» → РА, «Каримов» → К.
 *
 * A "word" has to *start with a letter*. Dropping only `&` was not enough: half the driver names
 * in this CRM carry a parenthesised role, and «Жасур (ҳайдовчи)» came out as «Ж(» — a bracket
 * standing where an initial belongs reads as a rendering bug, not as a name.
 *
 * This is the app's one initials helper; `CustodyChain` used to keep its own, which kept `&` and
 * doubled the first letter of a one-word name, and Task 11 retired it when it redrew that row.
 */
fun avatarInitials(name: String): String =
    name.split(' ', '\t', '\n').map { it.trim() }.filter { it.firstOrNull()?.isLetter() == true }
        .take(2).map { it.first().uppercaseChar() }.joinToString("")

/** @param onPanel adds the 2 dp white-35 % ring the spec asks for on an indigoPanel. */
@Composable
fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 36.dp, onPanel: Boolean = false) = Box(
    modifier.size(size).clip(EtalonShapes.pill)
        .background(EtalonColors.avatarColor(name))
        .then(if (onPanel) Modifier.border(2.dp, EtalonColors.onDark.copy(alpha = 0.35f), EtalonShapes.pill) else Modifier),
    contentAlignment = Alignment.Center,
) {
    // Ellipsis, not clip: in the 28 dp custody circle at font scale 1,3 two initials no longer fit,
    // and a half-drawn second letter reads as a different person's initials.
    Text(
        avatarInitials(name),
        style = EtalonType.label.copy(fontSize = 12.sp, fontWeight = FontWeight.W700),
        color = EtalonColors.onDark,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}
