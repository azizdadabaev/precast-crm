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

    @Test fun `nextQueued skips rows that are already running or failed`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("running", "o1", OutboxState.RUNNING, created = 1))
        dao.upsert(row("failed", "o1", OutboxState.FAILED, created = 2))
        dao.upsert(row("queued", "o1", OutboxState.QUEUED, created = 3))
        assertEquals("queued", dao.nextQueued()?.id)
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

    @Test fun `wipe clears the outbox along with the order cache`() = runTest {
        val database = db()
        database.outboxDao().upsert(row("a", "o1"))
        database.wipe()
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
