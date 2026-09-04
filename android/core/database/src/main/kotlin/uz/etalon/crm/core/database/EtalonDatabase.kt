package uz.etalon.crm.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@Database(entities = [OrderSummaryEntity::class, OrderDetailEntity::class], version = 1, exportSchema = false)
abstract class EtalonDatabase : RoomDatabase() {
    abstract fun ordersDao(): OrdersDao
    /** Called on sign-out so the next user never sees the previous user's cache. */
    suspend fun wipe() { ordersDao().clearAllSummaries(); ordersDao().clearAllDetails() }
}
