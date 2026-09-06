package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** The states an outbox row moves through. Strings, not an enum, so a future
 *  value never needs a Room migration. */
object OutboxState {
    const val QUEUED = "QUEUED"
    const val RUNNING = "RUNNING"
    /** Permanently rejected by the server (a 4xx). The operator must see it and
     *  decide; the worker never retries a FAILED row on its own. */
    const val FAILED = "FAILED"
}

/**
 * One pending upload. `id` doubles as the `Idempotency-Key` sent to the server,
 * so a retry after a dropped connection replays the first response instead of
 * duplicating the delivery proof or the truck photo.
 *
 * `filePath` points at a prepared JPEG in app storage. The file can still be
 * missing (cache eviction, manual clear) by the time the worker runs; callers
 * must check for that rather than assume the path resolves.
 */
@Entity(tableName = "outbox", indices = [Index("orderId"), Index("ownerId"), Index("state", "createdAt")])
data class OutboxEntity(
    @PrimaryKey val id: String,
    /**
     * The user who created this row. It decides who may send it: the worker claims only rows
     * owned by the user whose token it is about to upload under, so one operator's cash figure
     * can never be posted as another's. Non-null by design — a row nobody owns could only be
     * claimed by guessing, so enqueuing without a signed-in user fails instead.
     */
    val ownerId: String,
    /** OutboxKind name — decides which endpoint the worker calls. */
    val kind: String,
    val orderId: String,
    val shipmentId: String? = null,
    val paymentId: String? = null,
    /** Absolute path of the prepared JPEG, moved out of the cache into files/. */
    val filePath: String? = null,
    /** Kind-specific fields as JSON (cash amount, beam map, note flags). */
    val payloadJson: String,
    val state: String,
    val attempts: Int = 0,
    /** Uzbek message from the last failure, shown to the operator verbatim. */
    val lastError: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
)
