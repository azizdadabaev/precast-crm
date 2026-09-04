package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R

/** destructive/10 tint + destructive/30 border, like the web error box. */
@Composable
fun ErrorBanner(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    val e = MaterialTheme.colorScheme.error
    Row(
        modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(e.copy(alpha = 0.10f))
            .border(1.dp, e.copy(alpha = 0.30f), MaterialTheme.shapes.medium).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = e, modifier = Modifier.weight(1f))
        if (onRetry != null) TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry)) }
    }
}
