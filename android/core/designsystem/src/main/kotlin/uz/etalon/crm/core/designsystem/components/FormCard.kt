package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2: the value line of a [FormField] — 15/600 ink. Published rather than left to every call site
 * to re-derive, because a form whose fields disagree by a point is exactly what the restyle is
 * removing; the scale's nearest step, `titleSm`, is 16/800.
 */
val FormFieldValue: TextStyle = EtalonType.titleSm.copy(fontWeight = FontWeight.W600, fontSize = 15.sp)

/**
 * §2's form surface: white `xl` with the system's hairline, padded 14 horizontal / 6 vertical.
 * The fields inside it stack and separate themselves — see [FormField].
 */
@Composable
fun FormCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = 14.dp, vertical = 6.dp),
    content = content,
)

/**
 * One stacked field: an 11/600 ink2 label above a slot, 10 dp of air above and below, and the
 * hairline that separates it from the next field.
 *
 * The value is a slot on purpose — a field may hold a `BasicTextField`, a picker row or plain
 * text, and the design system must not decide which. Style the content with [FormFieldValue].
 *
 * @param divider the hairline drawn *below* the field. A card's last field passes `false`, and so
 *   does a field standing on its own outside a [FormCard]. The divider cannot hide itself: the
 *   card's 6 dp of bottom padding leaves a trailing hairline floating 6 dp above the card's edge
 *   rather than covering it.
 */
@Composable
fun FormField(
    label: String,
    modifier: Modifier = Modifier,
    divider: Boolean = true,
    content: @Composable () -> Unit,
) = Column(modifier.fillMaxWidth()) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text(
            label,
            style = EtalonType.meta.copy(fontWeight = FontWeight.W600),
            color = EtalonColors.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        content()
    }
    if (divider) HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)
}
