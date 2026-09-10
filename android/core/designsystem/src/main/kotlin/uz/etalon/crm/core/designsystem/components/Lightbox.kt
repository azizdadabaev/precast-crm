package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** §2's scrim: navy at 55 %, the same one [ConfirmSheet] uses — this system has one dark veil. */
@Composable
fun Lightbox(photos: List<PhotoRef>, startIndex: Int, onDismiss: () -> Unit) {
    if (photos.isEmpty()) return
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(EtalonColors.navy.copy(alpha = 0.55f))) {
            val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, photos.lastIndex)) { photos.size }
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                AsyncImage(
                    model = photos[page].url, contentDescription = null,
                    contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize(),
                )
            }
            if (photos[pager.currentPage].pending) {
                Text(
                    stringResource(R.string.photo_pending),
                    style = EtalonType.label,
                    color = EtalonColors.onDark,
                    modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
                )
            }
            EtalonIconButton(
                EtalonIcons.X,
                stringResource(R.string.action_close),
                onDismiss,
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                onDark = true,
            )
        }
    }
}
