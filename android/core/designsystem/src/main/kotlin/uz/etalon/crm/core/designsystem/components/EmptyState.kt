package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** Plain-text empty state, as on the web ("Буюртма йўқ."): `body` in ink3, centred, no icon. */
@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) =
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        Text(text, style = EtalonType.body, color = EtalonColors.ink3, textAlign = TextAlign.Center)
    }
