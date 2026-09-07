package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.ClientInput
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*

/** Mirrors DiscrepanciesRepositoryTest's DiscStubApi — file-private, so this file needs its own
 *  copy. Every member errors with IllegalStateException by default (Kotlin's `error(...)`), so
 *  ClientFailingApi below needs no overrides at all, and ClientRecordingApi only overrides what
 *  it exercises. */
private open class ClientStubApi : EtalonApi {
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
    override suspend fun addPaymentReceipt(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptDto = error("unused")
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> = error("unused")
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto = error("unused")

    override suspend fun clients(q: String?, phone: String?): List<ClientRowDto> = error("unused")
    override suspend fun createClient(body: ClientWriteRequest): ClientRowDto = error("unused")
    override suspend fun client(id: String): ClientDetailDto = error("unused")
    override suspend fun updateClient(id: String, body: ClientWriteRequest): ClientRowDto = error("unused")
    override suspend fun dashboard(): DashboardDto = error("unused")
}

/** Any direct call fails the test — proves an operation was refused before it ever reached the
 *  network, or genuinely failed there. */
private class ClientFailingApi : ClientStubApi()

private class ClientRecordingApi : ClientStubApi() {
    val calls = mutableListOf<String>()
    var createResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
    var updateResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
    var listResult = listOf<ClientRowDto>()
    var detailResult = ClientDetailDto(id = "c1", name = "Navoi Build", phone = "998901112233")

    override suspend fun clients(q: String?, phone: String?): List<ClientRowDto> {
        calls += "clients:$q:$phone"; return listResult
    }
    override suspend fun createClient(body: ClientWriteRequest): ClientRowDto {
        calls += "createClient:${body.name}:${body.phone}:${body.address}:${body.notes}"; return createResult
    }
    override suspend fun client(id: String): ClientDetailDto {
        calls += "client:$id"; return detailResult
    }
    override suspend fun updateClient(id: String, body: ClientWriteRequest): ClientRowDto {
        calls += "updateClient:$id:${body.name}:${body.phone}"; return updateResult
    }
}

/** An operator holding every permission. */
private val CLIENT_GRANTED = PermissionGate { true }

private fun input(
    name: String = "Navoi Build",
    phone: String = "+998 90 111 22 33",
    address: String? = null,
    notes: String? = null,
) = ClientInput(name = name, phone = phone, address = address, notes = notes)

class ClientsRepositoryTest {

    // ── The three that matter ────────────────────────────────────

    @Test fun `create is refused for an operator without client create`() = runTest {
        // ClientRecordingApi, not ClientFailingApi: a FailingApi cannot tell a refusal from a
        // network error, since either way the call throws and the Result comes back failed.
        // Only a recording double that would have SUCCEEDED can prove the guard, not the
        // exception, is what stopped it.
        val api = ClientRecordingApi()
        val repo = ClientsRepository(api, PermissionGate { it != "client.create" })
        val res = repo.create(input())
        assertTrue(res.isFailure, "the server would answer 403; the write must be refused first")
        assertEquals(0, api.calls.size, "the guard must refuse before the network: ${api.calls}")
    }

    @Test fun `update is refused for an operator without client edit`() = runTest {
        val api = ClientRecordingApi()
        val repo = ClientsRepository(api, PermissionGate { it != "client.edit" })
        val res = repo.update("c1", input())
        assertTrue(res.isFailure, "the server would answer 403; the write must be refused first")
        assertEquals(0, api.calls.size, "the guard must refuse before the network: ${api.calls}")
    }

    @Test fun `create normalises the phone before it reaches the request`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED)
            .create(input(phone = "+998 90 111 22 33"))
            .getOrThrow()
        assertEquals(
            listOf("createClient:Navoi Build:998901112233:null:null"), api.calls,
            "the request must carry digits only, matching src/lib/phone.ts's normalizePhone — " +
                "the server dedups POST /api/clients by this exact form",
        )
    }

    @Test fun `update also normalises the phone before it reaches the request`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED)
            .update("c1", input(phone = "8 (90) 111-22-33"))
            .getOrThrow()
        assertEquals(listOf("updateClient:c1:Navoi Build:998901112233"), api.calls)
    }

    /**
     * `ClientsRepository` has no constructor path to the outbox at all — every route here is
     * online-only, so there is no seam to check with a spy the way PaymentsRepository's
     * `attachReceipt` is. The absence itself is the guarantee; assert it structurally, mirroring
     * DiscrepanciesRepositoryTest's own check, so a future change that adds one fails this test
     * instead of compiling in silently.
     */
    @Test fun `ClientsRepository has no constructor path to the outbox`() {
        val params = ClientsRepository::class.java.declaredConstructors.single().parameterTypes.toList()
        assertFalse(params.contains(OutboxGateway::class.java))
    }

    // ── The rest: standard repository shape, mirroring the other suites ─────

    @Test fun `list passes the query through untranslated`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED).list("Navoi").getOrThrow()
        assertEquals(listOf("clients:Navoi:null"), api.calls)
    }

    @Test fun `detail maps the id straight through`() = runTest {
        val api = ClientRecordingApi()
        val detail = ClientsRepository(api, CLIENT_GRANTED).detail("c1").getOrThrow()
        assertEquals("c1", detail.id)
        assertEquals(listOf("client:c1"), api.calls)
    }

    @Test fun `create returns the new client's id`() = runTest {
        val api = ClientRecordingApi().apply { createResult = ClientRowDto(id = "c9", name = "X", phone = "998900000000") }
        val id = ClientsRepository(api, CLIENT_GRANTED).create(input()).getOrThrow()
        assertEquals("c9", id)
    }

    @Test fun `update succeeds without surfacing the response row`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED).update("c1", input()).getOrThrow()
        assertEquals(listOf("updateClient:c1:Navoi Build:998901112233"), api.calls)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = ClientsRepository(ClientFailingApi(), CLIENT_GRANTED).create(input())
        assertTrue(res.isFailure)
    }

    @Test fun `a list-row response with no _count still maps to zero orders`() = runTest {
        // POST /api/clients omits _count entirely; ClientRowDto defaults it to zero rather than
        // throwing. list() still goes through the same mapper as any _count-bearing row, so
        // prove the default survives an explicit construction here too.
        val row = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
        val api = ClientRecordingApi().apply { listResult = listOf(row) }
        val rows = ClientsRepository(api, CLIENT_GRANTED).list(null).getOrThrow()
        assertEquals(0, rows.single().orderCount)
    }
}
