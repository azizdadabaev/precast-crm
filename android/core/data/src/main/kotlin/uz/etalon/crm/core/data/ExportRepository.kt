package uz.etalon.crm.core.data

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uz.etalon.crm.core.network.EtalonApi
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The owner's Excel backup (`GET /api/orders/export`, gated by `order.exportBackup`), streamed
 * straight to a cache file rather than buffered in memory — the workbook can cover every order
 * the factory has ever placed. Shared onward through the existing `FileProvider` (the quote-PNG
 * share path, `QuoteImage.kt`), which the screen builds a `Uri` from.
 *
 * Never queued (R4): unlike the outbox's photo uploads this call is not idempotent — the route
 * builds a fresh snapshot every time — and a retry from a stale queue would only re-download what
 * a second tap gets just as well.
 */
@Singleton
class ExportRepository @Inject constructor(
    private val api: EtalonApi,
    @ApplicationContext private val context: Context,
) {
    suspend fun downloadBackup(): Result<File> = runCatchingCancellable {
        withContext(Dispatchers.IO) {
            val body = api.exportBackup()
            val dir = File(context.cacheDir, "exports").apply { mkdirs() }
            val file = File(dir, "orders-backup-${STAMP_FORMAT.format(LocalDateTime.now())}.xlsx")
            try {
                body.byteStream().use { input -> file.outputStream().use { output -> input.copyTo(output) } }
            } catch (t: Throwable) {
                // A stream that dies partway through must not leave a truncated .xlsx behind for a
                // later share attempt to pick up and hand the owner a corrupt workbook.
                file.delete()
                throw t
            }
            file
        }
    }

    private companion object {
        val STAMP_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")
    }
}
