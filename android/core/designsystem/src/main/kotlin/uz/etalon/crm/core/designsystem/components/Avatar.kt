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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2: the first letters of the first two words, uppercased; `&` is not a word.
 * «Yusupov & Sons» → YS, «Раҳимов Аброр Тоҳирович» → РА, «Каримов» → К.
 *
 * `CustodyChain.initialsOf` is the older helper and keeps `&` (and doubles the first letter of a
 * one-word name); Task 11 redraws the custody row and retires it in favour of this one.
 */
fun avatarInitials(name: String): String =
    name.split(' ', '\t', '\n').map { it.trim() }.filter { it.isNotEmpty() && it != "&" }
        .take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")

/** @param onPanel adds the 2 dp white-35 % ring the spec asks for on an indigoPanel. */
@Composable
fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 36.dp, onPanel: Boolean = false) = Box(
    modifier.size(size).clip(EtalonShapes.pill)
        .background(EtalonColors.avatarColor(name))
        .then(if (onPanel) Modifier.border(2.dp, EtalonColors.onDark.copy(alpha = 0.35f), EtalonShapes.pill) else Modifier),
    contentAlignment = Alignment.Center,
) {
    Text(avatarInitials(name), style = EtalonType.label.copy(fontSize = 12.sp, fontWeight = FontWeight.W700), color = EtalonColors.onDark, maxLines = 1)
}
