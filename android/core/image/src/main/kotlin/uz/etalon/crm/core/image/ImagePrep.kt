package uz.etalon.crm.core.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max
import kotlin.math.roundToInt

interface ImagePrep {
    /** Decode [source], apply EXIF rotation, scale the longest edge to at most
     *  [maxEdge], encode JPEG at [quality], and write it into the app cache. */
    suspend fun prepare(source: Uri, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>
    /** Same, for a file the camera already wrote. */
    suspend fun prepare(source: File, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>

    companion object {
        /** Same cap the web uses in prepare-upload.ts. */
        const val MAX_EDGE = 1280
        /** Same JPEG quality the web uses (0.65). */
        const val QUALITY = 65
    }
}

/**
 * Decodes with inSampleSize so a 12 MP camera frame never lands in memory at full
 * size, applies the EXIF rotation the camera recorded, scales the longest edge to
 * the cap, and writes JPEG into the app cache. The server rejects HEIC, so every
 * capture goes through here before it reaches the outbox.
 */
@Singleton
class AndroidImagePrep @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : ImagePrep {

    override suspend fun prepare(source: Uri, maxEdge: Int, quality: Int): Result<PreparedImage> =
        run({ context.contentResolver.openInputStream(source) }, maxEdge, quality)

    override suspend fun prepare(source: File, maxEdge: Int, quality: Int): Result<PreparedImage> =
        run({ source.inputStream() }, maxEdge, quality)

    private suspend fun run(open: () -> InputStream?, maxEdge: Int, quality: Int): Result<PreparedImage> =
        withContext(Dispatchers.IO) {
            runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                requireNotNull(open()) { "source is not readable" }.use { BitmapFactory.decodeStream(it, null, bounds) }
                require(bounds.outWidth > 0 && bounds.outHeight > 0) { "source is not a decodable image" }

                val longest = max(bounds.outWidth, bounds.outHeight)
                val opts = BitmapFactory.Options().apply {
                    inSampleSize = sampleSizeFor(longest, maxEdge)
                }
                val decoded = requireNotNull(open()) { "source is not readable" }
                    .use { BitmapFactory.decodeStream(it, null, opts) }
                    ?: error("source is not a decodable image")

                val rotation = requireNotNull(open()) { "source is not readable" }
                    .use { ExifInterface(it).rotationDegrees }
                val upright = if (rotation == 0) decoded else decoded.rotate(rotation)
                val scaled = upright.scaleToFit(maxEdge)
                // Capture dimensions before recycling: a recycled Bitmap's width/height
                // are no longer safe to read.
                val width = scaled.width
                val height = scaled.height

                val out = File(context.cacheDir, "upload-${UUID.randomUUID()}.jpg")
                try {
                    val encoded = out.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, quality, it) }
                    check(encoded) { "failed to encode JPEG" }
                } catch (t: Throwable) {
                    out.delete()
                    throw t
                } finally {
                    // Identity-aware: scaleToFit/rotate return `this` unchanged when no
                    // transform was needed, so two of these variables can be the same
                    // instance. Guard against recycling any bitmap twice.
                    if (scaled !== upright) scaled.recycle()
                    if (upright !== decoded) upright.recycle()
                    decoded.recycle()
                }

                PreparedImage(out, width, height, out.length())
            }
        }

    /** Largest power-of-two subsample that still leaves the image above the cap. */
    private fun sampleSizeFor(longestEdge: Int, maxEdge: Int): Int {
        var sample = 1
        while (longestEdge / (sample * 2) >= maxEdge) sample *= 2
        return sample
    }

    private fun Bitmap.rotate(degrees: Int): Bitmap =
        Bitmap.createBitmap(this, 0, 0, width, height, Matrix().apply { postRotate(degrees.toFloat()) }, true)

    private fun Bitmap.scaleToFit(maxEdge: Int): Bitmap {
        val longest = max(width, height)
        if (longest <= maxEdge) return this
        val ratio = maxEdge.toDouble() / longest
        val w = (width * ratio).roundToInt().coerceAtLeast(1)
        val h = (height * ratio).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(this, w, h, true)
    }
}
