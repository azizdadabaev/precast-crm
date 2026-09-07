package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
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
 *  (claimNext/resetRunning/purgeOwnedByOthers — not the nextQueued/markRunning
 *  pair an earlier draft of this DAO had) so this fake cannot drift from what
 *  the production interface actually declares. */
private class FakeOutboxDao : OutboxDao {
    val rows = MutableStateFlow<Map<String, OutboxEntity>>(emptyMap())
    override fun observeForOrder(orderId: String, ownerId: String) =
        rows.map { m -> m.values.filter { it.orderId == orderId && it.ownerId == ownerId }.sortedBy { it.createdAt } }
    override suspend fun byId(id: String) = rows.value[id]
    override suspend fun peekQueued(ownerId: String) =
        rows.value.values.filter { it.state == OutboxState.QUEUED && it.ownerId == ownerId }.minByOrNull { it.createdAt }
    override suspend fun claimIfQueued(id: String, ownerId: String, at: Long): Int {
        val row = rows.value[id] ?: return 0
        if (row.state != OutboxState.QUEUED || row.ownerId != ownerId) return 0
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
    override fun observePendingCount(ownerId: String): Flow<Int> = rows.map { m -> m.values.count { it.ownerId == ownerId && it.state != OutboxState.FAILED } }
    override suspend fun filePathsOwnedByOthers(ownerId: String): List<String> =
        rows.value.values.filter { it.ownerId != ownerId }.mapNotNull { it.filePath }
    override suspend fun deleteOwnedByOthers(ownerId: String) {
        rows.value = rows.value.filterValues { it.ownerId == ownerId }
    }
    private inline fun patch(id: String, f: (OutboxEntity) -> OutboxEntity) {
        rows.value[id]?.let { rows.value = rows.value + (id to f(it)) }
    }
}

private class RecordingScheduler : OutboxScheduler {
    val scheduled = mutableListOf<String>()
    override fun schedule(id: String) { scheduled += id }
}

/** The signed-in operator, swappable mid-test to stand in for a sign-out. */
private class FakeCurrentUser(var userId: String? = "u1") : CurrentUser {
    override suspend fun id(): String? = userId
}

/** Wraps a real DAO to pin down the exact moment enqueue()'s `dao.upsert` has written the row
 *  but not yet returned — the same window a sign-out landing mid-enqueue depends on. Mirrors
 *  `SessionSignOutOrderTest`'s `GatedOrdersDao`: a suspend DAO call genuinely redispatches, so
 *  this is exercised with real suspension, not a hand-simulated ordering. */
private class GatingOutboxDao(
    private val real: OutboxDao,
    private val reachedUpsert: CompletableDeferred<Unit>,
    private val releaseUpsert: CompletableDeferred<Unit>,
) : OutboxDao by real {
    override suspend fun upsert(row: OutboxEntity) {
        real.upsert(row)
        reachedUpsert.complete(Unit)
        releaseUpsert.await()
    }
}

class OutboxRepositoryTest {

    private fun repo(
        dao: OutboxDao, scheduler: OutboxScheduler, dir: File,
        currentUser: CurrentUser = FakeCurrentUser(),
    ) = OutboxRepository(dao, scheduler, dir, kotlinx.serialization.json.Json, currentUser)

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

    /** The row carries the operator who took the photo, so only that operator's token can ever
     *  send it — the cash figure on a delivery proof must never be posted as someone else. */
    @Test fun `enqueue stamps the signed-in operator as the row's owner`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox"), FakeCurrentUser("driver-7"))
            .enqueue(OutboxKind.DELIVERY_PROOF, "o1")

        assertEquals("driver-7", dao.byId(id)!!.ownerId)
    }

