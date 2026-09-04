package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import uz.etalon.crm.core.designsystem.theme.EtalonType

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) =
    Text(text.uppercase(), style = EtalonType.monoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
