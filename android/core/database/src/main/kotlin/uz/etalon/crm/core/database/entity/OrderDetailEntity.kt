package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "order_details")
data class OrderDetailEntity(@PrimaryKey val id: String, val json: String, val cachedAt: Long)
