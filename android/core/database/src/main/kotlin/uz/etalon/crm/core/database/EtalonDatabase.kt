package uz.etalon.crm.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.database.entity.OutboxEntity

@Database(
    entities = [OrderSummaryEntity::class, OrderDetailEntity::class, OutboxEntity::class, CalculatorDraftEntity::class],
    version = 7,
    exportSchema = true,
)
abstract class EtalonDatabase : RoomDatabase() {
    abstract fun ordersDao(): OrdersDao
    abstract fun outboxDao(): OutboxDao
    abstract fun calculatorDraftDao(): CalculatorDraftDao

    /**
     * Called on sign-out so the next user never sees the previous user's cache.
     * The outbox deliberately does NOT go with it: a queued upload belongs to the operator who
     * made it (`OutboxEntity.ownerId`), and the routine reason a session ends is their own token
     * expiring — destroying the row here would throw away a delivery proof they are about to
     * come back and send. [purgeOutboxOwnedByOthers] is what keeps it out of anyone else's hands.
     */
    suspend fun clearOrderCache() {
        ordersDao().clearAllSummaries()
        ordersDao().clearAllDetails()
    }

    /**
     * Called on sign-in, before the new session has a token: drops every outbox row queued by
     * anyone other than [ownerId], so a different operator's photo and cash figure can never be
     * uploaded under this one's credentials.
     *
     * Returns the file paths the dropped rows pointed at, so the caller (`:core:data`) can delete
     * the actual JPEGs — the DAO only owns the table, not the files on disk.
     */
    suspend fun purgeOutboxOwnedByOthers(ownerId: String): List<String> =
        outboxDao().purgeOwnedByOthers(ownerId)
}
