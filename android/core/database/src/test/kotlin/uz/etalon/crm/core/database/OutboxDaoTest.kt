package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OutboxDaoTest {

    private fun db() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun row(
        id: String, orderId: String, state: String = OutboxState.QUEUED, created: Long = 0,
        owner: String = "u1",
    ) = OutboxEntity(
        id = id, ownerId = owner, kind = "LOAD_TRUCK", orderId = orderId, shipmentId = null, paymentId = null,
        filePath = "/data/outbox/$id.jpg", payloadJson = "{}", state = state,
        attempts = 0, lastError = null, createdAt = created, updatedAt = created,
    )

    @Test fun `observeForOrder returns only that order's rows, oldest first`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("b", "o1", created = 2))
        dao.upsert(row("a", "o1", created = 1))
        dao.upsert(row("c", "o2", created = 3))
        dao.observeForOrder("o1").test {
            assertEquals(listOf("a", "b"), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `observeForOrder breaks ties on id when createdAt matches`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("b", "o1", created = 5))
        dao.upsert(row("a", "o1", created = 5))
        dao.observeForOrder("o1").test {
            assertEquals(listOf("a", "b"), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `claimNext skips rows that are already running or failed`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("running", "o1", OutboxState.RUNNING, created = 1))
        dao.upsert(row("failed", "o1", OutboxState.FAILED, created = 2))
        dao.upsert(row("queued", "o1", OutboxState.QUEUED, created = 3))
        val claimed = dao.claimNext(ownerId = "u1", at = 10)
        assertEquals("queued", claimed?.id)
        assertEquals(OutboxState.RUNNING, claimed?.state)
        assertEquals(OutboxState.RUNNING, dao.byId("queued")?.state)
    }

    @Test fun `claimNext is an atomic claim - a second claim on a single-row queue returns null`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1"))
        val first = dao.claimNext(ownerId = "u1", at = 1)
        val second = dao.claimNext(ownerId = "u1", at = 2)
        assertEquals("a", first?.id)
        assertNull(second)
        // The row is RUNNING, not lost or duplicated.
        assertEquals(OutboxState.RUNNING, dao.byId("a")?.state)
    }

    /** Another operator's row is unreachable, and it is the query that makes it so — the oldest
     *  QUEUED row here belongs to someone else and is invisible, not skipped after the fact. */
    @Test fun `claimNext never takes a row owned by another operator`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("theirs", "o1", created = 1, owner = "u2"))

        assertNull(dao.claimNext(ownerId = "u1", at = 10))
        assertEquals(OutboxState.QUEUED, dao.byId("theirs")?.state)
        assertEquals("theirs", dao.claimNext(ownerId = "u2", at = 11)?.id)
    }

    @Test fun `claimNext takes the caller's oldest row, past an older row of another operator`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("theirs", "o1", created = 1, owner = "u2"))
        dao.upsert(row("mine", "o2", created = 2, owner = "u1"))

        assertEquals("mine", dao.claimNext(ownerId = "u1", at = 10)?.id)
        assertEquals(OutboxState.QUEUED, dao.byId("theirs")?.state)
    }

    @Test fun `resetRunning requeues a row a killed process left running`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1", OutboxState.RUNNING, created = 1))
        val recovered = dao.resetRunning(at = 50)
        assertEquals(1, recovered)
        val after = dao.byId("a")!!
        assertEquals(OutboxState.QUEUED, after.state)
        assertEquals(50, after.updatedAt)
        // The recovered row is claimable again — it was not stranded.
        assertEquals("a", dao.claimNext(ownerId = "u1", at = 51)?.id)
    }

    @Test fun `markFailed records the message and bumps the attempt count`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1"))
        dao.markFailed("a", "Интернет йўқ", 99)
        val after = dao.byId("a")!!
        assertEquals(OutboxState.FAILED, after.state)
        assertEquals("Интернет йўқ", after.lastError)
        assertEquals(1, after.attempts)
        assertEquals(99, after.updatedAt)
    }

    /** The sign-in purge is keyed on ownership, so it takes every other operator's rows —
     *  whatever their state — and leaves the signing-in operator's own untouched. */
    @Test fun `the purge drops other owners' rows in any state and reports their files`() = runTest {
        val database = db()
        val dao = database.outboxDao()
        dao.upsert(row("theirs-queued", "o1", created = 1, owner = "u2"))
        dao.upsert(row("theirs-failed", "o1", OutboxState.FAILED, created = 2, owner = "u2"))
        dao.upsert(row("mine", "o2", created = 3, owner = "u1"))

        val dropped = database.purgeOutboxOwnedByOthers("u1")

        assertEquals(
            listOf("/data/outbox/theirs-failed.jpg", "/data/outbox/theirs-queued.jpg"),
            dropped.sorted(),
        )
        assertNull(dao.byId("theirs-queued"))
        assertNull(dao.byId("theirs-failed"))
        assertNotNull(dao.byId("mine"))
    }

    /** Sign-out drops the order cache, never the outbox — a queued photo belongs to the operator
     *  who took it and waits for them to come back. */
    @Test fun `clearing the order cache leaves the outbox untouched`() = runTest {
        val database = db()
        database.outboxDao().upsert(row("a", "o1"))

        database.clearOrderCache()

        assertNotNull(database.outboxDao().byId("a"))
        assertEquals(1, database.outboxDao().countPending())
    }

    @Test fun `delete removes a single row`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1")); dao.upsert(row("b", "o1"))
        dao.delete("a")
        assertNull(dao.byId("a"))
        assertEquals(1, dao.countPending())
    }
}
