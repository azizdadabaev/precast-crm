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
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.datastore.InMemoryTokenStore
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.ChangePinRequest
import uz.etalon.crm.core.network.dto.ClientDto
import uz.etalon.crm.core.network.dto.DeviceRegisterRequest
import uz.etalon.crm.core.network.dto.LoginRequest
import uz.etalon.crm.core.network.dto.OrderSummaryDto
import uz.etalon.crm.core.network.dto.OrdersPageDto
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

/** signOut() never calls the API; every method here is unreachable and errors if hit. */
private class UnusedApi(private val gate: CompletableDeferred<Unit>, private val page: OrdersPageDto) : EtalonApi {
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto {
        gate.await()
        return this.page
    }
    override suspend fun order(id: String) = error("unused")
    override suspend fun login(body: LoginRequest) = error("unused")
    override suspend fun me() = error("unused")
    override suspend fun bootstrap() = error("unused")
    override suspend fun changePin(body: ChangePinRequest) = error("unused")
    override suspend fun registerDevice(body: DeviceRegisterRequest) = error("unused")
    override suspend fun unregisterDevice(token: String) = error("unused")
}

/** Wraps the real, Room-generated DAO to pin down the exact moment signOut()'s db.wipe() has
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
     *  `ordersDao()` above) — wipe()'s outbox half is a real `@Transaction` DAO method and needs
     *  a real underlying connection to run against; this test does not exercise outbox behavior. */
    private fun fakeSessionDatabase(dao: OrdersDao): EtalonDatabase {
        val real = realDatabase()
        return object : EtalonDatabase() {
            override fun ordersDao(): OrdersDao = dao
            override fun outboxDao(): OutboxDao = real.outboxDao()
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
        val session = SessionRepository(api, InMemoryTokenStore(), SessionPrefs(FakeDataStore()), db, orders)

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
}
