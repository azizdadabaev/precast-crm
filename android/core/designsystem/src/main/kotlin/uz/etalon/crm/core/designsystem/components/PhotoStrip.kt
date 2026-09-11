package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace

/**
 * One photo shown in a [PhotoStrip] or [Lightbox].
 *
 * [id] is the server photo id once one exists — Task 15's long-press delete needs it —
 * and is `null` for a photo still sitting in the upload outbox, because it genuinely
 * has no server id yet; a queued local id would misrepresent it as addressable on the
 * server when a delete or any other id-keyed call would fail against it.
 * [pending] is true while the photo hasn't reached the server yet; the strip dims it
 * and marks it rather than showing it as if it were already sent.
 */
data class PhotoRef(val id: String?, val url: String, val pending: Boolean = false)

private val THUMB = 104.dp

/** [onLongPress] is the strip's secondary gesture — the order cockpit hangs "delete this photo"
 *  off it. It stays null wherever a photo may only be looked at. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PhotoStrip(
    photos: List<PhotoRef>,
    onOpen: (Int) -> Unit,
    onAdd: (() -> Unit)? = null,
    onLongPress: ((Int) -> Unit)? = null,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(photos) { i, photo ->
            Box(modifier = Modifier.size(THUMB)) {
                AsyncImage(
                    model = photo.url,
                    contentDescription = stringResource(R.string.photo_n, i + 1),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(THUMB).clip(EtalonShapes.lg)
                        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.lg)
                        .alpha(if (photo.pending) 0.5f else 1f)
                        .combinedClickable(
                            onClick = { onOpen(i) },
                            onLongClick = onLongPress?.let { press -> { press(i) } },
                        ),
                )
                if (photo.pending) {
                    Box(
                        modifier = Modifier.align(Alignment.Center).size(36.dp)
                            .background(EtalonColors.navy.copy(alpha = 0.55f), EtalonShapes.pill),
                        contentAlignment = Alignment.Center,
                    ) {
                        EtalonIcon(
                            EtalonIcons.CloudUpload,
                            stringResource(R.string.photo_pending),
                            size = 20.dp,
                            tint = EtalonColors.onDark,
                        )
                    }
                }
            }
        }
        if (onAdd != null) {
            item {
                // [AddTile]'s dashed square, in the light palette: AddTile itself strokes in
                // white-40 %, which is invisible on the page and only reads on an indigo panel.
                Box(
                    Modifier.size(THUMB).clip(EtalonShapes.lg)
                        .dashedTileBorder(EtalonColors.ink3)
                        .clickable(onClick = onAdd),
                    contentAlignment = Alignment.Center,
                ) {
                    EtalonIcon(
                        EtalonIcons.Camera,
                        stringResource(R.string.action_add_photo),
                        size = 20.dp,
                        tint = EtalonColors.ink3,
                    )
                }
            }
        }
    }
}
