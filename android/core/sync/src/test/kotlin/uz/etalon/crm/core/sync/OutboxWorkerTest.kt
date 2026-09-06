package uz.etalon.crm.core.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.test.runTest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.data.CurrentUser
import uz.etalon.crm.core.data.OrdersGateway
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.EtalonJson
import uz.etalon.crm.core.network.dto.*
import java.io.File
import kotlinx.serialization.json.JsonObject

/** Every member errors by default, so a test only overrides the routes its row actually calls —
 *  mirrors :core:data's LogisticsRepositoryTest.StubApi (test source sets are not shared across
 *  Gradle modules, so this is its own copy, not a reuse). */
private open class StubApi : EtalonApi {
    override suspend fun login(body: LoginRequest): LoginResponse = error("unused")
    override suspend fun me(): UserDto = error("unused")
    override suspend fun bootstrap(): BootstrapDto = error("unused")
    override suspend fun changePin(body: ChangePinRequest): ChangedDto = error("unused")
    override suspend fun registerDevice(body: DeviceRegisterRequest): DeviceDto = error("unused")
    override suspend fun unregisterDevice(token: String): DeletedDto = error("unused")
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto = error("unused")
    override suspend fun order(id: String): OrderDetailDto = error("unused")

    override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String): LoadedPhotoDto = error("unused")
    override suspend fun addLoadedPhoto(id: String, file: MultipartBody.Part, idempotencyKey: String): GalleryPhotoDto = error("unused")
    override suspend fun deliveryProof(id: String, file: MultipartBody.Part, cashAmount: RequestBody, noCashCollected: RequestBody, noCashCollectedNote: RequestBody, driverReturned: RequestBody, idempotencyKey: String): OrderStatusDto = error("unused")
    override suspend fun loadShipment(id: String, sid: String, file: MultipartBody.Part, loadedBeams: RequestBody, loadedBlocks: RequestBody, idempotencyKey: String): ShipmentDto = error("unused")

    override suspend fun deleteLoadedPhoto(id: String, photoId: String): DeletedIdDto = error("unused")
    override suspend fun createShipment(id: String): ShipmentDto = error("unused")
    override suspend fun deleteShipment(id: String, sid: String): DeletedDto = error("unused")
    override suspend fun dispatchShipment(id: String, sid: String, body: ShipmentDispatchRequest): DispatchedDto = error("unused")
    override suspend fun deliverShipment(id: String, sid: String): DeliveredDto = error("unused")
    override suspend fun createDispatch(id: String, body: DispatchCreateRequest): DispatchDto = error("unused")
    override suspend fun markDispatchReturned(id: String): DispatchDto = error("unused")
    override suspend fun setDeliveryLocation(id: String, body: JsonObject): DeliveryLocationDto = error("unused")
    override suspend fun resolveMapLink(body: ResolveLinkRequest): LatLngDto = error("unused")
    override suspend fun drivers(activeOnly: String?): List<DriverListItemDto> = error("unused")
    override suspend fun createDriver(body: DriverCreateRequest): DriverListItemDto = error("unused")
    override suspend fun updateDriver(id: String, body: DriverUpdateRequest): DriverListItemDto = error("unused")
    override suspend fun setDriverActive(id: String, body: DriverActiveRequest): DriverListItemDto = error("unused")
}

private class RecordingOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

