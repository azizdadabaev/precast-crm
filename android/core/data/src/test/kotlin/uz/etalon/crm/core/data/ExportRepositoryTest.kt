package uz.etalon.crm.core.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.Source
import okio.Timeout
import okio.buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.testing.FakeEtalonApi
import java.io.File
import java.io.IOException

private const val XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** A body whose stream dies mid-read — the route sent headers, then the connection dropped before
 *  the workbook finished. `ExportRepository` must not leave the partial file it had started writing. */
private fun throwingBody(): ResponseBody = object : ResponseBody() {
    override fun contentType(): MediaType = XLSX_MEDIA_TYPE.toMediaType()
    override fun contentLength(): Long = -1
    override fun source(): BufferedSource = object : Source {
        override fun read(sink: Buffer, byteCount: Long): Long = throw IOException("stream died mid-copy")
        override fun timeout(): Timeout = Timeout.NONE
        override fun close() {}
    }.buffer()
}

private class ExportStubApi(
    private val body: ByteArray? = null,
    private val fail: Throwable? = null,
    private val streamFails: Boolean = false,
) : FakeEtalonApi() {
    override suspend fun exportBackup(): ResponseBody = when {
        fail != null -> throw fail
        streamFails -> throwingBody()
        else -> (body ?: "fake-xlsx-bytes".toByteArray()).toResponseBody(XLSX_MEDIA_TYPE.toMediaType())
    }
}

/** `ExportRepository` streams `EtalonApi.exportBackup()`'s body to `cacheDir/exports/` — the
 *  same `FileProvider`-scoped directory shape as `QuoteImage.kt`'s `writeQuoteFile` (R4). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExportRepositoryTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test fun `the stream is written to cache slash exports slash orders-backup dash stamp dot xlsx`() = runTest {
        val file = ExportRepository(ExportStubApi(), context).downloadBackup().getOrThrow()
        assertEquals(File(context.cacheDir, "exports"), file.parentFile)
        assertTrue(
            "expected orders-backup-<yyyyMMdd-HHmm>.xlsx, got ${file.name}",
            file.name.matches(Regex("orders-backup-\\d{8}-\\d{4}\\.xlsx")),
        )
        assertEquals("fake-xlsx-bytes", file.readText())
    }

    @Test fun `an api failure surfaces as Result failure, not a thrown exception`() = runTest {
        val result = ExportRepository(ExportStubApi(fail = IOException("down")), context).downloadBackup()
        assertTrue(result.isFailure)
    }

    @Test fun `a stream that fails partway through leaves no partial file behind`() = runTest {
        val result = ExportRepository(ExportStubApi(streamFails = true), context).downloadBackup()
        assertTrue(result.isFailure)
        val leftover = File(context.cacheDir, "exports").listFiles().orEmpty()
        assertTrue("expected no partial file, found ${leftover.map { it.name }}", leftover.isEmpty())
    }
}
