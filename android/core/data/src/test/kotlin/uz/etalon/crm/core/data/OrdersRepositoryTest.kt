package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*
import java.io.IOException

private class FakeDao : OrdersDao {
    val lists = MutableStateFlow<Map<String, List<OrderSummaryEntity>>>(emptyMap())
    val details = MutableStateFlow<Map<String, OrderDetailEntity>>(emptyMap())
    override fun observeList(listKey: String) = lists.map { it[listKey].orEmpty() }
    override suspend fun clearList(listKey: String) { lists.value = lists.value - listKey }
    override suspend fun insertAll(rows: List<OrderSummaryEntity>) { rows.groupBy { it.listKey }.forEach { (k, v) -> lists.value = lists.value + (k to (lists.value[k].orEmpty() + v).sortedBy { it.position }) } }
    override suspend fun replaceList(listKey: String, rows: List<OrderSummaryEntity>) { clearList(listKey); insertAll(rows) }
    override fun observeDetail(id: String) = details.map { it[id] }
    override suspend fun upsertDetail(row: OrderDetailEntity) { details.value = details.value + (row.id to row) }
    override suspend fun deleteSummaries(id: String) { lists.value = lists.value.mapValues { (_, v) -> v.filterNot { it.id == id } } }
    override suspend fun deleteDetail(id: String) { details.value = details.value - id }
    override suspend fun deleteOrder(id: String) { deleteSummaries(id); deleteDetail(id) }
    override suspend fun clearAllSummaries() { lists.value = emptyMap() }
    override suspend fun clearAllDetails() { details.value = emptyMap() }
}

private open class FakeApi : EtalonApi {
    var page: OrdersPageDto = OrdersPageDto(emptyList(), 0, 1, 20, 0)
    var fail: Throwable? = null

    /** When set, `orders()` suspends until it completes, so a test can act mid-flight. */
    var gate: CompletableDeferred<Unit>? = null
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto { gate?.await(); fail?.let { throw it }; return this.page }
    override suspend fun order(id: String): OrderDetailDto { fail?.let { throw it }; throw ApiException(404, "Топилмади · Not found") }
    override suspend fun login(body: LoginRequest) = error("unused")
    override suspend fun me() = error("unused")
    override suspend fun bootstrap() = error("unused")
    override suspend fun changePin(body: ChangePinRequest) = error("unused")
    override suspend fun registerDevice(body: DeviceRegisterRequest) = error("unused")
    override suspend fun unregisterDevice(token: String) = error("unused")
}

/** A DAO whose list-read is broken, to prove refreshList()'s failure path never depends on it. */
private class ThrowingListDao : OrdersDao {
    override fun observeList(listKey: String): Flow<List<OrderSummaryEntity>> = flow { throw IOException("disk error") }
    override suspend fun clearList(listKey: String) {}
    override suspend fun insertAll(rows: List<OrderSummaryEntity>) {}
    override suspend fun replaceList(listKey: String, rows: List<OrderSummaryEntity>) {}
    override fun observeDetail(id: String): Flow<OrderDetailEntity?> = MutableStateFlow(null)
    override suspend fun upsertDetail(row: OrderDetailEntity) {}
    override suspend fun deleteSummaries(id: String) {}
    override suspend fun deleteDetail(id: String) {}
    override suspend fun deleteOrder(id: String) {}
    override suspend fun clearAllSummaries() {}
    override suspend fun clearAllDetails() {}
}

class OrdersRepositoryTest {
    private val summary = OrderSummaryDto("o1", "2026-09-0041", "PLACED", "AWAITING_PAYMENT", "1.00", "0", "1.000", 1, 1, "2026-09-04T00:00:00Z", "2026-09-01T00:00:00Z", ClientDto("c", "A", "998901112233", null))

