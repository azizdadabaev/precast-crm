package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** 3×4 keypad with 64 dp targets — no soft keyboard for a 4-digit PIN. */
@Composable
fun PinPad(onDigit: (Char) -> Unit, onBackspace: () -> Unit, enabled: Boolean, modifier: Modifier = Modifier) {
    val rows = listOf("123", "456", "789", " 0⌫")
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { ch ->
                    when (ch) {
                        ' ' -> Spacer(Modifier.weight(1f).height(64.dp))
                        '⌫' -> FilledTonalIconButton(onClick = onBackspace, enabled = enabled, modifier = Modifier.weight(1f).height(64.dp)) { Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = null) }
                        else -> FilledTonalButton(onClick = { onDigit(ch) }, enabled = enabled, modifier = Modifier.weight(1f).height(64.dp)) { Text(ch.toString(), style = EtalonType.monoTitle) }
                    }
                }
            }
        }
    }
}
