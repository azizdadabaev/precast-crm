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
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class CalculatorDraftDaoTest {

    private fun db() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun row(owner: String, json: String, at: Long) =
        CalculatorDraftEntity(ownerId = owner, draftJson = json, updatedAt = at)

    @Test fun `observe emits null when nothing is saved for that owner`() = runTest {
        val dao = db().calculatorDraftDao()
        dao.observe("u1").test { assertNull(awaitItem()); cancelAndIgnoreRemainingEvents() }
    }

    /** One row per owner — a second upsert replaces the first rather than adding a second row,
     *  the same rule `OutboxDao.upsert`'s `REPLACE` conflict strategy documents elsewhere. */
    @Test fun `upsert replaces the single row for an owner`() = runTest {
        val dao = db().calculatorDraftDao()
        dao.upsert(row("u1", """{"seq":1}""", 1))
        dao.upsert(row("u1", """{"seq":2}""", 2))
        dao.observe("u1").test {
            assertEquals("""{"seq":2}""", awaitItem()?.draftJson)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** The draft is owner-stamped — one operator's in-progress quote must never surface for
     *  another operator signed in on the same phone. */
    @Test fun `each owner's draft is separate`() = runTest {
        val dao = db().calculatorDraftDao()
        dao.upsert(row("u1", """{"who":1}""", 1))
        dao.upsert(row("u2", """{"who":2}""", 1))
        dao.observe("u1").test { assertEquals("""{"who":1}""", awaitItem()?.draftJson); cancelAndIgnoreRemainingEvents() }
        dao.observe("u2").test { assertEquals("""{"who":2}""", awaitItem()?.draftJson); cancelAndIgnoreRemainingEvents() }
    }

    @Test fun `deleteFor removes only that owner's draft`() = runTest {
        val dao = db().calculatorDraftDao()
        dao.upsert(row("u1", "{}", 1))
        dao.upsert(row("u2", "{}", 1))
        dao.deleteFor("u1")
        dao.observe("u1").test { assertNull(awaitItem()); cancelAndIgnoreRemainingEvents() }
        dao.observe("u2").test { assertEquals("{}", awaitItem()?.draftJson); cancelAndIgnoreRemainingEvents() }
    }
}
