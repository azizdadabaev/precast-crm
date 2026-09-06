package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType

private const val MAX_DIGITS = 12

/** Pure so the entry rules are unit-tested rather than driven through the UI. */
fun applyDigit(current: String, digit: Char, allowDecimal: Boolean): String = when {
    current.length >= MAX_DIGITS -> current
    digit == ',' || digit == '.' -> if (!allowDecimal || current.contains(',')) current else "${current.ifEmpty { "0" }},"
    !digit.isDigit() -> current
    current == "0" -> digit.toString()
    else -> current + digit
}

fun applyBackspace(current: String): String = current.dropLast(1)

/**
 * Amount and count entry without a soft keyboard: the operator is wearing gloves
 * on a truck bed, and the system keyboard's number row is a 6 mm target.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NumericKeypadSheet(
    title: String,
    initial: String,
    suffix: String? = null,
    allowDecimal: Boolean = false,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionLabel(title)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value.ifEmpty { "0" }, style = EtalonType.monoDisplay, modifier = Modifier.weight(1f))
                if (suffix != null) Text(suffix, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val rows = listOf("123", "456", "789", if (allowDecimal) ",0⌫" else " 0⌫")
            rows.forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { ch ->
                        when (ch) {
                            ' ' -> Spacer(Modifier.weight(1f).height(60.dp))
                            '⌫' -> FilledTonalIconButton(
                                onClick = { value = applyBackspace(value) },
                                modifier = Modifier.weight(1f).height(60.dp),
                            ) { Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = stringResource(R.string.action_backspace)) }
                            else -> FilledTonalButton(
                                onClick = { value = applyDigit(value, ch, allowDecimal) },
                                modifier = Modifier.weight(1f).height(60.dp),
                            ) { Text(ch.toString(), style = EtalonType.monoTitle) }
                        }
                    }
                }
            }
            PrimaryButton(stringResource(R.string.action_confirm), onClick = { onConfirm(value.ifEmpty { "0" }) })
        }
    }
}
