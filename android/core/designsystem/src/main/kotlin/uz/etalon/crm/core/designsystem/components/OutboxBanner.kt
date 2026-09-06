package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

/**
 * Shows the operator that a photo is still on its way, or that the server
 * rejected it. Silence here would look like the upload succeeded.
 */
@Composable
fun OutboxBanner(pending: Int, failedMessage: String?, onRetry: () -> Unit, onCancel: () -> Unit) {
    if (pending == 0 && failedMessage == null) return
    val ext = LocalEtalonColors.current
    val tone = if (failedMessage != null) MaterialTheme.colorScheme.error else ext.warning
    val shape = MaterialTheme.shapes.medium
    Row(
        Modifier.fillMaxWidth().clip(shape).background(tone.copy(alpha = 0.10f))
            .border(1.dp, tone.copy(alpha = 0.30f), shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                failedMessage ?: pluralStringResource(R.plurals.outbox_pending, pending, pending),
                style = MaterialTheme.typography.bodyMedium, color = tone,
            )
        }
        if (failedMessage != null) {
            TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry)) }
            TextButton(onClick = onCancel) { Text(stringResource(R.string.action_cancel)) }
        }
    }
}
