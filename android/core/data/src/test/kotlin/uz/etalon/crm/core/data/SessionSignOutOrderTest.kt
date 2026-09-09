package uz.etalon.crm.core.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.room.InvalidationTracker
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.datastore.InMemoryTokenStore
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*
import uz.etalon.crm.core.testing.FakeEtalonApi
import java.io.File
import java.util.concurrent.Executor

/** A no-op DataStore backing a real SessionPrefs without touching disk. */
private class FakeDataStore : DataStore<Preferences> {
    private val state = MutableStateFlow<Preferences>(emptyPreferences())
    override val data: Flow<Preferences> = state
    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        val updated = transform(state.value)
        state.value = updated
        return updated
    }
}

/** signOut() never calls the API; every call is unreachable and fails the test by name via
 *  [uz.etalon.crm.core.testing.FakeEtalonApi]. [loginResponse], when set, lets the sign-in-wipe
 *  test drive a real `login()` success without a second near-duplicate fake. */
private class UnusedApi(
    private val gate: CompletableDeferred<Unit>? = null,
    private val page: OrdersPageDto = OrdersPageDto(emptyList(), 0, 1, 20, 0),
    private val loginResponse: LoginResponse? = null,
) : FakeEtalonApi() {
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto {
        gate?.await()
        return this.page
    }
    override suspend fun login(body: LoginRequest) = loginResponse ?: error("unused")
}

/** Wraps the real, Room-generated DAO to pin down the exact moment signOut()'s db.clearOrderCache() has
 *  cleared `order_summaries` but has not yet returned — the same window the production race
 *  (wipe() landing before the epoch bump) depends on. Room's suspend DAO calls genuinely
 *  redispatch, so this is exercised with real suspension, not a hand-simulated ordering. */
private class GatedOrdersDao(
    private val real: OrdersDao,
    private val reachedWipe: CompletableDeferred<Unit>,
    private val releaseWipe: CompletableDeferred<Unit>,
) : OrdersDao by real {
    override suspend fun clearAllSummaries() {
        real.clearAllSummaries()
        reachedWipe.complete(Unit)
        releaseWipe.await()
    }
}

/** Runs entirely on the calling thread so the test's coroutine scheduler stays in full control —
 *  no real background thread races against the virtual scheduler. */
private object DirectExecutor : Executor {
    override fun execute(command: Runnable) = command.run()
}

private class SchedulerSpy : OutboxScheduler {
    val scheduled = mutableListOf<String>()
    override fun schedule(id: String) { scheduled += id }
}

/** Reports the exact moment `login()` stores the new session's token — the first moment an
 *  authenticated request, or a drain, could run under it. Whatever the outbox holds by then is
 *  what the new operator's token could reach. */
private class ProbingTokenStore(private val onSet: suspend () -> Unit) : TokenStore {
    private val delegate = InMemoryTokenStore()
    override suspend fun get() = delegate.get()
    override suspend fun set(token: String) { onSet(); delegate.set(token) }
    override suspend fun clear() = delegate.clear()
    override val isLoggedIn: Flow<Boolean> get() = delegate.isLoggedIn
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SessionSignOutOrderTest {
    private val summary = OrderSummaryDto(
        "o1", "2026-09-0041", "PLACED", "AWAITING_PAYMENT", "1.00", "0", "1.000", 1, 1,
        "2026-09-04T00:00:00Z", "2026-09-01T00:00:00Z", ClientDto("c", "A", "998901112233", null),
    )

    private fun realDatabase(): EtalonDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java,
    ).setQueryExecutor(DirectExecutor).setTransactionExecutor(DirectExecutor).build()

    /** `outboxDao()` delegates to a genuinely Room-built in-memory database (unlike the gated
     *  `ordersDao()` above) — the outbox purge is a real `@Transaction` DAO method and needs a
     *  real underlying connection to run against; this test does not exercise outbox behavior. */
    private fun fakeSessionDatabase(dao: OrdersDao): EtalonDatabase {
        val real = realDatabase()
        return object : EtalonDatabase() {
            override fun ordersDao(): OrdersDao = dao
            override fun outboxDao(): OutboxDao = real.outboxDao()
            override fun calculatorDraftDao(): CalculatorDraftDao = real.calculatorDraftDao()
            override fun clearAllTables() { /* unused: wipe() never calls this */ }
            override fun createInvalidationTracker(): InvalidationTracker = InvalidationTracker(this)
        }
    }

