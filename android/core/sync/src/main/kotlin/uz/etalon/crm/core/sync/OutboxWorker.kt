package uz.etalon.crm.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import uz.etalon.crm.core.data.OrdersGateway
import uz.etalon.crm.core.data.runCatchingCancellable
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import java.io.File
import java.io.IOException

sealed interface OutboxOutcome {
    /** Produced only by the success path in [OutboxWorker.doWork] — [outcomeFor] never returns
     *  it, since it only runs from a catch block where something has already gone wrong. */
    data object Done : OutboxOutcome
    data object Retry : OutboxOutcome
    data class Fail(val message: String) : OutboxOutcome
}

/**
 * A queued row's prepared JPEG lives in a directory the OS can evict (cache pressure, a manual
 * clear) between enqueue and this attempt. Deliberately does NOT extend [IOException]: an
 * `ApiException` also extends it, but a plain dropped connection must retry while a missing
 * file never can, and the two must not share a branch in [outcomeFor].
 */
class MissingUploadFileException(path: String?) : Exception("Outbox file missing: $path")

/**
 * Decides what a failed attempt means. Anything the server might answer differently later
 * (token refresh, a timeout, rate limiting, its own 5xx) is retried; anything it rejected on the
 * merits is a permanent failure the operator has to see, because the photo represents a physical
 * event that may now be inconsistent with the order's state. A missing file can never succeed on
 * a retry, so it fails permanently too.
 */
fun outcomeFor(t: Throwable): OutboxOutcome = when {
    t is MissingUploadFileException -> OutboxOutcome.Fail("Сурат топилмади, қайта суратга олинг")
    t is ApiException && t.status == 401 -> OutboxOutcome.Retry     // token refresh, not a rejection
    t is ApiException && t.status == 408 -> OutboxOutcome.Retry
    t is ApiException && t.status == 429 -> OutboxOutcome.Retry
    t is ApiException && t.status >= 500 -> OutboxOutcome.Retry
    t is ApiException -> OutboxOutcome.Fail(t.uzbekMessage)
    t is IOException -> OutboxOutcome.Retry
    else -> OutboxOutcome.Fail(t.message ?: "Хатолик")
}

/**
 * Drains the whole outbox in one run rather than handling a single row: [OutboxDao.claimNext]
 * atomically claims the oldest QUEUED row and [OutboxDao.resetRunning] recovers rows a killed
 * process stranded in RUNNING, so a single scheduled worker naturally picks up every pending
 * upload — there is no per-row work request to key or cancel.
 */
@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: OutboxDao,
    private val api: EtalonApi,
    private val orders: OrdersGateway,
    private val json: Json,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        dao.resetRunning(System.currentTimeMillis())

        while (true) {
            val row = dao.claimNext(System.currentTimeMillis()) ?: return Result.success()
            val outcome = runCatchingCancellable { send(row) }.fold(
                onSuccess = { OutboxOutcome.Done },
                onFailure = { outcomeFor(it) },
            )
            when (outcome) {
                OutboxOutcome.Done -> {
                    row.filePath?.let { File(it).delete() }
                    dao.delete(row.id)
                    orders.refreshDetail(row.orderId)
                }
                OutboxOutcome.Retry -> {
                    dao.markQueued(row.id, System.currentTimeMillis())
                    return Result.retry()
                }
                is OutboxOutcome.Fail -> dao.markFailed(row.id, outcome.message, System.currentTimeMillis())
            }
        }
    }

    private suspend fun send(row: OutboxEntity) {
        val payload = json.decodeFromString(JsonObject.serializer(), row.payloadJson)
        val file = row.filePath?.let(::File)?.takeIf { it.exists() } ?: throw MissingUploadFileException(row.filePath)
        val part = MultipartBody.Part.createFormData("file", file.name, file.asRequestBody(JPEG))

        fun text(key: String, fallback: String = "") =
            (payload[key]?.jsonPrimitive?.content ?: fallback).toRequestBody(PLAIN)

        when (OutboxKind.valueOf(row.kind)) {
            OutboxKind.LOAD_TRUCK -> api.loadTruck(row.orderId, part, row.id)
            OutboxKind.ADD_LOADED_PHOTO -> api.addLoadedPhoto(row.orderId, part, row.id)
            OutboxKind.DELIVERY_PROOF -> api.deliveryProof(
                id = row.orderId, file = part,
                cashAmount = text("cashAmount", "0"),
                noCashCollected = text("noCashCollected", "false"),
                noCashCollectedNote = text("noCashCollectedNote"),
                driverReturned = text("driverReturned", "false"),
                idempotencyKey = row.id,
            )
            OutboxKind.LOAD_SHIPMENT -> api.loadShipment(
                id = row.orderId, sid = requireNotNull(row.shipmentId),
                file = part,
                loadedBeams = (payload["loadedBeams"]?.toString() ?: "{}").toRequestBody(PLAIN),
                loadedBlocks = text("loadedBlocks", "0"),
                idempotencyKey = row.id,
            )
        }
    }

    companion object {
        private val JPEG = "image/jpeg".toMediaType()
        private val PLAIN = "text/plain".toMediaType()
    }
}
