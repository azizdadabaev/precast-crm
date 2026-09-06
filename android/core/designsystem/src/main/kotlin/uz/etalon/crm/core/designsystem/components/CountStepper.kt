package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** Beam and block counts are small integers entered while standing at a truck —
 *  two large targets beat a keypad. [max] shows the order's remaining allowance. */
@Composable
fun CountStepper(label: String, value: Int, onChange: (Int) -> Unit, max: Int? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            if (max != null) {
                Text(
                    stringResource(R.string.stepper_max, max),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        FilledTonalIconButton(
            onClick = { onChange((value - 1).coerceAtLeast(0)) },
            enabled = value > 0, modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Default.Remove, contentDescription = stringResource(R.string.action_decrease)) }
        Text(
            value.toString(), style = EtalonType.monoTitle, textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(min = 56.dp),
        )
        FilledTonalIconButton(
            onClick = { onChange(value + 1) },
            enabled = max == null || value < max, modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Default.Add, contentDescription = stringResource(R.string.action_increase)) }
    }
}
