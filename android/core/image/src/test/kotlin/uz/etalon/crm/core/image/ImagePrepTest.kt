package uz.etalon.crm.core.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.exifinterface.media.ExifInterface
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ImagePrepTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun writeJpeg(w: Int, h: Int, name: String): File {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val f = File(context.cacheDir, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        return f
    }

    private fun sizeOf(f: File): Pair<Int, Int> {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.absolutePath, o)
        return o.outWidth to o.outHeight
    }

    private fun writeJpegWithOrientation(w: Int, h: Int, name: String, orientation: Int): File {
        val f = writeJpeg(w, h, name)
        ExifInterface(f.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        return f
    }

    @Test
    fun `scales the longest edge down to the cap and keeps the aspect ratio`() = runTest {
        val src = writeJpeg(3000, 2000, "big.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        val (w, h) = sizeOf(out.file)
        assertEquals(1280, max(w, h))
        assertTrue(abs(h - w * 2000.0 / 3000.0) <= 1.0)
        assertEquals(w, out.width)
        assertEquals(h, out.height)
    }

    @Test
    fun `leaves an already small image at its own size`() = runTest {
        val src = writeJpeg(640, 480, "small.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        assertEquals(640 to 480, sizeOf(out.file))
    }

    @Test
    fun `writes a jpeg into the cache directory and reports its size`() = runTest {
        val src = writeJpeg(2000, 1000, "wide.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        assertTrue(out.file.absolutePath.startsWith(context.cacheDir.absolutePath))
        assertTrue(out.file.name.endsWith(".jpg"))
        assertEquals(out.file.length(), out.bytes)
        assertTrue("prepared file should be under the server's 8 MB cap", out.bytes < 8L * 1024 * 1024)
    }

    @Test
    fun `applies EXIF rotation, swapping width and height, when no scaling is needed`() = runTest {
        val src = writeJpegWithOrientation(1200, 600, "rotate-only.jpg", ExifInterface.ORIENTATION_ROTATE_90)
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        val (w, h) = sizeOf(out.file)
        assertEquals(600, w)
        assertEquals(1200, h)
        assertEquals(w, out.width)
        assertEquals(h, out.height)
    }

    @Test
    fun `applies EXIF rotation and then scales when the rotated image still exceeds the cap`() = runTest {
        val src = writeJpegWithOrientation(2400, 1200, "rotate-and-scale.jpg", ExifInterface.ORIENTATION_ROTATE_90)
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        val (w, h) = sizeOf(out.file)
        // Rotated upright is 1200x2400 (portrait, ratio 1:2) before the cap is applied.
        assertEquals(1280, max(w, h))
        assertTrue(abs(min(w, h) * 2.0 - max(w, h)) <= 1.0)
        assertEquals(w, out.width)
        assertEquals(h, out.height)
    }

    @Test
    fun `reports a failure instead of throwing when the source cannot be decoded`() = runTest {
        val junk = File(context.cacheDir, "not-an-image.jpg").apply { writeText("hello") }
        val result = AndroidImagePrep(context).prepare(junk)
        assertTrue(result.isFailure)
    }
}
