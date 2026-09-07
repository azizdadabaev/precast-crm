package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*

/** Mirrors PaymentsRepositoryTest's DiscStubApi — file-private, so this file needs its own copy. */
private open class DiscStubApi : EtalonApi {
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
    override suspend fun recordPayment(body: PaymentRecordRequest): PaymentRowDto = error("unused")
    override suspend fun confirmPayment(id: String, body: PaymentConfirmRequest): PaymentRowDto = error("unused")
    override suspend fun rejectPayment(id: String, body: PaymentRejectRequest): PaymentRowDto = error("unused")
    override suspend fun handoverPayment(id: String): PaymentRowDto = error("unused")
    override suspend fun uploadReceipt(file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptUrlDto = error("unused")
    override suspend fun addPaymentReceipt(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptDto = error("unused")
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> = error("unused")
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto = error("unused")
}

/** Any direct call fails the test. */
private class DiscFailingApi : DiscStubApi()

private class DiscRecordingApi : DiscStubApi() {
    val calls = mutableListOf<String>()
    var row = DiscrepancyDto(
        id = "d1", orderId = "o1", expectedAmount = "1000000", receivedAmount = "800000",
        shortfall = "200000", status = "RESOLVED_RECOVERED", reportedAt = "2026-01-01T00:00:00Z",
    )
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> { calls += "discrepancies:$status"; return listOf(row) }
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto {
        calls += "updateDiscrepancy:$id:${body.status}:${body.resolutionNote}"; return row
    }
}

private class DiscNoopOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

private val DISC_GRANTED = PermissionGate { true }

class DiscrepanciesRepositoryTest {

    @Test fun `resolve is refused for an operator without discrepancy resolve`() = runTest {
        val repo = DiscrepanciesRepository(DiscFailingApi(), DiscNoopOrders(), PermissionGate { it != "discrepancy.resolve" })
        val res = repo.resolve("d1", DiscrepancyStatus.RESOLVED_RECOVERED, "Мижоз тўлади")
        assertTrue(res.isFailure, "a write the server would answer 403 to must fail before the network")
    }

    @Test fun `resolve calls the api and refreshes the order the response row names`() = runTest {
        val api = DiscRecordingApi()
        val orders = DiscNoopOrders()
        val result = DiscrepanciesRepository(api, orders, DISC_GRANTED)
            .resolve("d1", DiscrepancyStatus.RESOLVED_RECOVERED, "Мижоз тўлади")
            .getOrThrow()
        assertEquals("d1", result.id)
        assertEquals(listOf("updateDiscrepancy:d1:RESOLVED_RECOVERED:Мижоз тўлади"), api.calls)
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = DiscrepanciesRepository(DiscFailingApi(), DiscNoopOrders(), DISC_GRANTED).resolve("d1", DiscrepancyStatus.OPEN, "note")
        assertTrue(res.isFailure)
    }

    @Test fun `list passes the status filter through untranslated`() = runTest {
        val api = DiscRecordingApi()
        DiscrepanciesRepository(api, DiscNoopOrders(), DISC_GRANTED).list(DiscrepancyStatus.OPEN).getOrThrow()
        assertEquals(listOf("discrepancies:OPEN"), api.calls)
    }

    /**
     * `DiscrepanciesRepository` has no constructor path to the outbox at all — resolving a
     * discrepancy is always online-only, so there is no seam to check with a spy the way
     * PaymentsRepository's `attachReceipt` is. The absence itself is the guarantee; assert it
     * structurally, mirroring LogisticsRepositoryTest's DriversRepository check, so a future
     * change that adds one fails this test instead of compiling in silently.
     */
    @Test fun `DiscrepanciesRepository has no constructor path to the outbox`() {
        val params = DiscrepanciesRepository::class.java.declaredConstructors.single().parameterTypes.toList()
        assertFalse(params.contains(OutboxGateway::class.java))
    }
}
