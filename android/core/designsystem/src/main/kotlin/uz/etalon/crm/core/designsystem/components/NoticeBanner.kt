package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * A standing fact about the screen, in the neutral tone — [ErrorBanner]'s shape without its
 * alarm. An accountant holding `payment.view` without `payment.confirm` is not looking at an
 * error: that is the account working exactly as designed, and a red box says otherwise every
 * time they open the queue.
 *
 * Use it for a condition that is permanent and expected. Anything that went wrong, or that the
 * operator could clear by retrying, is still an [ErrorBanner].
 *
 * §2: `lavenderBg` at radius `md`, message in `indigo` — the accent family, which is what this
 * system uses for "this is how it is", never a second grey box.
 */
@Composable
fun NoticeBanner(message: String, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().clip(EtalonShapes.md).background(EtalonColors.lavenderBg)
        .padding(horizontal = 12.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(message, style = EtalonType.body, color = EtalonColors.indigo, modifier = Modifier.weight(1f))
}
