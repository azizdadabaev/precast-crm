package uz.etalon.crm.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState

@Dao
interface OutboxDao {
    /** Scoped to one owner: what the operator sees is their own queue. A row of someone else's
     *  that outlived the sign-in purge is not theirs to see, retry or cancel. */
    @Query("SELECT * FROM outbox WHERE orderId = :orderId AND ownerId = :ownerId ORDER BY createdAt, id")
    fun observeForOrder(orderId: String, ownerId: String): Flow<List<OutboxEntity>>

    /**
     * The operator's own rows of one kind that the server permanently rejected. [observeForOrder]
     * cannot show a rejected PLACE_ORDER row — it has no `orderId` to be listed under, and the
     * quote it came from is long gone from the calculator — so this is the query that keeps such a
     * rejection findable instead of silent.
     */
    @Query("SELECT * FROM outbox WHERE ownerId = :ownerId AND kind = :kind AND state = 'FAILED' ORDER BY createdAt, id")
    fun observeFailedOfKind(ownerId: String, kind: String): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun byId(id: String): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state = 'QUEUED' AND ownerId = :ownerId ORDER BY createdAt, id LIMIT 1")
    suspend fun peekQueued(ownerId: String): OutboxEntity?

    @Query("UPDATE outbox SET state = 'RUNNING', updatedAt = :at WHERE id = :id AND state = 'QUEUED' AND ownerId = :ownerId")
    suspend fun claimIfQueued(id: String, ownerId: String, at: Long): Int

    /**
     * Atomically claims [ownerId]'s single oldest QUEUED row: peeks it, then flips it to
     * RUNNING only if it is still QUEUED. Returns null when another caller
     * claimed it first (or nothing is queued), so the caller can tell it lost
     * the race instead of uploading the same file twice. This is the only way
     * to take a row off the queue — there is no separate peek+markRunning pair
     * to misuse.
     *
     * Both halves carry the owner predicate, so another operator's row is not merely skipped —
     * it is never a candidate. That is what makes it impossible for a drain to upload one
     * operator's photo and cash figure under a different operator's token.
     */
    @Transaction
    suspend fun claimNext(ownerId: String, at: Long): OutboxEntity? {
        val candidate = peekQueued(ownerId) ?: return null
        return if (claimIfQueued(candidate.id, ownerId, at) == 1) candidate.copy(state = OutboxState.RUNNING, updatedAt = at) else null
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: OutboxEntity)

    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE outbox SET state = 'QUEUED', updatedAt = :at WHERE id = :id")
    suspend fun markQueued(id: String, at: Long)

    /**
     * Requeues every RUNNING row. Call once when the worker starts: a row left
     * RUNNING means the process died mid-upload, and without this it can never
     * be claimed again — a captured photo silently never sent. Returns the
     * number of rows recovered.
     */
    @Query("UPDATE outbox SET state = 'QUEUED', updatedAt = :at WHERE state = 'RUNNING'")
    suspend fun resetRunning(at: Long): Int

    @Query("UPDATE outbox SET state = 'FAILED', lastError = :error, attempts = attempts + 1, updatedAt = :at WHERE id = :id")
    suspend fun markFailed(id: String, error: String, at: Long)

    /**
     * The operator's own pending badge — see [observeForOrder]. FAILED rows are excluded: they are
     * not on their way anywhere, so counting them would keep the sign-out warning on screen forever
     * over a single rejected row the operator has already been shown on the order.
     */
    @Query("SELECT COUNT(*) FROM outbox WHERE ownerId = :ownerId AND state != 'FAILED'")
    fun observePendingCount(ownerId: String): Flow<Int>

    @Query("SELECT filePath FROM outbox WHERE ownerId != :ownerId AND filePath IS NOT NULL")
    suspend fun filePathsOwnedByOthers(ownerId: String): List<String>

    @Query("DELETE FROM outbox WHERE ownerId != :ownerId")
    suspend fun deleteOwnedByOthers(ownerId: String)

    /**
     * Sign-in path: everything queued by anyone other than [ownerId] goes, whatever its state —
     * the operator signing in must never be able to send it. The paths must be read before the
     * rows are deleted (or there is nothing left to locate them by), so both happen in one
     * transaction. Deleting the actual files is `:core:data`'s job — the DAO only reports which
     * paths no longer have a row.
     */
    @Transaction
    suspend fun purgeOwnedByOthers(ownerId: String): List<String> {
        val paths = filePathsOwnedByOthers(ownerId)
        deleteOwnedByOthers(ownerId)
        return paths
    }
}