    /**
     * The 1a final review found that signOut() wiped Room before bumping the OrdersRepository
     * epoch. An in-flight refresh can slip its write into the gap: it resumes after the wipe has
     * cleared `order_summaries` but before the epoch bump would have made its own guard reject
     * the write, resurrecting the previous user's rows in the table signOut() just emptied.
     */
    @Test fun `an in-flight refresh cannot resurrect rows after signOut wipes the database`() = runTest {
        val realDao = realDatabase().ordersDao()
        val reachedWipe = CompletableDeferred<Unit>()
        val releaseWipe = CompletableDeferred<Unit>()
        val db = fakeSessionDatabase(GatedOrdersDao(realDao, reachedWipe, releaseWipe))

        val apiGate = CompletableDeferred<Unit>()
        val api = UnusedApi(apiGate, OrdersPageDto(listOf(summary), 1, 1, 20, 1))
        val orders = OrdersRepository(api, realDao, Json { ignoreUnknownKeys = true }, "https://x")
        val session = SessionRepository(api, InMemoryTokenStore(), SessionPrefs(FakeDataStore()), db, orders, SchedulerSpy())

        val refreshJob = launch { orders.refreshList(OrdersFilter()) }
        runCurrent() // the refresh is now parked inside the API call

        val signOutJob = launch { session.signOut() }
        reachedWipe.await() // signOut() has cleared order_summaries and is paused right there

        apiGate.complete(Unit) // let the in-flight refresh's API call return
        refreshJob.join() // let it race to write back, if the bug allows it

        releaseWipe.complete(Unit) // let signOut() finish wiping and bump the epoch
        signOutJob.join()

        assertTrue(
            "the previous session's rows must not survive signOut()",
            realDao.observeList(OrdersFilter().listKey).first().isEmpty(),
        )
    }

    private fun loginResponse(userId: String) = LoginResponse(
        token = "tok",
        user = UserDto(id = userId, name = "Азиз", role = "OWNER", permissions = emptyList(), mustChangePassword = false),
        redirectTo = "/",
    )

    private suspend fun queuedRow(db: EtalonDatabase, id: String, owner: String): File {
        val file = File.createTempFile("outbox-$id", ".jpg").apply { deleteOnExit(); writeBytes(ByteArray(4)) }
        db.outboxDao().upsert(OutboxEntity(
            id = id, ownerId = owner, kind = "LOAD_TRUCK", orderId = "o1", payloadJson = "{}",
            filePath = file.absolutePath, state = OutboxState.QUEUED, createdAt = 0, updatedAt = 0,
        ))
        return file
    }

    private fun session(
        db: EtalonDatabase, api: EtalonApi, tokens: TokenStore = InMemoryTokenStore(),
        scheduler: OutboxScheduler = SchedulerSpy(),
    ): SessionRepository {
        val orders = OrdersRepository(api, db.ordersDao(), Json { ignoreUnknownKeys = true }, "https://x")
        return SessionRepository(api, tokens, SessionPrefs(FakeDataStore()), db, orders, scheduler)
    }

    /**
     * A queued row carries the previous operator's cash figure and photo. Signing in as someone
     * else must destroy it — row and JPEG — and must do so before the new token exists, since
     * that token is what a drain would upload it under.
     */
    @Test fun `signing in as a different operator destroys the previous operator's queued row and file`() = runTest {
        val db = realDatabase()
        val theirFile = queuedRow(db, "theirs", owner = "u2")

        var theirRowWhenTokenStored: OutboxEntity? = null
        val tokens = ProbingTokenStore { theirRowWhenTokenStored = db.outboxDao().byId("theirs") }
        session(db, UnusedApi(loginResponse = loginResponse("u1")), tokens).login("owner", "1234").getOrThrow()

        assertNull("the previous operator's row must not survive", db.outboxDao().byId("theirs"))
        assertTrue("its photo must not survive either", !theirFile.exists())
        assertNull("the purge must land before the new session's token exists", theirRowWhenTokenStored)
    }

    /**
     * The routine path this whole design exists for: a 401 clears the session, the operator
     * re-enters their PIN, and the delivery proof they queued offline is still there to send.
     */
    @Test fun `signing back in as the same operator keeps their queued row, still claimable`() = runTest {
        val db = realDatabase()
        val myFile = queuedRow(db, "mine", owner = "u1")
        val scheduler = SchedulerSpy()

        session(db, UnusedApi(loginResponse = loginResponse("u1")), scheduler = scheduler).login("owner", "1234").getOrThrow()

        assertNotNull("the operator's own row must survive", db.outboxDao().byId("mine"))
        assertTrue("the photo must still be on disk", myFile.exists())
        assertEquals("and the row must still be sendable", "mine", db.outboxDao().claimNext(ownerId = "u1", at = 1)?.id)
    }

    /**
     * Surviving is not enough — something has to send it. The drain that ran while the operator was
     * on the PIN screen found no owner and returned success, which ends WorkManager's unique-work
     * chain; without a kick here the preserved delivery proof sits QUEUED until the next enqueue or
     * a process restart. That is Task 7's stranded-upload failure arriving through a new door.
     */
    @Test fun `signing in schedules a drain for the rows that survived`() = runTest {
        val db = realDatabase()
        queuedRow(db, "mine", owner = "u1")
        val scheduler = SchedulerSpy()

        session(db, UnusedApi(loginResponse = loginResponse("u1")), scheduler = scheduler).login("owner", "1234").getOrThrow()

        assertEquals("a successful sign-in must nudge the outbox", 1, scheduler.scheduled.size)
    }

    /** Sign-out ends the session, not the operator's queued work: the rows wait for them. The
     *  order cache still goes, which the racing-refresh test above pins down separately. */
    @Test fun `signing out leaves the outbox alone`() = runTest {
        val db = realDatabase()
        val myFile = queuedRow(db, "mine", owner = "u1")

        session(db, UnusedApi()).signOut()

        assertNotNull("the operator's own row must survive", db.outboxDao().byId("mine"))
        assertTrue("the photo must survive sign-out", myFile.exists())
    }
}
