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
import uz.etalon.crm.core.network.TokenProvider
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

    override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto = error("unused")
    override suspend fun addLoadedPhoto(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): GalleryPhotoDto = error("unused")
    override suspend fun deliveryProof(id: String, file: MultipartBody.Part, cashAmount: RequestBody, noCashCollected: RequestBody, noCashCollectedNote: RequestBody, driverReturned: RequestBody, idempotencyKey: String, authorization: String): OrderStatusDto = error("unused")
    override suspend fun loadShipment(id: String, sid: String, file: MultipartBody.Part, loadedBeams: RequestBody, loadedBlocks: RequestBody, idempotencyKey: String, authorization: String): ShipmentDto = error("unused")

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

    override suspend fun payments(orderId: String?, status: String?): List<PaymentRowDto> = error("unused")
    override suspend fun recordPayment(body: PaymentRecordRequest, idempotencyKey: String): PaymentRowDto = error("unused")
    override suspend fun confirmPayment(id: String, body: PaymentConfirmRequest): PaymentRowDto = error("unused")
    override suspend fun rejectPayment(id: String, body: PaymentRejectRequest): PaymentRowDto = error("unused")
    override suspend fun handoverPayment(id: String): PaymentRowDto = error("unused")
    override suspend fun uploadReceipt(file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptUrlDto = error("unused")
    override suspend fun addPaymentReceipt(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptDto = error("unused")
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> = error("unused")
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto = error("unused")
}

private class RecordingOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

/** The operator every test row belongs to unless it says otherwise. */
private const val SIGNED_IN = "u1"

/** The stored session token, mutable so a test can change it mid-drain. */
private class FakeTokens(var value: String?) : TokenProvider {
    override suspend fun token() = value
    override suspend fun onUnauthorized() { value = null }
}

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
        tokens: TokenProvider = FakeTokens("tok"),
    ): OutboxWorker {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                OutboxWorker(appContext, workerParameters, dao, api, orders, EtalonJson.create(), CurrentUser { signedIn }, tokens)
        }
        return TestListenableWorkerBuilder<OutboxWorker>(context).setWorkerFactory(factory).build()
    }

    @Test fun `resetRunning runs before the first claim, so a row stranded by a killed process is not stuck forever`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("stranded", "o1", OutboxState.RUNNING, created = 1))
        val api = object : StubApi() { override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String) = LoadedPhotoDto("https://x/1.jpg") }
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
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto =
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
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto =
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
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto {
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

    /**
     * The credential is pinned when the drain starts and travels on the request itself, so a token
     * that changes mid-drain (another operator signing in) cannot be substituted by the interceptor's
     * live read between a row being claimed and its upload leaving. Without this, the second row here
     * — this operator's photo and cash figure — would be posted as whoever signed in.
     */
    @Test fun `every upload carries the token the drain started with, not the stored one`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1", created = 1))
        dao.upsert(row("b", "o2", created = 2))
        val tokens = FakeTokens("tokX")
        val sentWith = mutableListOf<String>()
        val api = object : StubApi() {
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto {
                sentWith += authorization
                tokens.value = "tokY" // another operator signs in while the drain is running
                return LoadedPhotoDto("https://x/1.jpg")
            }
        }

        worker(dao, api, RecordingOrders(), tokens = tokens).doWork()

        assertEquals(listOf("Bearer tokX", "Bearer tokX"), sentWith)
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
            override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String) = LoadedPhotoDto("https://x/1.jpg")
        }
        val orders = RecordingOrders()

        worker(dao, api, orders).doWork()

        assertEquals(listOf("o1"), orders.refreshed)
    }

    /** A payment-receipt row posts to the payment it was captured for, not the order route the
     *  other three kinds use — and its idempotency key and pinned authorization follow the same
     *  contract as every other queued kind, so a retried drain never double-attaches the photo. */
    @Test fun `a queued payment receipt is posted against its payment and the order refreshes`() = runTest {
        val dao = db().outboxDao()
        val file = File.createTempFile("outbox-receipt", ".jpg").apply { deleteOnExit() }
        dao.upsert(row("receipt-1", "o1", created = 1).copy(kind = "ADD_PAYMENT_RECEIPT", paymentId = "p1", filePath = file.absolutePath))
        var sentPaymentId: String? = null
        var sentKey: String? = null
        var sentAuth: String? = null
        val api = object : StubApi() {
            override suspend fun addPaymentReceipt(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptDto {
                sentPaymentId = id; sentKey = idempotencyKey; sentAuth = authorization
                return ReceiptDto("r1", "/uploads/receipts/x.jpg")
            }
        }
        val orders = RecordingOrders()

        val result = worker(dao, api, orders, tokens = FakeTokens("tokX")).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals("p1", sentPaymentId)
        assertEquals("receipt-1", sentKey)
        assertEquals("Bearer tokX", sentAuth)
        assertEquals(null, dao.byId("receipt-1"))
        assertEquals(listOf("o1"), orders.refreshed)
    }

    /** The same missing-file rule every other queued kind gets — a vanished JPEG can never
     *  succeed on retry — must also hold for a payment receipt, so it fails permanently with the
     *  Uzbek message instead of blocking the queue forever. */
    @Test fun `a payment receipt whose file has vanished fails permanently`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("receipt-2", "o1", created = 1).copy(kind = "ADD_PAYMENT_RECEIPT", paymentId = "p1", filePath = "/no/such/file.jpg"))
        val orders = RecordingOrders()

        // StubApi errors on any call, so reaching the network would fail this test loudly.
        val result = worker(dao, StubApi(), orders).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        val after = dao.byId("receipt-2")!!
        assertEquals(OutboxState.FAILED, after.state)
        assertEquals("Сурат топилмади, қайта суратга олинг", after.lastError)
        assertEquals(emptyList<String>(), orders.refreshed)
    }

    /** A row of this kind should never lack a `paymentId` — `LogisticsRepository`/`PaymentRepository`
     *  always enqueue one — but if a bug or a hand-written row ever did, `requireNotNull` must fail
     *  the row permanently via `outcomeFor`'s bug branch, not throw an unhandled NPE out of the drain
     *  or retry forever against a route it can never resolve. */
    @Test fun `a payment receipt with no payment id fails permanently instead of crashing the drain`() = runTest {
        val dao = db().outboxDao()
        val file = File.createTempFile("outbox-receipt", ".jpg").apply { deleteOnExit() }
        dao.upsert(row("receipt-3", "o1", created = 1).copy(kind = "ADD_PAYMENT_RECEIPT", paymentId = null, filePath = file.absolutePath))
        val orders = RecordingOrders()

        // StubApi errors on any call, so reaching the network would fail this test loudly.
        val result = worker(dao, StubApi(), orders).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        val after = dao.byId("receipt-3")!!
        assertEquals(OutboxState.FAILED, after.state)
        assertEquals("Хатолик юз берди", after.lastError)
        assertEquals(emptyList<String>(), orders.refreshed)
    }
}