    /** An unowned row could only ever be claimed by guessing whose it is. Failing the enqueue is
     *  the honest outcome: the screen shows the operator the Uzbek message and nothing is queued. */
    @Test fun `enqueue fails rather than writing a row nobody owns`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val outboxDir = File(tmp, "outbox")
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(8)) }
        val dao = FakeOutboxDao(); val scheduler = RecordingScheduler()

        val thrown = runCatching {
            repo(dao, scheduler, outboxDir, FakeCurrentUser(null))
                .enqueue(OutboxKind.LOAD_TRUCK, "o1", photo = PreparedImage(photo, 1, 1, photo.length()))
        }.exceptionOrNull()

        assertNotNull(thrown, "enqueue must fail, not silently succeed, with nobody signed in")
        assertTrue(thrown!!.message!!.any { it in 'А'..'я' }, "the operator-facing half of the message must be Uzbek Cyrillic")
        assertTrue(dao.rows.value.isEmpty(), "no row may be written without an owner")
        assertTrue(outboxDir.listFiles().orEmpty().isEmpty(), "no file may be left behind")
        assertTrue(scheduler.scheduled.isEmpty(), "nothing may be scheduled")
    }

    @Test fun `the row id is a usable idempotency key`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox")).enqueue(OutboxKind.ADD_LOADED_PHOTO, "o1")
        assertTrue(id.isNotBlank())
        assertTrue(id.length <= 128, "must fit the server's 128-character cap")
    }

    /** A payment-receipt row is claimed by the payment it belongs to, not the shipment column —
     *  the worker resolves `POST /api/payments/{paymentId}/receipts` from this field. */
    @Test fun `enqueue stamps the payment id when one is given`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
            .enqueue(OutboxKind.ADD_PAYMENT_RECEIPT, "o1", paymentId = "p1")

        assertEquals("p1", dao.byId(id)!!.paymentId)
    }

    @Test fun `payload survives the round trip`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val payload = JsonObject(mapOf("cashAmount" to JsonPrimitive("1500000"), "driverReturned" to JsonPrimitive(true)))
        val id = repo(dao, RecordingScheduler(), File(tmp, "outbox")).enqueue(OutboxKind.DELIVERY_PROOF, "o1", payload = payload)
        assertTrue(dao.byId(id)!!.payloadJson.contains("1500000"))
    }

    /** The link between what was queued and what the next truck is allowed to take: the load
     *  screen's allowance subtracts these counts, and without them it offers the whole order and
     *  earns a permanent 422 when the queue drains. */
    @Test fun `a queued shipment load reports the beams and blocks it took`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        r.enqueue(
            OutboxKind.LOAD_SHIPMENT, "o1", shipmentId = "s1",
            payload = JsonObject(mapOf(
                "loadedBeams" to JsonObject(mapOf("4.30" to JsonPrimitive(4))),
                "loadedBlocks" to JsonPrimitive(50),
            )),
        )
        r.observeForOrder("o1").test {
            val item = awaitItem().single()
            assertEquals(mapOf("4.30" to 4), item.loadedBeams)
            assertEquals(50, item.loadedBlocks)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** Every other kind carries no counts, so nothing it queued may shrink a truck's allowance. */
    @Test fun `a queued row of another kind reports no counts`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        r.enqueue(OutboxKind.DELIVERY_PROOF, "o1", payload = JsonObject(mapOf("cashAmount" to JsonPrimitive("100"))))
        r.observeForOrder("o1").test {
            val item = awaitItem().single()
            assertTrue(item.loadedBeams.isEmpty())
            assertEquals(0, item.loadedBlocks)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * `kind` is a string in the table precisely so a future value needs no schema migration.
     * `valueOf` threw that away: a row written by a newer build would take down the flow — and with
     * it the process — from inside a `stateIn` upstream, where nothing can catch it.
     */
    @Test fun `a kind this build does not know reads back as UNKNOWN instead of crashing`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        val id = r.enqueue(OutboxKind.LOAD_TRUCK, "o1")
        dao.upsert(dao.byId(id)!!.copy(kind = "COLLECT_SIGNATURE"))
        r.observeForOrder("o1").test {
            assertEquals(OutboxKind.UNKNOWN, awaitItem().single().kind)
            cancelAndIgnoreRemainingEvents()
        }
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

    /** The badge and the per-order list are the operator's own queue: another operator's row —
     *  one that outlived the sign-in purge by landing in flight — is not theirs to see, retry or
     *  cancel. With nobody signed in there is nothing to show at all. */
    @Test fun `what the operator observes is only their own queue`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val dao = FakeOutboxDao()
        val mine = repo(dao, RecordingScheduler(), File(tmp, "outbox"), FakeCurrentUser("u1"))
        val id = mine.enqueue(OutboxKind.LOAD_TRUCK, "o1")
        dao.upsert(dao.byId(id)!!.copy(id = "theirs", ownerId = "u2"))

        mine.observeForOrder("o1").test {
            assertEquals(listOf(id), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
        mine.observePendingCount().test {
            assertEquals(1, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
        repo(dao, RecordingScheduler(), File(tmp, "outbox"), FakeCurrentUser(null)).observePendingCount().test {
            assertEquals(0, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * The reachable case this pins down: operator A's token expires, a background refresh 401s
     * and `MainViewModel` calls `signOut()` in the same milliseconds A taps save on the
     * delivery-proof screen. The row is stamped with A before the session ends, so it survives
     * — losing it would be exactly the routine data loss ownership exists to prevent — and
     * ownership, not the session, is what keeps it out of anyone else's drain.
     */
    @Test fun `a row enqueued as sign-out lands stays with the operator who made it`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val outboxDir = File(tmp, "outbox")
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(8)) }
        val realDao = FakeOutboxDao()
        val reachedUpsert = CompletableDeferred<Unit>()
        val releaseUpsert = CompletableDeferred<Unit>()
        val user = FakeCurrentUser("u1")
        val r = repo(GatingOutboxDao(realDao, reachedUpsert, releaseUpsert), RecordingScheduler(), outboxDir, user)

        val job = launch { r.enqueue(OutboxKind.LOAD_TRUCK, "o1", photo = PreparedImage(photo, 1, 1, photo.length())) }
        reachedUpsert.await() // the row is written; enqueue is paused right there
        user.userId = null    // the sign-out equivalent
        releaseUpsert.complete(Unit)
        job.join()

        val row = realDao.rows.value.values.single()
        assertEquals("u1", row.ownerId)
        assertTrue(File(row.filePath!!).exists(), "the photo must not be thrown away")
        assertNull(realDao.claimNext(ownerId = "u2", at = 1), "and nobody else may ever send it")
    }
}
