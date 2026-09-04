package uz.etalon.crm.core.database.dao

import androidx.room.*
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@Dao
interface OrdersDao {
    @Query("SELECT * FROM order_summaries WHERE listKey = :listKey ORDER BY position") fun observeList(listKey: String): Flow<List<OrderSummaryEntity>>
    @Query("DELETE FROM order_summaries WHERE listKey = :listKey") suspend fun clearList(listKey: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(rows: List<OrderSummaryEntity>)
    @Transaction suspend fun replaceList(listKey: String, rows: List<OrderSummaryEntity>) { clearList(listKey); insertAll(rows) }
    @Query("SELECT * FROM order_details WHERE id = :id") fun observeDetail(id: String): Flow<OrderDetailEntity?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertDetail(row: OrderDetailEntity)
    @Query("DELETE FROM order_summaries WHERE id = :id") suspend fun deleteSummaries(id: String)
    @Query("DELETE FROM order_details WHERE id = :id") suspend fun deleteDetail(id: String)
    @Transaction suspend fun deleteOrder(id: String) { deleteSummaries(id); deleteDetail(id) }
    @Query("DELETE FROM order_summaries") suspend fun clearAllSummaries()
    @Query("DELETE FROM order_details") suspend fun clearAllDetails()
}
