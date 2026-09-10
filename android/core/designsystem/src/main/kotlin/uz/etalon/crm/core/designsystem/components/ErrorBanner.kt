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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * Something went wrong, or the operator can clear it by retrying. §2's tinted banner: a flat
 * `redBg` fill at radius `md` with no border — the system says "alarm" with the tint, not with a
 * second red outline around it.
 *
 * A standing, expected condition is a [NoticeBanner] instead.
 */
@Composable
fun ErrorBanner(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().clip(EtalonShapes.md).background(EtalonColors.redBg)
        .padding(horizontal = 12.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(message, style = EtalonType.body, color = EtalonColors.red, modifier = Modifier.weight(1f))
    if (onRetry != null) {
        Spacer(Modifier.width(8.dp))
        SecondaryButton(stringResource(R.string.action_retry), onRetry, compact = true)
    }
}
