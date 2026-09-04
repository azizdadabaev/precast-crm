package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/** One cached row of a list page. `listKey` = the query (e.g. "q=|status=PLACED|day=|page=1")
 *  so different filters never overwrite each other; money stays a string. */
@Entity(tableName = "order_summaries", primaryKeys = ["id", "listKey"], indices = [Index("listKey", "position")])
data class OrderSummaryEntity(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: Long, val placedAt: Long,
    val clientId: String, val clientName: String, val clientPhone: String, val clientAddress: String?,
    val listKey: String, val position: Int, val cachedAt: Long,
)
