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
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * Something went wrong, or the operator can clear it by retrying. §2's tinted banner: a flat
 * `redBg` fill at radius `md` with no border — the system says "alarm" with the tint, not with a
 * second red outline around it.
 *
 * A standing, expected condition is a [NoticeBanner] instead.
 *
 * @param onDismiss adds the × that puts the banner away. Defaulted off: most banners describe the
 *   state the screen is *in* — an empty list that failed to load — and go when the state does, so
 *   a × there would only hide the explanation for the emptiness underneath. It is for the banner
 *   that outlives its cause: the Excel backup's failure stands over a calendar that is perfectly
 *   fine, and without a × the only way out was to leave the view and come back.
 */
@Composable
fun ErrorBanner(
    message: String,
    onRetry: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) = Row(
    modifier.fillMaxWidth().clip(EtalonShapes.md).background(EtalonColors.redBg)
        .padding(horizontal = 12.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(message, style = EtalonType.body, color = EtalonColors.red, modifier = Modifier.weight(1f))
    if (onRetry != null) {
        Spacer(Modifier.width(8.dp))
        SecondaryButton(stringResource(R.string.action_retry), onRetry, compact = true)
    }
    if (onDismiss != null) {
        Spacer(Modifier.width(DISMISS_GAP))
        // [EtalonIconButton]'s own default, not the retry pill's 36 dp: the × is the only way out
        // of a banner that outlives its cause, and shrinking it to match the pill beside it made
        // the smallest tap target on the phone out of the control that cannot be reached any other
        // way. The 48 dp slot the icon button reserves is what the layout actually spends.
        EtalonIconButton(EtalonIcons.X, stringResource(R.string.action_close), onDismiss)
    }
}

/** Retry to ×: they are one cluster, closer to each other than either is to the sentence. */
private val DISMISS_GAP = 4.dp
