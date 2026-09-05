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
    @Query("SELECT * FROM outbox ORDER BY createdAt, id")
    fun observeAll(): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE orderId = :orderId ORDER BY createdAt, id")
    fun observeForOrder(orderId: String): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun byId(id: String): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state = 'QUEUED' ORDER BY createdAt, id LIMIT 1")
    suspend fun peekQueued(): OutboxEntity?

    @Query("UPDATE outbox SET state = 'RUNNING', updatedAt = :at WHERE id = :id AND state = 'QUEUED'")
    suspend fun claimIfQueued(id: String, at: Long): Int

    /**
     * Atomically claims the single oldest QUEUED row: peeks it, then flips it to
     * RUNNING only if it is still QUEUED. Returns null when another caller
     * claimed it first (or nothing is queued), so the caller can tell it lost
     * the race instead of uploading the same file twice. This is the only way
     * to take a row off the queue — there is no separate peek+markRunning pair
     * to misuse.
     */
    @Transaction
    suspend fun claimNext(at: Long): OutboxEntity? {
        val candidate = peekQueued() ?: return null
        return if (claimIfQueued(candidate.id, at) == 1) candidate.copy(state = OutboxState.RUNNING, updatedAt = at) else null
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

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun countPending(): Int

    @Query("SELECT COUNT(*) FROM outbox")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT filePath FROM outbox WHERE filePath IS NOT NULL")
    suspend fun allFilePaths(): List<String>

    @Query("DELETE FROM outbox")
    suspend fun clearAll()

    /**
     * Sign-out path: the paths must be read before the rows are deleted (or
     * there is nothing left to locate them by), so both happen in one
     * transaction. Deleting the actual files is `:core:data`'s job — the DAO
     * only reports which paths no longer have a row.
     */
    @Transaction
    suspend fun wipeAndReturnPaths(): List<String> {
        val paths = allFilePaths()
        clearAll()
        return paths
    }
}
