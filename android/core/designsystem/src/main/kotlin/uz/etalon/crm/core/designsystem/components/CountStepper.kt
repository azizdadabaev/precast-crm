package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** Beam and block counts are small integers entered while standing at a truck —
 *  two large targets beat a keypad. [max] shows the order's remaining allowance.
 *
 *  §2: the figure sits in the numeric-input cell — h40, page ground, hairline, radius `md` — with
 *  the two [EtalonIconButton]s outside it, so each keeps its own 48 dp slot (D7) while the cell
 *  keeps its 40 dp height.
 *
 *  At a bound the button is genuinely disabled, not merely tinted: the ink3 glyph says so to
 *  anyone looking, and `enabled = false` says the same thing to TalkBack. */
@Composable
fun CountStepper(label: String, value: Int, onChange: (Int) -> Unit, max: Int? = null) {
    val canDecrease = value > 0
    val canIncrease = max == null || value < max
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = EtalonType.body, color = EtalonColors.ink)
            if (max != null) {
                Text(stringResource(R.string.stepper_max, max), style = EtalonType.meta, color = EtalonColors.ink3)
            }
        }
        EtalonIconButton(
            EtalonIcons.Minus,
            stringResource(R.string.action_decrease),
            onClick = { onChange(value - 1) },
            size = 36.dp,
            shape = EtalonShapes.md,
            enabled = canDecrease,
        )
        Box(
            Modifier.widthIn(min = 56.dp).height(40.dp).clip(EtalonShapes.md).background(EtalonColors.page)
                .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(value.toString(), style = EtalonType.titleSm, color = EtalonColors.ink, textAlign = TextAlign.Center)
        }
        EtalonIconButton(
            EtalonIcons.Plus,
            stringResource(R.string.action_increase),
            onClick = { onChange(value + 1) },
            size = 36.dp,
            shape = EtalonShapes.md,
            enabled = canIncrease,
        )
    }
}
