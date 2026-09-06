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
import uz.etalon.crm.core.data.CurrentUser
import uz.etalon.crm.core.data.OrdersGateway
import uz.etalon.crm.core.data.runCatchingCancellable
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.TokenProvider
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
    // A bug, not a server rejection (unknown OutboxKind, a null shipmentId, malformed payload
    // JSON) — the raw exception text is not operator-facing, so it never reaches lastError.
    else -> OutboxOutcome.Fail(GENERIC_FAILURE_MESSAGE)
}

private const val GENERIC_FAILURE_MESSAGE = "Хатолик юз берди"

/**
 * Drains the signed-in operator's outbox rows in one run rather than handling a single row:
 * [OutboxDao.claimNext] atomically claims their oldest QUEUED row and [OutboxDao.resetRunning]
 * recovers rows a killed process stranded in RUNNING, so a single scheduled worker naturally
 * picks up every pending upload — there is no per-row work request to key or cancel.
 *
 * The drain is scoped to one operator's own rows — another operator's photo and cash figure are not
 * merely skipped, they are unclaimable (the predicate lives in the claim query) — and it pins that
 * operator's token when it starts, sending it explicitly on every upload. Both halves are needed:
 * `AuthInterceptor` reads the token store live, once per call, so a row claimed while X was signed
 * in and sent a moment after Y's token landed would otherwise be posted as Y, carrying X's cash
 * figure, with no 401 to stop it.
 */
@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: OutboxDao,
    private val api: EtalonApi,
    private val orders: OrdersGateway,
    private val json: Json,
    private val currentUser: CurrentUser,
    private val tokens: TokenProvider,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Nobody signed in (the app is sitting on the PIN screen after a 401, say): there is no
        // owner to drain for and no token to drain under. An ordinary state, not a failure — the
        // rows wait, untouched, for their owner to come back. `SessionRepository.login()` schedules
        // a fresh drain then, because returning success here ends WorkManager's unique-work chain.
        val owner = currentUser.id() ?: return Result.success()
        // Pinned once, for the whole run, and sent on the request itself. Read per upload instead
        // and the credential could change between claiming a row and sending it.
        val authorization = tokens.token()?.let { "Bearer $it" } ?: return Result.success()

        dao.resetRunning(System.currentTimeMillis())

        // A row that keeps retrying (offline, a flaky 5xx) must not freeze every newer upload
        // behind it: claimNext always takes the oldest QUEUED row, so a retryable one is left
        // RUNNING instead of being requeued immediately — that drops it out of claimNext's
        // candidates for the rest of THIS run, letting newer rows drain first. It goes back to
        // QUEUED only once the queue is otherwise empty, via the requeue pass below. If the
        // worker is killed before that pass runs, the row stays RUNNING and the next run's
        // resetRunning() above recovers it, same as any other stranded row.
        val deferred = mutableListOf<OutboxEntity>()
        val touchedOrders = mutableSetOf<String>()

        while (true) {
            // Re-read on every pass, not once: the session can end (or change hands) mid-drain,
            // and continuing would send this operator's rows under whoever is signed in now.
            if (currentUser.id() != owner) break
            val row = dao.claimNext(owner, System.currentTimeMillis()) ?: break
            val outcome = runCatchingCancellable { send(row, authorization) }.fold(
                onSuccess = { OutboxOutcome.Done },
                onFailure = { outcomeFor(it) },
            )
            when (outcome) {
                OutboxOutcome.Done -> {
                    row.filePath?.let { File(it).delete() }
                    dao.delete(row.id)
                    touchedOrders += row.orderId
                }
                OutboxOutcome.Retry -> deferred += row
                is OutboxOutcome.Fail -> dao.markFailed(row.id, outcome.message, System.currentTimeMillis())
            }
        }

        // One refresh per order, not one per row — several queued rows sharing an order (a
        // truck-load photo followed by a delivery proof) would otherwise cost a round-trip each.
        touchedOrders.forEach { orders.refreshDetail(it) }

        if (deferred.isEmpty()) return Result.success()
        val now = System.currentTimeMillis()
        deferred.forEach { dao.upsert(it.copy(state = OutboxState.QUEUED, attempts = it.attempts + 1, updatedAt = now)) }
        return Result.retry()
    }

    private suspend fun send(row: OutboxEntity, authorization: String) {
        val payload = json.decodeFromString(JsonObject.serializer(), row.payloadJson)
        val file = row.filePath?.let(::File)?.takeIf { it.exists() } ?: throw MissingUploadFileException(row.filePath)
        val part = MultipartBody.Part.createFormData("file", file.name, file.asRequestBody(JPEG))

        fun text(key: String, fallback: String = "") =
            (payload[key]?.jsonPrimitive?.content ?: fallback).toRequestBody(PLAIN)

        when (OutboxKind.valueOf(row.kind)) {
            OutboxKind.LOAD_TRUCK -> api.loadTruck(row.orderId, part, row.id, authorization)
            OutboxKind.ADD_LOADED_PHOTO -> api.addLoadedPhoto(row.orderId, part, row.id, authorization)
            OutboxKind.DELIVERY_PROOF -> api.deliveryProof(
                id = row.orderId, file = part,
                cashAmount = text("cashAmount", "0"),
                noCashCollected = text("noCashCollected", "false"),
                noCashCollectedNote = text("noCashCollectedNote"),
                driverReturned = text("driverReturned", "false"),
                idempotencyKey = row.id,
                authorization = authorization,
            )
            OutboxKind.LOAD_SHIPMENT -> api.loadShipment(
                id = row.orderId, sid = requireNotNull(row.shipmentId),
                file = part,
                loadedBeams = (payload["loadedBeams"]?.toString() ?: "{}").toRequestBody(PLAIN),
                loadedBlocks = text("loadedBlocks", "0"),
                idempotencyKey = row.id,
                authorization = authorization,
            )
        }
    }

    companion object {
        private val JPEG = "image/jpeg".toMediaType()
        private val PLAIN = "text/plain".toMediaType()
    }
}
