package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OutboxKind
import java.io.File

/** An in-memory stand-in for the real Room DAO, matching its actual surface
 *  (claimNext/resetRunning/wipeAndReturnPaths — not the nextQueued/markRunning
 *  pair an earlier draft of this DAO had) so this fake cannot drift from what
 *  the production interface actually declares. */
private class FakeOutboxDao : OutboxDao {
    val rows = MutableStateFlow<Map<String, OutboxEntity>>(emptyMap())
    override fun observeAll(): Flow<List<OutboxEntity>> = rows.map { it.values.sortedBy { r -> r.createdAt } }
    override fun observeForOrder(orderId: String) = rows.map { m -> m.values.filter { it.orderId == orderId }.sortedBy { it.createdAt } }
    override suspend fun byId(id: String) = rows.value[id]
    override suspend fun peekQueued() = rows.value.values.filter { it.state == OutboxState.QUEUED }.minByOrNull { it.createdAt }
    override suspend fun claimIfQueued(id: String, at: Long): Int {
        val row = rows.value[id] ?: return 0
        if (row.state != OutboxState.QUEUED) return 0
        rows.value = rows.value + (id to row.copy(state = OutboxState.RUNNING, updatedAt = at))
        return 1
    }
    override suspend fun upsert(row: OutboxEntity) { rows.value = rows.value + (row.id to row) }
    override suspend fun delete(id: String) { rows.value = rows.value - id }
    override suspend fun markQueued(id: String, at: Long) { patch(id) { it.copy(state = OutboxState.QUEUED, updatedAt = at) } }
    override suspend fun resetRunning(at: Long): Int {
        val running = rows.value.values.filter { it.state == OutboxState.RUNNING }
        rows.value = rows.value + running.associate { it.id to it.copy(state = OutboxState.QUEUED, updatedAt = at) }
        return running.size
    }
    override suspend fun markFailed(id: String, error: String, at: Long) {
        patch(id) { it.copy(state = OutboxState.FAILED, lastError = error, attempts = it.attempts + 1, updatedAt = at) }
    }
    override suspend fun countPending() = rows.value.size
    override fun observePendingCount(): Flow<Int> = rows.map { it.size }
    override suspend fun allFilePaths(): List<String> = rows.value.values.mapNotNull { it.filePath }
    override suspend fun clearAll() { rows.value = emptyMap() }
    private inline fun patch(id: String, f: (OutboxEntity) -> OutboxEntity) {
        rows.value[id]?.let { rows.value = rows.value + (id to f(it)) }
    }
}

private class RecordingScheduler : OutboxScheduler {
    val scheduled = mutableListOf<String>()
    override fun schedule(id: String) { scheduled += id }
}

class OutboxRepositoryTest {

    private fun repo(dao: OutboxDao, scheduler: OutboxScheduler, dir: File) =
        OutboxRepository(dao, scheduler, dir, kotlinx.serialization.json.Json)

    @Test fun `enqueue moves the photo out of the cache and schedules the upload`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val outboxDir = File(tmp, "files/outbox")
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(16) { 7 }) }
        val dao = FakeOutboxDao(); val scheduler = RecordingScheduler()

        val id = repo(dao, scheduler, outboxDir).enqueue(
            kind = OutboxKind.LOAD_TRUCK, orderId = "o1",
            photo = PreparedImage(photo, 1280, 853, photo.length()),
        )

        val row = dao.byId(id)!!
        assertEquals(OutboxKind.LOAD_TRUCK.name, row.kind)
        assertEquals("o1", row.orderId)
        assertEquals(OutboxState.QUEUED, row.state)
        assertFalse(photo.exists(), "the cache copy must be moved, not left behind")
        assertTrue(row.filePath!!.startsWith(outboxDir.absolutePath), "the file must live under files/, which the OS will not evict")
        assertEquals(16, File(row.filePath!!).length())
        assertEquals(listOf(id), scheduler.scheduled)
    }

    @Test fun `the row id is a usable idempotency key`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox")).enqueue(OutboxKind.ADD_LOADED_PHOTO, "o1")
        assertTrue(id.isNotBlank())
        assertTrue(id.length <= 128, "must fit the server's 128-character cap")
    }

    @Test fun `payload survives the round trip`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val payload = JsonObject(mapOf("cashAmount" to JsonPrimitive("1500000"), "driverReturned" to JsonPrimitive(true)))
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox")).enqueue(OutboxKind.DELIVERY_PROOF, "o1", payload = payload)
        assertTrue(dao.byId(id)!!.payloadJson.contains("1500000"))
    }

    @Test fun `retry moves a failed row back to queued and reschedules it`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao(); val scheduler = RecordingScheduler()
        val r = repo(dao, scheduler, File(tmp, "outbox"))
        val id = r.enqueue(OutboxKind.LOAD_TRUCK, "o1")
        dao.markFailed(id, "Интернет йўқ", 1)
        scheduler.scheduled.clear()

        r.retry(id)

        assertEquals(OutboxState.QUEUED, dao.byId(id)!!.state)
        assertEquals(listOf(id), scheduler.scheduled)
    }

    @Test fun `cancel deletes the row and its file`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(4)) }
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        val id = r.enqueue(OutboxKind.LOAD_TRUCK, "o1", photo = PreparedImage(photo, 1, 1, 4))
        val stored = File(dao.byId(id)!!.filePath!!)

        r.cancel(id)

        assertNull(dao.byId(id))
        assertFalse(stored.exists())
    }

    @Test fun `observeForOrder maps rows to the UI model with the failure flag`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        val id = r.enqueue(OutboxKind.DELIVERY_PROOF, "o1")
        dao.markFailed(id, "Рухсат йўқ", 5)
        r.observeForOrder("o1").test {
            val item = awaitItem().single()
            assertEquals(OutboxKind.DELIVERY_PROOF, item.kind)
            assertTrue(item.failed)
            assertEquals("Рухсат йўқ", item.error)
            assertEquals(1, item.attempts)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
