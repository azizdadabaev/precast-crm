package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentRecordInput
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*
import java.io.File

/** Records what was enqueued, so the queued-versus-online boundary is asserted rather than
 *  assumed. Mirrors LogisticsRepositoryTest's PaySpyOutbox. */
private class PaySpyOutbox : OutboxGateway {
    data class Enqueued(val kind: OutboxKind, val orderId: String, val paymentId: String?)
    val calls = mutableListOf<Enqueued>()
    override suspend fun enqueue(kind: OutboxKind, orderId: String, shipmentId: String?, paymentId: String?, photo: PreparedImage?, payload: JsonObject): String {
        calls += Enqueued(kind, orderId, paymentId); return "outbox-${calls.size}"
    }
}

/** Every member errors with IllegalStateException by default (Kotlin's `error(...)`), so
 *  PayFailingApi below needs no overrides at all. Mirrors LogisticsRepositoryTest's PayStubApi — that
 *  class is file-private, so this module needs its own copy. */
private open class PayStubApi : EtalonApi {
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

/** Any direct call fails the test — proves an operation went through the outbox instead, or was
 *  refused before ever reaching the network. */
private class PayFailingApi : PayStubApi()

private class PayRecordingApi : PayStubApi() {
    val calls = mutableListOf<String>()
    var row = PaymentRowDto(id = "p1", orderId = "o1", amount = "1000000", method = "CASH", status = "PENDING_CONFIRMATION", recordedAt = "2026-01-01T00:00:00Z")

    override suspend fun recordPayment(body: PaymentRecordRequest, idempotencyKey: String): PaymentRowDto { calls += "recordPayment:${body.orderId}:${body.receiptUrls}:$idempotencyKey"; return row }
    override suspend fun confirmPayment(id: String, body: PaymentConfirmRequest): PaymentRowDto { calls += "confirmPayment:$id"; return row }
    override suspend fun rejectPayment(id: String, body: PaymentRejectRequest): PaymentRowDto { calls += "rejectPayment:$id:${body.reason}"; return row }
    override suspend fun handoverPayment(id: String): PaymentRowDto { calls += "handoverPayment:$id"; return row }
    override suspend fun payments(orderId: String?, status: String?): List<PaymentRowDto> { calls += "payments:$orderId:$status"; return listOf(row) }
}

private class PayNoopOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

/** An operator holding every permission. */
private val PAY_GRANTED = PermissionGate { true }

private fun input(orderId: String = "o1") = PaymentRecordInput(
    orderId = orderId, amount = Money.parse("1000000"), method = PaymentMethod.CASH, source = PaymentSource.IN_OFFICE_CASH,
)

private fun preparedImage(): PreparedImage {
    val file = File.createTempFile("receipt", ".jpg")
    file.writeBytes(byteArrayOf(1, 2, 3))
    return PreparedImage(file, 100, 100, file.length())
}

class PaymentsRepositoryTest {

    /** The single most important test in this slice: an online-only payment write is not a
     *  recoverable error to queue — a queued replay of `record`/`confirm`/`reject`/`handover` is
     *  a duplicate payment, because none of those routes carry server-side idempotency. */
    @Test fun `every online-only payment method leaves the outbox untouched`() = runTest {
        val outbox = PaySpyOutbox()
        val api = PayRecordingApi() // succeeds, so every call below actually runs to completion
        val repo = PaymentsRepository(api, outbox, PayNoopOrders(), PAY_GRANTED, mediaBase = "https://api.example")
        repo.record(input(), "idem-1").getOrThrow()
        repo.confirm("p1", null, null, null, null).getOrThrow()
        repo.reject("p1", "сабаб").getOrThrow()
        repo.handover("p1").getOrThrow()
        repo.queue(null).getOrThrow()
        repo.forOrder("o1").getOrThrow()
        assertTrue(outbox.calls.isEmpty(), "an online-only payment write must never be queued: ${outbox.calls}")
    }

    @Test fun `attaching a receipt is queued and never touches the network`() = runTest {
        val outbox = PaySpyOutbox()
        val repo = PaymentsRepository(PayFailingApi(), outbox, PayNoopOrders(), PAY_GRANTED, mediaBase = "https://api.example")
        val res = repo.attachReceipt("p1", "o1", preparedImage())
        assertTrue(res.isSuccess, res.exceptionOrNull()?.toString())
        assertEquals(listOf(OutboxKind.ADD_PAYMENT_RECEIPT), outbox.calls.map { it.kind })
        assertEquals("p1", outbox.calls.single().paymentId)
    }

    @Test fun `recording without payment record permission is refused before the network`() = runTest {
        // PayRecordingApi, not PayFailingApi: a FailingApi cannot tell a refusal from a network
        // error, since either way the call throws and the Result comes back failed. Only a
        // recording double that would have SUCCEEDED can prove the guard, not the exception, is
        // what stopped it.
        val api = PayRecordingApi()
        val repo = PaymentsRepository(api, PaySpyOutbox(), PayNoopOrders(), PermissionGate { it != "payment.record" }, mediaBase = "https://api.example")
        val r = repo.record(input(), "idem-1")
        assertTrue(r.isFailure)
        assertEquals(0, api.calls.size, "the guard must refuse before the network, not merely fail after it: ${api.calls}")
    }

