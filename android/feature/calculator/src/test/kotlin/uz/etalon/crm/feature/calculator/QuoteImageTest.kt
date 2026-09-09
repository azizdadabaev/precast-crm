package uz.etalon.crm.feature.calculator

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

/**
 * `writeQuotePng` and `shareQuoteIntent` off-device — see `QuoteImage.kt`'s own KDoc for the
 * FileProvider wiring (`app/src/main/res/xml/file_paths.xml`, mirrored here in this module's own
 * `src/test/AndroidManifest.xml` + `src/test/res/xml/file_paths.xml` — a Robolectric unit test
 * inside `:feature:calculator` never sees `:app`'s manifest, since `:app` depends on this module
 * and not the other way round).
 *
 * Every test that calls [writeQuotePng] is skipped (not failed) on a Windows host, via
 * `assumeTrue(File.separatorChar == '/')`: `androidx.core.content.FileProvider
 * .SimplePathStrategy.belongsToRoot` hardcodes `'/'` when checking a resolved file against its
 * configured root (`filePath.startsWith(rootPath + '/')` — FileProvider.java), but
 * `File.getCanonicalPath()` on Windows returns `\`-separated paths, so the check never matches and
 * `getUriForFile` throws `IllegalArgumentException("Failed to find configured root...")` for ANY
 * authority/root, no matter how correctly configured — before `writeQuotePng` can even return, so
 * every assertion afterward is moot too. This is a real, upstream limitation of running this
 * specific library call under Robolectric on Windows — verified by walking the exact
 * provider/meta-data/XML resolution by hand (all correct) down to this one hardcoded separator —
 * not a defect in `writeQuotePng` or in this module's manifest/resource wiring, and it does not
 * reproduce on a real device or emulator, or on a Linux/macOS host, where `File.separatorChar` is
 * already `/`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class QuoteImageTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `writeQuotePng writes a readable PNG under cacheDir slash quotes`() = runTest {
        assumeTrue(File.separatorChar == '/')

        writeQuotePng(context, ImageBitmap(4, 4))

        val files = File(context.cacheDir, "quotes").listFiles().orEmpty()
        assertEquals(1, files.size)
        val decoded = BitmapFactory.decodeFile(files.first().absolutePath)
        assertNotNull("the written file must decode back as an image", decoded)
        assertEquals(4, decoded!!.width)
        assertEquals(4, decoded.height)
    }

    @Test
    fun `writeQuotePng returns a content URI with the app's fileprovider authority`() = runTest {
        assumeTrue(File.separatorChar == '/')

        val uri = writeQuotePng(context, ImageBitmap(2, 2))

        assertEquals("content", uri.scheme)
        assertEquals("${context.packageName}.fileprovider", uri.authority)
    }

    @Test
    fun `writeQuotePng clears a stale file from an earlier share before writing the new one`() = runTest {
        assumeTrue(File.separatorChar == '/')

        writeQuotePng(context, ImageBitmap(2, 2))
        writeQuotePng(context, ImageBitmap(2, 2))

        val dir = File(context.cacheDir, "quotes")
        assertEquals(1, dir.listFiles()?.size)
    }

    @Test
    fun `shareQuoteIntent carries the read grant, the png mime type and the stream extra`() {
        val uri = Uri.parse("content://uz.etalon.crm.fileprovider/quotes/abc.png")
        val intent = shareQuoteIntent(uri, "Ҳисоб-китоб")

        assertEquals(Intent.ACTION_SEND, intent.action)
        assertEquals("image/png", intent.type)
        assertNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
        assertTrue((intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0)
    }
}
