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
    override suspend fun enqueue(kind: OutboxKind, orderId: String, shipmentId: String?, paymentId: String?, photo: PreparedImage?, payload: JsonObject): String {
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

/** An operator holding every permission — the case the pre-existing tests were written for. */
private val GRANTED = PermissionGate { true }

/** A SALES operator: `order.edit` and NOT `dispatch.create`, straight from ROLE_TEMPLATES. */
private val SALES = PermissionGate { it == "order.edit" }

class LogisticsRepositoryTest {

    @Test fun `loadTruck is queued, never sent directly`() = runTest {
        val outbox = SpyOutbox()
        val api = FailingApi()                       // any direct call fails the test
        val id = LogisticsRepository(api, outbox, NoopOrders(), GRANTED).loadTruck("o1", photo = null).getOrThrow()
        assertEquals("outbox-1", id)
        assertEquals(OutboxKind.LOAD_TRUCK, outbox.calls.single().kind)
    }

    @Test fun `deliveryProof carries the cash fields in its payload`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders(), GRANTED).deliveryProof(
            "o1", photo = null,
            cash = DeliveryCash(amount = Money.parse("1500000"), driverReturned = true),
        ).getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue(payload.contains("1500000"))
        assertTrue(payload.contains("driverReturned"))
    }

    @Test fun `loadShipment formats beam keys to two decimals`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders(), GRANTED)
            .loadShipment("o1", "s1", photo = null, beams = mapOf("3.3" to 5, "4" to 2), blocks = 120)
            .getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue(payload.contains("3.30"), "keys must be two-decimal or the server's over-load guard rejects them")
        assertTrue(payload.contains("4.00"))
        assertFalse(payload.contains("\"3.3\":"))
    }

    /**
     * `POST /orders/{id}/shipments/{sid}/load` is wrapped in `withPermission("dispatch.create")`,
     * which SALES does not hold. Queuing it anyway is not a recoverable mistake: the 403 comes back
     * as a permanent Fail, and the failed row then blocks the order's action bar and disables both
     * Load and Delete on that truck, leaving deleting the photo as the only way out. So the enqueue
     * is refused before the photo is ever moved into the outbox.
     */
    @Test fun `loadShipment is refused for an operator without dispatch create`() = runTest {
        val outbox = SpyOutbox()
        val res = LogisticsRepository(FailingApi(), outbox, NoopOrders(), SALES)
            .loadShipment("o1", "s1", photo = null, beams = mapOf("3.3" to 5), blocks = 10)
        assertTrue(res.isFailure, "a load the server would answer 403 to must not be queued")
        assertTrue(outbox.calls.isEmpty(), "nothing may reach the outbox")
    }

    @Test fun `loadShipment is queued for an operator who does hold dispatch create`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders(), PermissionGate { it == "dispatch.create" })
            .loadShipment("o1", "s1", photo = null, beams = mapOf("3.3" to 5), blocks = 10)
            .getOrThrow()
        assertEquals(OutboxKind.LOAD_SHIPMENT, outbox.calls.single().kind)
    }

    @Test fun `createShipment goes straight to the network and refreshes the order`() = runTest {
        val api = RecordingApi(); val orders = NoopOrders()
        LogisticsRepository(api, SpyOutbox(), orders, GRANTED).createShipment("o1").getOrThrow()
        assertEquals(listOf("createShipment:o1"), api.calls)
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = LogisticsRepository(FailingApi(), SpyOutbox(), NoopOrders(), GRANTED).createShipment("o1")
        assertTrue(res.isFailure)
    }

    /**
     * The Critical-severity regression this guards against: a queued dispatch is a double
     * dispatch. Only `createShipment` had a direct assertion before; the other seven of the
     * eight `LogisticsRepository` online-only methods (of the brief's thirteen — the remaining
     * four are `DriversRepository`'s, covered below by construction) had none. Table-driven so
     * a method added to this list later without a deliberate queued-vs-online decision shows up
     * here rather than silently defaulting to whichever it happened to compile against.
     */
    @Test fun `every LogisticsRepository online-only method leaves the outbox untouched`() = runTest {
        val outbox = SpyOutbox()
        val repo = LogisticsRepository(FailingApi(), outbox, NoopOrders(), GRANTED) // FailingApi: the network call itself may fail, the outbox check does not depend on that
        val onlineOnly: List<Pair<String, suspend () -> Result<*>>> = listOf(
            "createShipment" to { repo.createShipment("o1") },
            "deleteShipment" to { repo.deleteShipment("o1", "s1") },
            "deliverShipment" to { repo.deliverShipment("o1", "s1") },
            "deleteLoadedPhoto" to { repo.deleteLoadedPhoto("o1", "p1") },
            "dispatchShipment" to { repo.dispatchShipment("o1", "s1", driverId = null, truckIdentifier = null, driverWillCollectCash = false, cashToCollect = null) },
            "createDispatch" to { repo.createDispatch("o1", driverId = null, truckIdentifier = null, expectedCollection = Money.ZERO, notes = null) },
            "setDeliveryLocation" to { repo.setDeliveryLocation("o1", lat = null, lng = null, url = null, label = null) },
            "resolveMapLink" to { repo.resolveMapLink("https://maps.google.com/x") },
        )
        onlineOnly.forEach { (name, call) ->
            call()
            assertTrue(outbox.calls.isEmpty(), "$name must never enqueue")
        }
    }

    /**
     * `DriversRepository`'s two mutations (part of the brief's thirteen
     * online-only methods, with `drivers()` itself a read) cannot be spy-tested the way
     * `LogisticsRepository`'s can: the class is never handed an `OutboxGateway` at all, so
     * there is no seam to check. That absence *is* the guarantee — assert it structurally, so
     * a future change that adds one (letting a driver mutation reach the outbox without a
     * deliberate decision) fails this test instead of compiling in silently.
     */
    @Test fun `DriversRepository has no constructor path to the outbox`() {
        val params = DriversRepository::class.java.declaredConstructors.single().parameterTypes.toList()
        assertEquals(listOf(EtalonApi::class.java), params)
    }
}
