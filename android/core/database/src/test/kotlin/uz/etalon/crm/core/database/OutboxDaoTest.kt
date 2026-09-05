package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
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

    private fun row(id: String, orderId: String, state: String = OutboxState.QUEUED, created: Long = 0) =
        OutboxEntity(
            id = id, kind = "LOAD_TRUCK", orderId = orderId, shipmentId = null, paymentId = null,
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
        val claimed = dao.claimNext(at = 10)
        assertEquals("queued", claimed?.id)
        assertEquals(OutboxState.RUNNING, claimed?.state)
        assertEquals(OutboxState.RUNNING, dao.byId("queued")?.state)
    }

    @Test fun `claimNext is an atomic claim - a second claim on a single-row queue returns null`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1"))
        val first = dao.claimNext(at = 1)
        val second = dao.claimNext(at = 2)
        assertEquals("a", first?.id)
        assertNull(second)
        // The row is RUNNING, not lost or duplicated.
        assertEquals(OutboxState.RUNNING, dao.byId("a")?.state)
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
        assertEquals("a", dao.claimNext(at = 51)?.id)
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

    @Test fun `wipe clears the outbox along with the order cache, and returns the dropped file paths`() = runTest {
        val database = db()
        database.outboxDao().upsert(row("a", "o1"))
        val dropped = database.wipe()
        assertEquals(listOf("/data/outbox/a.jpg"), dropped)
        assertNull(database.outboxDao().byId("a"))
        assertEquals(0, database.outboxDao().countPending())
    }

    @Test fun `delete removes a single row`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1")); dao.upsert(row("b", "o1"))
        dao.delete("a")
        assertNull(dao.byId("a"))
        assertEquals(1, dao.countPending())
    }
}