    @Test fun `attaching a receipt without payment record permission is refused before it is queued`() = runTest {
        val outbox = PaySpyOutbox()
        val repo = PaymentsRepository(PayFailingApi(), outbox, PayNoopOrders(), PermissionGate { it != "payment.record" }, mediaBase = "https://api.example")
        val r = repo.attachReceipt("p1", "o1", preparedImage())
        assertTrue(r.isFailure, "the server would answer 403; queuing it anyway leaves an unclearable FAILED row")
        assertTrue(outbox.calls.isEmpty())
    }

    @Test fun `confirming without payment confirm permission is refused before the network`() = runTest {
        val api = PayRecordingApi() // a recording double, not FailingApi — see `recording without...`'s comment
        val repo = PaymentsRepository(api, PaySpyOutbox(), PayNoopOrders(), PermissionGate { it != "payment.confirm" }, mediaBase = "https://api.example")
        assertTrue(repo.confirm("p1", null, null, null, null).isFailure)
        assertTrue(repo.reject("p1", "сабаб").isFailure)
        assertEquals(0, api.calls.size, "neither confirm nor reject may reach the network: ${api.calls}")
    }

    @Test fun `handover is gated on payment record, not payment confirm`() = runTest {
        // The server route notes hand-over records custody, not approval, and uses the same
        // permission as recording cash — see PaymentsRepository.handover's doc.
        val deniedConfirm = PaymentsRepository(PayRecordingApi(), PaySpyOutbox(), PayNoopOrders(), PermissionGate { it != "payment.confirm" }, mediaBase = "https://api.example")
        assertTrue(deniedConfirm.handover("p1").isSuccess, "payment.confirm must not gate handover")

        val recordingApi = PayRecordingApi() // a recording double, not FailingApi — see `recording without...`'s comment
        val deniedRecord = PaymentsRepository(recordingApi, PaySpyOutbox(), PayNoopOrders(), PermissionGate { it != "payment.record" }, mediaBase = "https://api.example")
        assertTrue(deniedRecord.handover("p1").isFailure, "payment.record must gate handover")
        assertEquals(0, recordingApi.calls.size, "payment.record must refuse before the network: ${recordingApi.calls}")
    }

    @Test fun `record returns the new payment id and sends receiptUrls empty`() = runTest {
        val api = PayRecordingApi()
        val orders = PayNoopOrders()
        val id = PaymentsRepository(api, PaySpyOutbox(), orders, PAY_GRANTED, mediaBase = "https://api.example").record(input("o7"), "idem-7").getOrThrow()
        assertEquals("p1", id)
        assertEquals(listOf("recordPayment:o7:[]:idem-7"), api.calls, "the caller's Idempotency-Key must reach the request unchanged")
        assertEquals(listOf("o1"), orders.refreshed) // PayRecordingApi's row.orderId is fixed at "o1"
    }

    @Test fun `confirm reject and handover each refresh the order the response row names`() = runTest {
        val api = PayRecordingApi()
        val orders = PayNoopOrders()
        val repo = PaymentsRepository(api, PaySpyOutbox(), orders, PAY_GRANTED, mediaBase = "https://api.example")
        repo.confirm("p1", null, null, null, null).getOrThrow()
        repo.reject("p1", "сабаб").getOrThrow()
        repo.handover("p1").getOrThrow()
        assertEquals(listOf("o1", "o1", "o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = PaymentsRepository(PayFailingApi(), PaySpyOutbox(), PayNoopOrders(), PAY_GRANTED, mediaBase = "https://api.example").record(input(), "idem-1")
        assertTrue(res.isFailure)
    }

    // ── Mapper: driver-collected-with-shortfall vs. in-office-with-none ──────────

    @Test fun `a driver-collected row maps fromDriver true and a positive shortfall`() {
        val dto = PaymentRowDto(
            id = "p1", orderId = "o1", amount = "800000", method = "CASH", status = "PENDING_CONFIRMATION",
            recordedAt = "2026-01-01T00:00:00Z",
            collectedByDriver = NameDto("d1", "Aziz"),
            order = PaymentOrderRefDto("1042", PaymentOrderClientRefDto("Client"), PaymentOrderDispatchRefDto("1000000")),
        )
        val mapped = dto.toDomain("https://api.example")
        assertTrue(mapped.fromDriver)
        assertEquals(Money.parse("200000"), mapped.shortfall)
    }

    @Test fun `an in-office row has no shortfall even when expectedCollection is present`() {
        val dto = PaymentRowDto(
            id = "p2", orderId = "o1", amount = "500000", method = "CASH", status = "PENDING_CONFIRMATION",
            recordedAt = "2026-01-01T00:00:00Z",
            collectedByDriver = null,
            order = PaymentOrderRefDto("1042", PaymentOrderClientRefDto("Client"), PaymentOrderDispatchRefDto("1000000")),
        )
        val mapped = dto.toDomain("https://api.example")
        assertFalse(mapped.fromDriver)
        assertEquals(Money.ZERO, mapped.shortfall)
    }
}
