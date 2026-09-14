package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * Shows the operator that a photo is still on its way, or that the server rejected it. Silence
 * here would look like the upload succeeded.
 *
 * [NoticeBanner]'s shape in both states: still-sending is the standing, expected condition and
 * wears `lavenderBg`/`indigo`; a rejection is a failure the operator can act on and wears
 * [ErrorBanner]'s `redBg`/`red` with the two compact buttons.
 */
@Composable
fun OutboxBanner(pending: Int, failedMessage: String?, onRetry: () -> Unit, onCancel: () -> Unit, enabled: Boolean = true) {
    if (pending == 0 && failedMessage == null) return
    val failed = failedMessage != null
    Row(
        Modifier.fillMaxWidth().clip(EtalonShapes.md)
            .background(if (failed) EtalonColors.redBg else EtalonColors.lavenderBg)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            failedMessage ?: pluralStringResource(R.plurals.outbox_pending, pending, pending),
            style = EtalonType.body,
            color = if (failed) EtalonColors.red else EtalonColors.indigo,
            modifier = Modifier.weight(1f),
        )
        if (failed) {
            Spacer(Modifier.width(8.dp))
            SecondaryButton(stringResource(R.string.action_retry), onRetry, compact = true, enabled = enabled)
            Spacer(Modifier.width(6.dp))
            SecondaryButton(stringResource(R.string.ds_action_cancel), onCancel, compact = true, enabled = enabled)
        }
    }
}
