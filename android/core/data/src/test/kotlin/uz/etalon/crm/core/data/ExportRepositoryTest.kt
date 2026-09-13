package uz.etalon.crm.core.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
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

private class ExportStubApi(private val body: ByteArray? = null, private val fail: Throwable? = null) : FakeEtalonApi() {
    override suspend fun exportBackup() = fail?.let { throw it }
        ?: (body ?: "fake-xlsx-bytes".toByteArray()).toResponseBody(XLSX_MEDIA_TYPE.toMediaType())
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
}