/** The operator every test row belongs to unless it says otherwise. */
private const val SIGNED_IN = "u1"

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OutboxWorkerTest {

    private fun db() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java,
    ).allowMainThreadQueries().build()

    /** A queued row always needs a file on disk — the worker fails permanently otherwise
     *  (MissingUploadFileException) — so every test row gets a real temp file. */
    private fun row(
        id: String, orderId: String, state: String = OutboxState.QUEUED, created: Long = 0,
        owner: String = SIGNED_IN,
    ): OutboxEntity {
        val file = File.createTempFile("outbox-$id", ".jpg").apply { deleteOnExit() }
        return OutboxEntity(
            id = id, ownerId = owner, kind = "LOAD_TRUCK", orderId = orderId, shipmentId = null, paymentId = null,
            filePath = file.absolutePath, payloadJson = "{}", state = state,
            attempts = 0, lastError = null, createdAt = created, updatedAt = created,
        )
    }

    private fun worker(
        dao: OutboxDao, api: EtalonApi, orders: OrdersGateway, signedIn: String? = SIGNED_IN,
    ): OutboxWorker {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                OutboxWorker(appContext, workerParameters, dao, api, orders, EtalonJson.create(), CurrentUser { signedIn })
        }
        return TestListenableWorkerBuilder<OutboxWorker>(context).setWorkerFactory(factory).build()
    }

    @Test fun `resetRunning runs before the first claim, so a row stranded by a killed process is not stuck forever`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("stranded", "o1", OutboxState.RUNNING, created = 1))
        val api = object : StubApi() { override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String) = LoadedPhotoDto("https://x/1.jpg") }
        val orders = RecordingOrders()

        val result = worker(dao, api, orders).doWork()

        // Without resetRunning() at start, claimNext would never see this row (it filters on
        // QUEUED) and it would sit RUNNING forever.
        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(null, dao.byId("stranded"))
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `a retryable row does not block a newer row in the same drain`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("old-retries", "o1", created = 1))
        dao.upsert(row("new-succeeds", "o2", created = 2))
        val api = object : StubApi() {
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String): LoadedPhotoDto =
                if (id == "o1") throw ApiException(500, "Server error") else LoadedPhotoDto("https://x/2.jpg")
        }
        val orders = RecordingOrders()

        val result = worker(dao, api, orders).doWork()

        assertEquals(ListenableWorker.Result.retry(), result)
        // The newer row was not left waiting behind the retrying older one.
        assertEquals(null, dao.byId("new-succeeds"))
        assertEquals(listOf("o2"), orders.refreshed)
    }

    @Test fun `deferred retryable rows are requeued with an incremented attempt count`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("flaky", "o1", created = 1).copy(attempts = 2))
        val api = object : StubApi() {
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String): LoadedPhotoDto =
                throw ApiException(503, "Service unavailable")
        }

        val result = worker(dao, api, RecordingOrders()).doWork()

        assertEquals(ListenableWorker.Result.retry(), result)
        val after = dao.byId("flaky")!!
        assertEquals(OutboxState.QUEUED, after.state)
        assertEquals(3, after.attempts)
    }

    /** The drain runs under one operator's token, so it may only send that operator's rows: the
     *  other row's cash figure and photo would otherwise be posted as the wrong person. */
    @Test fun `the worker leaves another operator's row untouched`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("theirs", "o1", created = 1, owner = "someone-else"))
        dao.upsert(row("mine", "o2", created = 2, owner = SIGNED_IN))
        val sent = mutableListOf<String>()
        val api = object : StubApi() {
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String): LoadedPhotoDto {
                sent += id
                return LoadedPhotoDto("https://x/1.jpg")
            }
        }
        val orders = RecordingOrders()

        val result = worker(dao, api, orders).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(listOf("o2"), sent)
        assertEquals(null, dao.byId("mine"))
        assertEquals(OutboxState.QUEUED, dao.byId("theirs")?.state)
        assertEquals(listOf("o2"), orders.refreshed)
    }

    /** No signed-in operator means no owner to drain for. That is an ordinary state (the app sits
     *  on the PIN screen after a 401), so the run simply has nothing to do — it must not fail,
     *  and it must not touch the queued rows waiting for their owner to come back. */
    @Test fun `with nobody signed in the worker claims nothing`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("waiting", "o1", created = 1))
        val orders = RecordingOrders()

        // StubApi errors on any call, so an attempted upload would fail this test loudly.
        val result = worker(dao, StubApi(), orders, signedIn = null).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(OutboxState.QUEUED, dao.byId("waiting")?.state)
        assertEquals(emptyList<String>(), orders.refreshed)
    }

    @Test fun `two rows for the same order refresh it only once`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1", created = 1))
        dao.upsert(row("b", "o1", created = 2))
        val api = object : StubApi() {
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String) = LoadedPhotoDto("https://x/1.jpg")
        }
        val orders = RecordingOrders()

        worker(dao, api, orders).doWork()

        assertEquals(listOf("o1"), orders.refreshed)
    }
}
