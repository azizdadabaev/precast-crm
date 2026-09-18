package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
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
/** One photo. Sized by the caller so the strip and the grid can share it. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PhotoTile(
    photo: PhotoRef,
    index: Int,
    modifier: Modifier,
    onOpen: (Int) -> Unit,
    onLongPress: ((Int) -> Unit)?,
) {
    Box(modifier) {
        AsyncImage(
            model = photo.url,
            contentDescription = stringResource(R.string.photo_n, index + 1),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().clip(EtalonShapes.lg)
                .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.lg)
                .alpha(if (photo.pending) 0.5f else 1f)
                .combinedClickable(
                    onClick = { onOpen(index) },
                    onLongClick = onLongPress?.let { press -> { press(index) } },
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

/** [AddTile]'s dashed square, in the light palette: AddTile itself strokes in white-40 %, which is
 *  invisible on the page and only reads on an indigo panel. */
@Composable
private fun AddPhotoTile(modifier: Modifier, onAdd: () -> Unit) = Box(
    modifier.clip(EtalonShapes.lg).dashedTileBorder(EtalonColors.ink3).clickable(onClick = onAdd),
    contentAlignment = Alignment.Center,
) {
    EtalonIcon(
        EtalonIcons.Camera,
        stringResource(R.string.action_add_photo),
        size = 20.dp,
        tint = EtalonColors.ink3,
    )
}

@Composable
fun PhotoStrip(
    photos: List<PhotoRef>,
    onOpen: (Int) -> Unit,
    onAdd: (() -> Unit)? = null,
    onLongPress: ((Int) -> Unit)? = null,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(photos) { i, photo ->
            PhotoTile(photo, i, Modifier.size(THUMB), onOpen, onLongPress)
        }
        if (onAdd != null) item { AddPhotoTile(Modifier.size(THUMB), onAdd) }
    }
}

/**
 * The same tiles laid out as a grid of [columns] squares instead of a scrolling row.
 *
 * Design 7a's «Юкланган машина» is three-up: the loaded truck is checked by comparing photos
 * against each other, which a row that scrolls half a photo off the edge makes harder. The strip
 * stays the right shape where a photo is an attachment rather than the subject — the payment
 * screens keep it.
 */
@Composable
fun PhotoGrid(
    photos: List<PhotoRef>,
    onOpen: (Int) -> Unit,
    columns: Int = 3,
    onAdd: (() -> Unit)? = null,
    onLongPress: ((Int) -> Unit)? = null,
) {
    val cells: List<@Composable (Modifier) -> Unit> = buildList {
        photos.forEachIndexed { i, photo ->
            add { m -> PhotoTile(photo, i, m, onOpen, onLongPress) }
        }
        if (onAdd != null) add { m -> AddPhotoTile(m, onAdd) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cells.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { cell -> cell(Modifier.weight(1f).aspectRatio(1f)) }
                // Keeps the last row's tiles the same size as every other row's rather than
                // stretching one photo across the gap.
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}
