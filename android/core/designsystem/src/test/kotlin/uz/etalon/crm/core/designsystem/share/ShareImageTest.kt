package uz.etalon.crm.core.designsystem.share

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.IOException

/**
 * `writeShareFile`, `writeSharePng` and `shareImageIntent` off-device — see `ShareImage.kt`'s own
 * KDoc for the FileProvider wiring (`app/src/main/res/xml/file_paths.xml`, mirrored here in this
 * module's own `src/test/AndroidManifest.xml` + `src/test/res/xml/file_paths.xml` — a Robolectric
 * unit test inside `:feature:calculator` never sees `:app`'s manifest, since `:app` depends on this
 * module and not the other way round).
 *
 * Only the ONE case that actually calls `FileProvider.getUriForFile` is skipped (not failed) on a
 * Windows host, via `assumeTrue(File.separatorChar == '/')`: `androidx.core.content.FileProvider
 * .SimplePathStrategy.belongsToRoot` hardcodes `'/'` when checking a resolved file against its
 * configured root (`filePath.startsWith(rootPath + '/')` — FileProvider.java), but
 * `File.getCanonicalPath()` on Windows returns `\`-separated paths, so the check never matches and
 * `getUriForFile` throws `IllegalArgumentException("Failed to find configured root...")` for ANY
 * authority/root, no matter how correctly configured. This is a real, upstream limitation of
 * running that specific library call under Robolectric on Windows — verified by walking the exact
 * provider/meta-data/XML resolution by hand (all correct) down to this one hardcoded separator —
 * not a defect in `writeSharePng` or in this module's manifest/resource wiring, and it does not
 * reproduce on a real device or emulator, or on a Linux/macOS host.
 *
 * Everything else — the write itself, the stale-file cleanup that keeps a previous customer's
 * details out of the next share, and the IOException the share button has to catch — goes through
 * `writeShareFile` against a real `cacheDir` and therefore runs on EVERY host. Before that split
 * this file had zero executed coverage on Windows, and there is no CI to make up for it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ShareImageTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `writeShareFile writes a readable PNG under cacheDir slash quotes`() = runTest {
        val written = writeShareFile(context, ImageBitmap(4, 4))

        assertEquals(File(context.cacheDir, "quotes"), written.parentFile)
        val files = File(context.cacheDir, "quotes").listFiles().orEmpty()
        assertEquals(1, files.size)
        val decoded = BitmapFactory.decodeFile(files.first().absolutePath)
        assertNotNull("the written file must decode back as an image", decoded)
        assertEquals(4, decoded!!.width)
        assertEquals(4, decoded.height)
    }

    /** A stale PNG carries a previous customer's name, phone and address baked into the image. */
    @Test
    fun `writeShareFile clears a stale file from an earlier share before writing the new one`() = runTest {
        val first = writeShareFile(context, ImageBitmap(2, 2))
        val second = writeShareFile(context, ImageBitmap(2, 2))

        val dir = File(context.cacheDir, "quotes")
        assertEquals(1, dir.listFiles()?.size)
        assertTrue("each share gets its own unpredictable name", first.name != second.name)
        assertTrue(second.exists())
    }

    /** The failure `rememberShareQuote` catches. Reproduced by taking the directory's own name with a
     *  plain file, which is what a full or read-only cache partition amounts to here. */
    @Test
    fun `writeShareFile fails with an IOException when the quotes directory cannot be used`() = runTest {
        File(context.cacheDir, "quotes").apply { parentFile?.mkdirs() }.writeText("not a directory")

        var thrown: Throwable? = null
        try {
            writeShareFile(context, ImageBitmap(2, 2))
        } catch (e: Throwable) {
            thrown = e
        }

        assertTrue("expected an IOException, got $thrown", thrown is IOException)
    }

    @Test
    fun `writeSharePng returns a content URI with the app's fileprovider authority`() = runTest {
        assumeTrue(File.separatorChar == '/')

        val uri = writeSharePng(context, ImageBitmap(2, 2))

        assertEquals("content", uri.scheme)
        assertEquals("${context.packageName}.fileprovider", uri.authority)
    }

    @Test
    fun `shareImageIntent carries the read grant, the png mime type and the stream extra`() {
        val uri = Uri.parse("content://uz.etalon.crm.fileprovider/quotes/abc.png")
        val intent = shareImageIntent(uri, "Ҳисоб-китоб")

        assertEquals(Intent.ACTION_SEND, intent.action)
        assertEquals("image/png", intent.type)
        assertNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
        assertTrue((intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0)
    }
}
