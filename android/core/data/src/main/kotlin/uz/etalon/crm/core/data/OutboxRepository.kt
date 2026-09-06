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

/** The seam LogisticsRepository talks to, so its tests need no file system. */
interface OutboxGateway {
    suspend fun enqueue(
        kind: OutboxKind, orderId: String, shipmentId: String? = null,
        photo: PreparedImage? = null, payload: JsonObject = JsonObject(emptyMap()),
    ): String
}

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
     */
    override suspend fun enqueue(
        kind: OutboxKind, orderId: String, shipmentId: String?,
        photo: PreparedImage?, payload: JsonObject,
    ): String {
        val ownerId = currentUser.id()
            ?: error("Сеанс тугаган, қайтадан киринг · No signed-in user to own this upload")
        val id = UUID.randomUUID().toString()
        val stored = photo?.let { moveIntoOutbox(it.file, id) }
        val now = System.currentTimeMillis()
        dao.upsert(
            OutboxEntity(
                id = id, ownerId = ownerId, kind = kind.name, orderId = orderId, shipmentId = shipmentId,
                paymentId = null, filePath = stored?.absolutePath,
                payloadJson = json.encodeToString(JsonObject.serializer(), payload),
                state = OutboxState.QUEUED, attempts = 0, lastError = null,
                createdAt = now, updatedAt = now,
            )
        )
        scheduler.schedule(id)
        return id
    }

    suspend fun retry(id: String) {
        dao.markQueued(id, System.currentTimeMillis())
        scheduler.schedule(id)
    }

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
