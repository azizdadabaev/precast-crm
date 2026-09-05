package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*

/** Records what was enqueued and what hit the network, so the queued-versus-online
 *  boundary is asserted rather than assumed. */
private class SpyOutbox : OutboxGateway {
    data class Enqueued(val kind: OutboxKind, val orderId: String, val shipmentId: String?, val payload: String)
    val calls = mutableListOf<Enqueued>()
    override suspend fun enqueue(kind: OutboxKind, orderId: String, shipmentId: String?, photo: PreparedImage?, payload: JsonObject): String {
        calls += Enqueued(kind, orderId, shipmentId, payload.toString()); return "outbox-${calls.size}"
    }
}

/** Every member errors with IllegalStateException by default (Kotlin's `error(...)`), so
 *  FailingApi below needs no overrides at all, and RecordingApi only overrides what it exercises. */
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

/** Any direct call fails the test — proves an operation went through the outbox instead. */
private class FailingApi : StubApi()

private class RecordingApi : StubApi() {
    val calls = mutableListOf<String>()
    override suspend fun createShipment(id: String): ShipmentDto {
        calls += "createShipment:$id"
        return ShipmentDto(id = "s1", number = 1, status = "PENDING")
    }
}

private class NoopOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

class LogisticsRepositoryTest {

    @Test fun `loadTruck is queued, never sent directly`() = runTest {
        val outbox = SpyOutbox()
        val api = FailingApi()                       // any direct call fails the test
        val id = LogisticsRepository(api, outbox, NoopOrders()).loadTruck("o1", photo = null).getOrThrow()
        assertEquals("outbox-1", id)
        assertEquals(OutboxKind.LOAD_TRUCK, outbox.calls.single().kind)
    }

    @Test fun `deliveryProof carries the cash fields in its payload`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders()).deliveryProof(
            "o1", photo = null,
            cash = DeliveryCash(amount = Money.parse("1500000"), driverReturned = true),
        ).getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue(payload.contains("1500000"))
        assertTrue(payload.contains("driverReturned"))
    }

    @Test fun `loadShipment formats beam keys to two decimals`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders())
            .loadShipment("o1", "s1", photo = null, beams = mapOf("3.3" to 5, "4" to 2), blocks = 120)
            .getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue(payload.contains("3.30"), "keys must be two-decimal or the server's over-load guard rejects them")
        assertTrue(payload.contains("4.00"))
        assertFalse(payload.contains("\"3.3\":"))
    }

    @Test fun `createShipment goes straight to the network and refreshes the order`() = runTest {
        val api = RecordingApi(); val orders = NoopOrders()
        LogisticsRepository(api, SpyOutbox(), orders).createShipment("o1").getOrThrow()
        assertEquals(listOf("createShipment:o1"), api.calls)
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = LogisticsRepository(FailingApi(), SpyOutbox(), NoopOrders()).createShipment("o1")
        assertTrue(res.isFailure)
    }
}
