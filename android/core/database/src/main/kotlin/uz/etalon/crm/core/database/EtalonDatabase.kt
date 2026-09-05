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
     */
    suspend fun wipe() {
        ordersDao().clearAllSummaries()
        ordersDao().clearAllDetails()
        outboxDao().clearAll()
    }
}
