package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
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
import uz.etalon.crm.core.network.dto.*
import uz.etalon.crm.core.testing.FakeEtalonApi
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
private open class PayStubApi : FakeEtalonApi()

/** Any direct call fails the test — proves an operation went through the outbox instead, or was
 *  refused before ever reaching the network. */
private class PayFailingApi : PayStubApi()

private class PayRecordingApi : PayStubApi() {
    val calls = mutableListOf<String>()
    var row = PaymentRowDto(id = "p1", orderId = "o1", amount = "1000000", method = "CASH", status = "PENDING_CONFIRMATION", recordedAt = "2026-01-01T00:00:00Z")

    override suspend fun recordPayment(body: PaymentRecordRequest, idempotencyKey: String): PaymentRowDto { calls += "recordPayment:${body.orderId}:${body.receiptUrls}:$idempotencyKey"; return row }
    override suspend fun confirmPayment(id: String, body: PaymentConfirmRequest): PaymentRowDto { calls += "confirmPayment:$id"; return row }
    override suspend fun rejectPayment(id: String, body: PaymentRejectRequest): PaymentRowDto { calls += "rejectPayment:$id:${body.reason}"; return row }
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
     *  recoverable error to queue. `confirm` and `reject` carry no server-side idempotency at all,
     *  and `record` — though now wrapped — is validated against a live cap another operator can
     *  move, so a queued replay of any of them is a decision taken against stale figures. */
    @Test fun `every online-only payment method leaves the outbox untouched`() = runTest {
        val outbox = PaySpyOutbox()
        val api = PayRecordingApi() // succeeds, so every call below actually runs to completion
        val repo = PaymentsRepository(api, outbox, PayNoopOrders(), PAY_GRANTED, mediaBase = "https://api.example")
        repo.record(input(), "idem-1").getOrThrow()
        repo.confirm("p1", null, null, null, null).getOrThrow()
        repo.reject("p1", "сабаб").getOrThrow()
        repo.queue(null).getOrThrow()
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

    @Test fun `record returns the new payment id and sends receiptUrls empty`() = runTest {
        val api = PayRecordingApi()
        val orders = PayNoopOrders()
        val id = PaymentsRepository(api, PaySpyOutbox(), orders, PAY_GRANTED, mediaBase = "https://api.example").record(input("o7"), "idem-7").getOrThrow()
        assertEquals("p1", id)
        assertEquals(listOf("recordPayment:o7:[]:idem-7"), api.calls, "the caller's Idempotency-Key must reach the request unchanged")
        assertEquals(listOf("o1"), orders.refreshed) // PayRecordingApi's row.orderId is fixed at "o1"
    }

    @Test fun `confirm and reject each refresh the order the response row names`() = runTest {
        val api = PayRecordingApi()
        val orders = PayNoopOrders()
        val repo = PaymentsRepository(api, PaySpyOutbox(), orders, PAY_GRANTED, mediaBase = "https://api.example")
        repo.confirm("p1", null, null, null, null).getOrThrow()
        repo.reject("p1", "сабаб").getOrThrow()
        assertEquals(listOf("o1", "o1"), orders.refreshed)
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

    /**
     * `GET /api/payments` deliberately includes the ORDER's unlinked receipts — bot-forwarded
     * proof that arrived before any payment row existed. Dropping them left the confirm sheet
     * showing an owner less evidence than the web's dialog does while they decide about cash.
     */
    @Test fun `the order's unlinked receipts survive the mapping, after the payment's own`() {
        val dto = PaymentRowDto(
            id = "p3", orderId = "o1", amount = "500000", method = "CASH", status = "PENDING_CONFIRMATION",
            recordedAt = "2026-01-01T00:00:00Z",
            receipts = listOf(ReceiptDto("r1", "/uploads/receipts/linked.jpg")),
            order = PaymentOrderRefDto(
                "1042", PaymentOrderClientRefDto("Client"), null,
                receipts = listOf(ReceiptDto("r2", "/uploads/inbox/forwarded.jpg")),
            ),
        )
        val mapped = dto.toDomain("https://api.example")
        assertEquals(listOf("https://api.example/uploads/receipts/linked.jpg"), mapped.receiptUrls)
        assertEquals(listOf("https://api.example/uploads/inbox/forwarded.jpg"), mapped.orderReceiptUrls)
        assertEquals(
            listOf(
                "https://api.example/uploads/receipts/linked.jpg",
                "https://api.example/uploads/inbox/forwarded.jpg",
            ),
            mapped.allReceiptUrls,
            "the sheet shows the payment's own proof first, then the order-level proof",
        )
    }
}
