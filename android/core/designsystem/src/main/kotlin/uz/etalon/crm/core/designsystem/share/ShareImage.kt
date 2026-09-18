package uz.etalon.crm.core.designsystem.share

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.core.content.FileProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Turning a composable into a PNG the operator can send from any messenger.
 *
 * Lifted out of the calculator unchanged when the order detail needed the same thing. It is here
 * rather than in either feature because what it writes is a file carrying a customer's name, phone
 * and address: the cache-clearing and the `content://` grant below are the only correct version of
 * that, and a second copy in another module is a second chance to get it wrong.
 *
 * The caller supplies the card; this supplies the capture, the file and the intent.
 */

/**
 * Lays a composable out at its own chosen width while occupying no space on screen.
 *
 * The child sizes itself by its own `Modifier.width`, not by this layout, which measures with no
 * constraint of its own so that width wins. The child never draws to the real canvas either — see
 * [rememberShareImage]'s `drawWithContent`, which records into a graphics layer and stops there —
 * so nothing leaks onto the screen even though the child is technically placed inside this
 * zero-size box.
 */
@Composable
fun ZeroSizeCapture(content: @Composable () -> Unit) {
    Layout(content = content) { measurables, _ ->
        val placeable = measurables.first().measure(Constraints())
        layout(0, 0) { placeable.place(0, 0) }
    }
}

/**
 * Writes the captured card under `cacheDir/quotes/` and returns the file itself.
 *
 * A random file name per share, and every older file in the directory removed first: a stale PNG
 * left behind carries a previous customer's name, phone and address baked into the image, and a
 * predictable name would let anything holding a `content://` grant on one share guess the next
 * one's URI.
 *
 * Split out of [writeSharePng] so the write and the cleanup can be tested on any host —
 * `FileProvider.getUriForFile` cannot run under Robolectric on Windows, and everything this
 * function does is the half that has nothing to do with FileProvider.
 *
 * Throws [java.io.IOException] if the directory cannot be used — a full disk, or the name taken by
 * something that is not a directory. [rememberShareImage] is where that is caught and shown.
 */
suspend fun writeShareFile(context: Context, bitmap: ImageBitmap): File = withContext(Dispatchers.IO) {
    // "quotes", not "shares": app/src/main/res/xml/file_paths.xml exposes exactly this one cache
    // subdirectory to the FileProvider, and a directory it does not list makes getUriForFile throw
    // «Failed to find configured root» at the moment the operator taps share.
    val dir = File(context.cacheDir, "quotes").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() }
    File(dir, "${UUID.randomUUID()}.png").also { f ->
        f.outputStream().use { bitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

/**
 * [writeShareFile]'s file as the `content://` URI [FileProvider] exposes for it — see
 * `app/src/main/res/xml/file_paths.xml` and the `<provider>` entry in the manifest, both scoped to
 * exactly that subdirectory and nothing wider.
 */
suspend fun writeSharePng(context: Context, bitmap: ImageBitmap): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", writeShareFile(context, bitmap))

/** [uri] carries a customer's name, phone and address baked into its image, and this [Intent]
 *  hands it to whichever app the operator picks — nothing about either is logged on this path. */
fun shareImageIntent(uri: Uri, subject: String): Intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/png"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_SUBJECT, subject)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) // without this every messenger gets a SecurityException
}

/**
 * A composable rendered offscreen, ready to be turned into a bitmap on demand.
 *
 * Exists because the order detail does two different things with one card: «Юбориш (расм)» hands
 * it to a messenger, «Чатга юбориш» uploads it to the customer's chat. Composing the card twice
 * would be two offscreen copies of the same thing.
 */
class ImageCapture internal constructor(private val layer: GraphicsLayer) {
    suspend fun toBitmap(): ImageBitmap = layer.toImageBitmap()
}

/** Renders [content] offscreen and returns the handle that can photograph it. */
@Composable
fun rememberImageCapture(content: @Composable () -> Unit): ImageCapture {
    val layer = rememberGraphicsLayer()
    ZeroSizeCapture {
        // The card is composed for the capture but is not on screen, so it must not be in the
        // semantics tree either: TalkBack would otherwise read out a card nobody can see, and a
        // node search — a test's, or an automation's — would find every figure on this screen
        // twice.
        Box(
            Modifier
                .clearAndSetSemantics {}
                .drawWithContent { layer.record { this@drawWithContent.drawContent() } },
        ) {
            content()
        }
    }
    return remember(layer) { ImageCapture(layer) }
}

/** What [rememberShareImage] hands its caller: the tap, whether it is still working, and the one
 *  thing that can go wrong. */
data class ShareAction(val onClick: () -> Unit, val enabled: Boolean, val error: String?)

/**
 * Renders [content] offscreen, writes it as a PNG and opens the system chooser.
 *
 * @param enabled false while there is nothing worth sending — the caller decides what that means.
 */
@Composable
fun rememberShareImage(
    subject: String,
    failureText: String,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
): ShareAction {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val capture = rememberImageCapture(content)
    var sharing by remember { mutableStateOf(false) }
    var shareError by remember { mutableStateOf<String?>(null) }

    return ShareAction(
        onClick = {
            sharing = true
            shareError = null
            scope.launch {
                // A full cache partition is enough to make writeSharePng throw, and this launch has
                // no parent to catch it: uncaught, it takes the process down and leaves the button
                // spinning forever on the way. `finally` is what puts the spinner down — both on
                // that failure and on the ordinary cancellation of leaving the screen.
                try {
                    val uri = writeSharePng(context, capture.toBitmap())
                    context.startActivity(Intent.createChooser(shareImageIntent(uri, subject), null))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    shareError = failureText
                } finally {
                    sharing = false
                }
            }
        },
        enabled = enabled && !sharing,
        error = shareError,
    )
}