    @Test fun `emits Loading(null) then Success after a refresh`() = runTest {
        val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, FakeDao(), Json { ignoreUnknownKeys = true }, "https://x")
        repo.list(OrdersFilter()).test {
            assertEquals(Resource.Loading<List<uz.etalon.crm.core.model.OrderSummary>>(null), awaitItem())
            repo.refreshList(OrdersFilter())
            val s = awaitItem() as Resource.Success
            assertEquals("2026-09-0041", s.data.single().orderNumber)
            cancelAndIgnoreRemainingEvents()
        }
    }
    @Test fun `network failure keeps cached rows and reports Error`() = runTest {
        val dao = FakeDao(); val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter())
        api.fail = IOException("down")
        repo.list(OrdersFilter()).test {
            awaitItem() // Loading(cached)
            repo.refreshList(OrdersFilter())
            val e = awaitItem() as Resource.Error
            assertEquals(1, e.cached!!.size)
            cancelAndIgnoreRemainingEvents()
        }
    }
    @Test fun `a 404 on detail evicts the cached order`() = runTest {
        val dao = FakeDao().apply { details.value = mapOf("o1" to OrderDetailEntity("o1", "{}", 0)) }
        val repo = OrdersRepository(FakeApi(), dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshDetail("o1")
        assertNull(dao.details.value["o1"])
    }
    @Test fun `listKey distinguishes filters`() {
        assertNotEquals(OrdersFilter().listKey, OrdersFilter(status = OrderStatus.PLACED).listKey)
        assertEquals("q=|status=|day=|page=1", OrdersFilter().listKey)
    }

    @Test fun `clearCache resets outcomes so a stale account's data cannot leak`() = runTest {
        val dao = FakeDao(); val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter())
        dao.clearAllSummaries() // what SessionRepository.signOut()'s db.wipe() does to the DAO half of the cache
        repo.clearCache()
        repo.list(OrdersFilter()).test {
            assertEquals(Resource.Loading<List<uz.etalon.crm.core.model.OrderSummary>>(null), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** User A's request is still in flight when user A signs out. It must not write its rows into
     *  the cleared cache, where user B would be the one to see them. */
    @Test fun `a refresh that lands after clearCache cannot resurrect the previous session's rows`() = runTest {
        val dao = FakeDao()
        val gate = CompletableDeferred<Unit>()
        val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1); this.gate = gate }
        val repo = OrdersRepository(api, dao, Json { ignoreUnknownKeys = true }, "https://x")
        val job = launch { repo.refreshList(OrdersFilter()) }
        runCurrent() // the refresh is now parked inside the API call
        repo.clearCache()
        gate.complete(Unit)
        job.join()
        assertTrue(dao.lists.value.values.all { it.isEmpty() }, "the stale page must not reach Room either")
        repo.list(OrdersFilter()).test {
            assertEquals(Resource.Loading<List<uz.etalon.crm.core.model.OrderSummary>>(null), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** A cancelled scope (screen left, ViewModel cleared) is not a failure to report to the user. */
    @Test fun `cancelling a refresh records no error outcome`() = runTest {
        val api = FakeApi().apply { gate = CompletableDeferred() }
        val repo = OrdersRepository(api, FakeDao(), Json { ignoreUnknownKeys = true }, "https://x")
        val job = launch { repo.refreshList(OrdersFilter()) }
        runCurrent()
        job.cancelAndJoin()
        repo.list(OrdersFilter()).test {
            assertEquals(Resource.Loading<List<uz.etalon.crm.core.model.OrderSummary>>(null), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `a 404 on detail records an Error, not a permanent Loading`() = runTest {
        val repo = OrdersRepository(FakeApi(), FakeDao(), Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshDetail("o1") // FakeApi.order() throws a 404 by default
        repo.detail("o1").test {
            val e = awaitItem() as Resource.Error
            assertEquals(AppError.Server("Топилмади", 404), e.error)
            assertNull(e.cached)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `a 404 on detail evicts the order from cached lists`() = runTest {
        val dao = FakeDao(); val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter()) // list now contains "o1"
        repo.refreshDetail("o1") // 404s
        repo.list(OrdersFilter()).test {
            val s = awaitItem() as Resource.Success
            assertTrue(s.data.none { it.id == "o1" })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `refreshList tolerates a broken DAO read and still records the network error`() = runTest {
        val api = FakeApi().apply { fail = IOException("down") }
        val repo = OrdersRepository(api, ThrowingListDao(), Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter()) // must not throw despite the DAO being broken
        repo.list(OrdersFilter()).test {
            val e = awaitItem() as Resource.Error
            assertNull(e.cached)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** Cold offline start: Room still holds the last page, but the in-memory outcome map died with
     *  the process. The error must be reported *over* the Room rows, not instead of them. */
    @Test fun `a failed refresh with no in-memory rows falls back to the Room cache`() = runTest {
        val key = OrdersFilter().listKey
        val dao = FakeDao().apply {
            lists.value = mapOf(key to listOf(OrderSummaryEntity(
                id = "o1", orderNumber = "2026-09-0041", status = "PLACED", paymentState = "AWAITING_PAYMENT",
                totalPrice = "1.00", confirmedPaid = "0", totalArea = "1.000", totalBlocks = 1, totalBeams = 1,
                scheduledAt = 0L, placedAt = 0L, clientId = "c", clientName = "A", clientPhone = "998901112233",
                clientAddress = null, listKey = key, position = 0, cachedAt = 0L,
            )))
        }
        val repo = OrdersRepository(FakeApi().apply { fail = IOException("down") }, dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter())
        repo.list(OrdersFilter()).test {
            val e = awaitItem() as Resource.Error
            assertEquals("2026-09-0041", e.cached!!.single().orderNumber)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `a corrupt cached detail JSON does not crash the flow`() = runTest {
        val dao = FakeDao().apply { details.value = mapOf("o1" to OrderDetailEntity("o1", "{}", 0)) }
        val repo = OrdersRepository(FakeApi(), dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.detail("o1").test {
            assertEquals(Resource.Loading<uz.etalon.crm.core.model.OrderDetail>(null), awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
