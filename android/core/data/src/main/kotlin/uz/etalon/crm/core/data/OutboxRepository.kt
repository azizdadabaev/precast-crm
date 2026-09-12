package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PendingUpload
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Implemented in :core:sync so this module never depends on WorkManager. */
interface OutboxScheduler { fun schedule(id: String) }

/** The seam LogisticsRepository and CalculatorRepository talk to, so their tests need no file system. */
interface OutboxGateway {
    suspend fun enqueue(
        kind: OutboxKind, orderId: String? = null, shipmentId: String? = null, paymentId: String? = null,
        photo: PreparedImage? = null, payload: JsonObject = JsonObject(emptyMap()),
        rowId: String? = null,
    ): String

    /** The signed-in operator's own rows of [kind] that the server permanently rejected — see
     *  [OutboxDao.observeFailedOfKind] for why a rejected order needs its own door. */
    fun observeFailed(kind: OutboxKind): Flow<List<FailedOutboxRow>>

    /** Drops one row for good, file and all — what an operator taps to acknowledge a rejection. */
    suspend fun discard(id: String)
}

/** A row the server rejected: enough to say WHAT was refused and WHY, without the caller having
 *  to know the row's payload shape. [payload] is the request as it was queued, so a caller can
 *  name the customer the rejected order was for. */
data class FailedOutboxRow(val id: String, val error: String?, val payload: JsonObject)

