package uz.etalon.crm.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.database.entity.OutboxEntity

@Database(
    entities = [OrderSummaryEntity::class, OrderDetailEntity::class, OutboxEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class EtalonDatabase : RoomDatabase() {
    abstract fun ordersDao(): OrdersDao
    abstract fun outboxDao(): OutboxDao

    /**
     * Called on sign-out so the next user never sees the previous user's cache.
     * The outbox goes with it: a queued photo belongs to the session that took
     * it, and uploading it under a different token would misattribute the work.
     *
     * Returns the file paths the dropped outbox rows pointed at, so the caller
     * (`:core:data`) can delete the actual JPEGs — the DAO only owns the table,
     * not the files on disk.
     */
    suspend fun wipe(): List<String> {
        ordersDao().clearAllSummaries()
        ordersDao().clearAllDetails()
        return outboxDao().wipeAndReturnPaths()
    }
}
