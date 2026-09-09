package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The operator's single in-progress quote, keyed by owner exactly as the web's
 * `calculator-draft-<userId>` localStorage key is. Held as one JSON blob because it is only
 * ever read and written whole; nothing queries inside it — a normalised room table would need
 * its own migration every time `SlabRow` grows a field.
 */
@Entity(tableName = "calculator_draft")
data class CalculatorDraftEntity(
    @PrimaryKey val ownerId: String,
    val draftJson: String,
    val updatedAt: Long,
)