@Singleton
class OutboxRepository @Inject constructor(
    private val dao: OutboxDao,
    private val scheduler: OutboxScheduler,
    @param:Named("outboxDir") private val outboxDir: File,
    private val json: Json,
    private val currentUser: CurrentUser,
) : OutboxGateway {

    /** The signed-in operator's own queue for this order. The owner is resolved when collection
     *  starts; with nobody signed in there is nothing of theirs to show. */
    fun observeForOrder(orderId: String): Flow<List<PendingUpload>> = flow {
        val owner = currentUser.id()
        if (owner == null) emit(emptyList())
        else emitAll(dao.observeForOrder(orderId, owner).map { rows -> rows.map { it.toPending() } })
    }

    /** The signed-in operator's own pending badge — see [observeForOrder]. */
    fun observePendingCount(): Flow<Int> = flow {
        val owner = currentUser.id()
        if (owner == null) emit(0) else emitAll(dao.observePendingCount(owner))
    }

    /**
     * Records the upload and hands scheduling to WorkManager. The prepared photo
     * is moved out of the cache into files/, because the OS may clear the cache
     * while the phone waits for a signal and the photo is the whole point.
     *
     * The row is stamped with the operator signed in at this moment, and that stamp is what
     * decides who may send it later. Nobody signed in means no owner to stamp, so the enqueue
     * fails: a row nobody owns is unsendable, and writing one would only leave the operator
     * believing their delivery proof was queued. The photo is left where the caller put it —
     * nothing is moved before the owner is known.
     *
     * [rowId] lets a caller decide the row's id, which IS the `Idempotency-Key` the worker sends.
     * One caller needs that: an order the operator tried to place online, whose response was lost
     * to the network, and which they then queue. Minting a fresh id there would send a DIFFERENT
     * key for the same submission, and a server that had already committed the first attempt would
     * place a second real order. Everyone else omits it and gets a fresh UUID. Re-enqueuing the
     * same [rowId] replaces the existing row, which is the right answer: it is the same submission.
     */
    override suspend fun enqueue(
        kind: OutboxKind, orderId: String?, shipmentId: String?, paymentId: String?,
        photo: PreparedImage?, payload: JsonObject, rowId: String?,
    ): String {
        val ownerId = currentUser.id()
            ?: error("Сеанс тугаган, қайтадан киринг · No signed-in user to own this upload")
        val id = rowId ?: UUID.randomUUID().toString()
        val stored = photo?.let { moveIntoOutbox(it.file, id) }
        val now = System.currentTimeMillis()
        dao.upsert(
            OutboxEntity(
                id = id, ownerId = ownerId, kind = kind.name, orderId = orderId, shipmentId = shipmentId,
                paymentId = paymentId, filePath = stored?.absolutePath,
                payloadJson = json.encodeToString(JsonObject.serializer(), payload),
                state = OutboxState.QUEUED, attempts = 0, lastError = null,
                createdAt = now, updatedAt = now,
            )
        )
        scheduler.schedule(id)
        return id
    }

    /** Owner-scoped like every other observer here: with nobody signed in there is nothing of
     *  theirs to show. */
    override fun observeFailed(kind: OutboxKind): Flow<List<FailedOutboxRow>> = flow {
        val owner = currentUser.id()
        if (owner == null) {
            emit(emptyList())
        } else {
            emitAll(
                dao.observeFailedOfKind(owner, kind.name).map { rows ->
                    rows.map { r ->
                        // Nothing here suspends, so runCatching cannot swallow a cancellation. An
                        // unparsable payload must still show the row — the operator needs to know
                        // the order was rejected even if this build cannot read what was in it.
                        val body = runCatching { json.decodeFromString(JsonObject.serializer(), r.payloadJson) }
                            .getOrDefault(JsonObject(emptyMap()))
                        FailedOutboxRow(id = r.id, error = r.lastError, payload = body)
                    }
                },
            )
        }
    }

    override suspend fun discard(id: String) = cancel(id)

    suspend fun retry(id: String) {
        dao.markQueued(id, System.currentTimeMillis())
        scheduler.schedule(id)
    }

    /**
     * Delete one queued or failed row, and the photo it was carrying, for good.
     *
     * **Not owner-scoped, and deliberately so.** Every OBSERVER here filters by the signed-in user,
     * so an id only ever reaches this function by way of a list that was already scoped to its
     * owner — the sheet the operator is tapping shows their own rows and nothing else. Scoping the
     * delete too would add a second query to re-check what the first one already established, and
     * would silently do nothing on the one path where it mattered.
     *
     * What this does NOT protect against is an id from somewhere other than one of those observers.
     * There is no such caller today ([discard] and the outbox sheets are all of them); a future one
     * that takes an id from a push, a deep link or a saved-state handle must scope it itself, or
     * this becomes a way to delete another operator's unsent work.
     */
    suspend fun cancel(id: String) {
        dao.byId(id)?.filePath?.let { File(it).delete() }
        dao.delete(id)
    }

    private fun moveIntoOutbox(source: File, id: String): File {
        outboxDir.mkdirs()
        val dest = File(outboxDir, "$id.jpg")
        if (!source.renameTo(dest)) {           // renameTo fails across mount points
            source.copyTo(dest, overwrite = true)
            source.delete()
        }
        return dest
    }

    private fun OutboxEntity.toPending(): PendingUpload {
        // Nothing here suspends, so runCatching cannot swallow a CancellationException. A payload
        // this build cannot parse (a row written by a newer version, a truncated write) must not
        // take the whole flow down: the row is still shown, it just contributes no counts.
        val payload = runCatching { json.decodeFromString(JsonObject.serializer(), payloadJson) }.getOrNull()
        return PendingUpload(
            id = id,
            // A kind this build does not know is UNKNOWN, not a crash. `kind` is stored as a string
            // precisely so a newer version's value needs no migration; valueOf would throw that
            // benefit away from inside a stateIn upstream and take the process with it.
            kind = OutboxKind.from(kind),
            orderId = orderId, shipmentId = shipmentId,
            failed = state == OutboxState.FAILED, attempts = attempts, error = lastError,
            loadedBeams = payload?.get("loadedBeams")?.let { beams ->
                runCatching { beams.jsonObject.mapValues { (_, v) -> v.jsonPrimitive.int } }.getOrNull()
            }.orEmpty(),
            loadedBlocks = payload?.get("loadedBlocks")?.let { runCatching { it.jsonPrimitive.int }.getOrNull() } ?: 0,
        )
    }
}
