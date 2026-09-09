package uz.etalon.crm.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity

@Dao
interface CalculatorDraftDao {
    /** Null when this operator has never saved a draft, or already cleared it. */
    @Query("SELECT * FROM calculator_draft WHERE ownerId = :ownerId")
    fun observe(ownerId: String): Flow<CalculatorDraftEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: CalculatorDraftEntity)

    @Query("DELETE FROM calculator_draft WHERE ownerId = :ownerId")
    suspend fun deleteFor(ownerId: String)
}
