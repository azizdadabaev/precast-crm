package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

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
    val ext = LocalEtalonColors.current
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(photos) { i, photo ->
            Box(modifier = Modifier.size(104.dp)) {
                AsyncImage(
                    model = photo.url,
                    contentDescription = stringResource(R.string.photo_n, i + 1),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(104.dp).clip(MaterialTheme.shapes.medium)
                        .border(1.dp, ext.border, MaterialTheme.shapes.medium)
                        .alpha(if (photo.pending) 0.5f else 1f)
                        .combinedClickable(
                            onClick = { onOpen(i) },
                            onLongClick = onLongPress?.let { press -> { press(i) } },
                        ),
                )
                if (photo.pending) {
                    Box(
                        modifier = Modifier.align(Alignment.Center).size(36.dp)
                            .background(Color.Black.copy(alpha = 0.55f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.CloudUpload,
                            contentDescription = stringResource(R.string.photo_pending),
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
        if (onAdd != null) {
            item {
                Box(
                    Modifier.size(104.dp).clip(MaterialTheme.shapes.medium)
                        .border(1.dp, ext.border, MaterialTheme.shapes.medium)
                        .clickable(onClick = onAdd),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.AddAPhoto, contentDescription = stringResource(R.string.action_add_photo)) }
            }
        }
    }
}
