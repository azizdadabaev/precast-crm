package uz.etalon.crm.core.designsystem.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonElevation
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonShadow

/**
 * §1.7's 2600 ms. Exported rather than owned: the *screen* decides when its toast stops, because
 * only the screen knows whether the action behind it finished.
 */
const val TOAST_DURATION_MS = 2600L

/**
 * §2's toast — navy, radius 14, 12.5/600 onDark, a 20 dp green check circle, sitting 96 dp above
 * the bottom with 16 dp side margins. §1.7 gives it 200 ms in and 200 ms out.
 *
 * The 96 dp and the side margins are the toast's own padding, so a screen only has to align it to
 * the bottom of its `Box`; the gap clears the floating nav.
 */
@Composable
fun EtalonToast(message: String, visible: Boolean, modifier: Modifier = Modifier) = AnimatedVisibility(
    visible = visible,
    enter = fadeIn(tween(200)) + slideInVertically(tween(200)) { it / 2 },
    exit = fadeOut(tween(200)),
    modifier = modifier,
) {
    Row(
        Modifier
            .padding(horizontal = 16.dp)
            .padding(bottom = 96.dp)
            .etalonShadow(EtalonElevation.overlay, EtalonShapes.toast, EtalonColors.navy)
            .clip(EtalonShapes.toast)
            .background(EtalonColors.navy)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(20.dp).clip(EtalonShapes.pill).background(EtalonColors.green), Alignment.Center) {
            EtalonIcon(EtalonIcons.Check, null, size = 12.dp, tint = EtalonColors.onDark)
        }
        Spacer(Modifier.width(10.dp))
        Text(
            message,
            style = EtalonType.label.copy(fontSize = 12.5.sp),
            color = EtalonColors.onDark,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
