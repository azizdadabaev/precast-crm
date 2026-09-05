package uz.etalon.crm.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.OutboxEntity

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY createdAt")
    fun observeAll(): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE orderId = :orderId ORDER BY createdAt")
    fun observeForOrder(orderId: String): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun byId(id: String): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state = 'QUEUED' ORDER BY createdAt LIMIT 1")
    suspend fun nextQueued(): OutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: OutboxEntity)

    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE outbox SET state = 'RUNNING', updatedAt = :at WHERE id = :id")
    suspend fun markRunning(id: String, at: Long)

    @Query("UPDATE outbox SET state = 'QUEUED', updatedAt = :at WHERE id = :id")
    suspend fun markQueued(id: String, at: Long)

    @Query("UPDATE outbox SET state = 'FAILED', lastError = :error, attempts = attempts + 1, updatedAt = :at WHERE id = :id")
    suspend fun markFailed(id: String, error: String, at: Long)

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun countPending(): Int

    @Query("SELECT COUNT(*) FROM outbox")
    fun observePendingCount(): Flow<Int>

    @Query("DELETE FROM outbox")
    suspend fun clearAll()
}
