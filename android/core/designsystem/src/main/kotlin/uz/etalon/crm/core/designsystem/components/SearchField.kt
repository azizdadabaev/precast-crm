package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2: h40 white pill, hairline, 16 dp search glyph in ink3, 13 sp text, placeholder in ink3.
 *
 * A [BasicTextField] rather than M3's `TextField`: the Material one brings its own container,
 * indicator line and 56 dp minimum height, none of which this design wants, and all three would
 * have to be painted over.
 *
 * D7: the pill is 40 dp but [minimumInteractiveComponentSize] reserves the 48 dp slot around it,
 * exactly as the buttons do. It sits outermost — it adds air around the field, it never stretches
 * it, so the drawn pill stays 40.
 *
 * @param onClear when given and there is something to clear, the trailing × appears. Screens that
 * treat an empty query as a state of their own (rather than a thing to be undone) leave it null.
 */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    onClear: (() -> Unit)? = null,
) = Row(
    modifier
        .fillMaxWidth()
        .minimumInteractiveComponentSize()
        .height(40.dp)
        .clip(EtalonShapes.pill)
        .background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.pill)
        .padding(start = 14.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIcon(EtalonIcons.Search, null, size = 16.dp, tint = EtalonColors.ink3)
    Box(Modifier.weight(1f).padding(start = 10.dp)) {
        // The placeholder is drawn behind the field rather than passed to it: BasicTextField has
        // no placeholder slot, and a Box keeps both on the same baseline without a second measure.
        if (value.isEmpty()) {
            Text(placeholder, style = EtalonType.body, color = EtalonColors.ink3, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = EtalonType.body.copy(color = EtalonColors.ink),
            cursorBrush = SolidColor(EtalonColors.indigo),
            modifier = Modifier.fillMaxWidth(),
        )
    }
    // No trailing padding on the row: [EtalonIconButton] carries its own 48 dp hit box, so the
    // 28 dp circle it paints already sits 10 dp in from the pill's edge.
    if (value.isNotEmpty() && onClear != null) {
        EtalonIconButton(EtalonIcons.X, stringResource(R.string.ds_search_clear), onClear, size = 28.dp)
    }
}
