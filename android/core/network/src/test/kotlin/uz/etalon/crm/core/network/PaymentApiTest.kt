package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import uz.etalon.crm.core.network.dto.DiscrepancyUpdateRequest
import uz.etalon.crm.core.network.dto.PaymentConfirmRequest
import uz.etalon.crm.core.network.dto.PaymentRecordRequest
import uz.etalon.crm.core.network.dto.PaymentRejectRequest
import java.math.BigDecimal

class PaymentApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: EtalonApi

    @BeforeEach fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = EtalonJson.create()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(EnvelopeInterceptor(json)).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(EtalonApi::class.java)
    }
    @AfterEach fun tearDown() = server.shutdown()

    private fun ok(body: String) =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    private fun filePart(): MultipartBody.Part =
        MultipartBody.Part.createFormData(
            "file", "receipt.jpg",
            byteArrayOf(0xFF.toByte(), 0xD8.toByte()).toRequestBody("image/jpeg".toMediaType()),
        )

    // The five mutation responses below (record/confirm/reject/handover/updateDiscrepancy) use the
    // bare Prisma row exactly as the server sends it — no "order" key at all, since none of those
    // routes `include` it. A fixture that fabricates an "order" object here would hide a decode
    // crash that happens for real after the money has already landed server-side.

    @Test fun `recording a payment sends the amount as a bare exact decimal`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"1234.56","method":"CASH","status":"PENDING_CONFIRMATION","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        val res = api.recordPayment(PaymentRecordRequest(orderId = "o1", amount = BigDecimal("1234.56"), method = "CASH", source = "IN_OFFICE_CASH"))
        assertNull(res.order) // the bare row has no order key — must decode, not throw
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains("\"amount\":1234.56"), sent) // bare, unquoted, exact
        assertFalse(sent.contains("\"amount\":\"1234.56\""), sent)
    }

    @Test fun `a very large amount is not rendered in scientific notation`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"0","method":"CASH","status":"CONFIRMED","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        api.recordPayment(PaymentRecordRequest(orderId = "o1", amount = BigDecimal("999999999999.99"), method = "CASH", source = "IN_OFFICE_CASH"))
        assertTrue(server.takeRequest().body.readUtf8().contains("\"amount\":999999999999.99"))
    }

    @Test fun `recordPayment sends every optional field, including a null-safe default source`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"500.00","method":"CASH","status":"PENDING_CONFIRMATION","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        api.recordPayment(PaymentRecordRequest(orderId = "o1", amount = BigDecimal("500.00"), method = "CASH", source = "FROM_DRIVER_AT_DELIVERY", collectedByDriverId = "d1", notes = "изоҳ"))
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains(""""source":"FROM_DRIVER_AT_DELIVERY""""), sent)
        assertTrue(sent.contains(""""collectedByDriverId":"d1""""), sent)
        assertTrue(sent.contains(""""handOverNow":false"""), sent) // encodeDefaults = true must still send it
    }

    @Test fun `a receipt upload carries the caller's pinned token and its idempotency key`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"r1","imageUrl":"/uploads/receipts/x.jpg"}}"""))
        api.addPaymentReceipt("p1", filePart(), "key-123", "Bearer tok")
        val rec = server.takeRequest()
        assertEquals("/api/payments/p1/receipts", rec.path)
        assertEquals("key-123", rec.getHeader("Idempotency-Key"))
        assertEquals("Bearer tok", rec.getHeader("Authorization"))
        assertTrue(rec.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
    }

    @Test fun `uploadReceipt also carries the pinned token and posts to the top-level route`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"url":"/uploads/receipts/x.jpg"}}"""))
        val res = api.uploadReceipt(filePart(), "key-9", "Bearer pinned")
        assertEquals("/uploads/receipts/x.jpg", res.url)
        val rec = server.takeRequest()
        assertEquals("/api/payments/upload-receipt", rec.path)
        assertEquals("key-9", rec.getHeader("Idempotency-Key"))
        assertEquals("Bearer pinned", rec.getHeader("Authorization"))
    }

    @Test fun `an ok-false body on a 200 is still a failure`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":false,"error":"Сумма ортиқча · Amount exceeds remaining"}""").addHeader("Content-Type", "application/json"))
        val t = assertThrows<ApiException> { api.recordPayment(PaymentRecordRequest("o1", BigDecimal("1"), "CASH", "IN_OFFICE_CASH")) }
        assertEquals("Сумма ортиқча", t.uzbekMessage)
    }

    @Test fun `payments list is filtered by orderId and status query params`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":[]}"""))
        api.payments(orderId = "o1", status = "PENDING_CONFIRMATION")
        assertEquals("/api/payments?orderId=o1&status=PENDING_CONFIRMATION", server.takeRequest().path)
    }

    @Test fun `payments list decodes chain-of-custody rows whose actors were never set`() = runTest {
        // The list route IS include-based and does send order — a genuinely empty to-one
        // relation (no collectedByDriver/recordedBy/handedOverTo/confirmedBy, no dispatch) comes
        // back as an explicit JSON null there, not a missing key; the decoder must tolerate both
        // that and the mutation responses' missing key the same way.
        server.enqueue(ok("""{"ok":true,"data":[{"id":"p1","orderId":"o1","amount":"60.00","method":"CASH","status":"CONFIRMED","recordedAt":"2026-09-02T00:00:00.000Z","collectedByDriver":null,"recordedBy":null,"handedOverTo":null,"confirmedBy":null,"order":{"orderNumber":"B-2026-09-0001","client":{"name":"А"},"dispatch":null}}]}"""))
        val list = api.payments()
        val p = list.single()
        assertNull(p.collectedByDriver)
        assertNull(p.recordedBy)
        assertNull(p.handedOverTo)
        assertNull(p.confirmedBy)
        assertNull(p.order?.dispatch)
        assertEquals("60.00", p.amount)
        assertTrue(p.receipts.isEmpty())
    }

    @Test fun `confirmPayment posts the adjustment and discrepancy fields as bare json`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"450000.00","method":"CASH","status":"CONFIRMED","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        val res = api.confirmPayment("p1", PaymentConfirmRequest(amount = BigDecimal("450000.00"), adjustmentNote = "recount", discrepancyAction = "TRACK", discrepancyNote = "short by 50000"))
        assertEquals("CONFIRMED", res.status)
        assertNull(res.order)
        val rec = server.takeRequest()
        assertEquals("/api/payments/p1/confirm", rec.path)
        val sent = rec.body.readUtf8()
        assertTrue(sent.contains(""""amount":450000.00"""), sent)
        assertTrue(sent.contains(""""discrepancyAction":"TRACK""""), sent)
    }

    @Test fun `confirmPayment with no adjustment sends an empty-ish body without amount`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"1.00","method":"CASH","status":"CONFIRMED","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        api.confirmPayment("p1", PaymentConfirmRequest())
        val sent = server.takeRequest().body.readUtf8()
        assertFalse(sent.contains("\"amount\""), sent) // explicitNulls = false drops the unset amount
    }

    @Test fun `rejectPayment posts the reason and reads back the rejection`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"1.00","method":"CASH","status":"REJECTED","recordedAt":"2026-09-07T10:00:00.000Z","rejectionReason":"noto'g'ri summa"}}"""))
        val res = api.rejectPayment("p1", PaymentRejectRequest("noto'g'ri summa"))
        assertEquals("REJECTED", res.status)
        assertEquals("noto'g'ri summa", res.rejectionReason)
        val rec = server.takeRequest()
        assertEquals("/api/payments/p1/reject", rec.path)
        assertTrue(rec.body.readUtf8().contains(""""reason":"noto'g'ri summa""""))
    }

    @Test fun `handoverPayment posts with no body to the handover path`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"p1","orderId":"o1","amount":"1.00","method":"CASH","status":"PENDING_CONFIRMATION","recordedAt":"2026-09-07T10:00:00.000Z"}}"""))
        api.handoverPayment("p1")
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        assertEquals("/api/payments/p1/handover", rec.path)
    }

    @Test fun `discrepancies list is filtered by status and decodes money as strings`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":[{"id":"d1","orderId":"o1","expectedAmount":"500000.00","receivedAmount":"450000.00","shortfall":"50000.00","status":"OPEN","reportedAt":"2026-09-07T10:00:00.000Z","order":{"orderNumber":"B-2026-09-0001","totalPrice":"1000000.00","confirmedPaid":"450000.00","paymentState":"PARTIALLY_PAID","client":{"id":"c1","name":"А","phone":"998901112233"}}}]}"""))
        val list = api.discrepancies(status = "OPEN")
        assertEquals("/api/discrepancies?status=OPEN", server.takeRequest().path)
        val d = list.single()
        assertEquals("50000.00", d.shortfall)
        assertNull(d.driver)
        assertNull(d.resolvedBy)
    }

    @Test fun `updateDiscrepancy patches the status and decodes the bare row it actually gets back`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"d1","orderId":"o1","expectedAmount":"500000.00","receivedAmount":"450000.00","shortfall":"50000.00","status":"RESOLVED_RECOVERED","reportedAt":"2026-09-07T10:00:00.000Z","resolutionNote":"customer paid the rest"}}"""))
        val res = api.updateDiscrepancy("d1", DiscrepancyUpdateRequest(status = "RESOLVED_RECOVERED", resolutionNote = "customer paid the rest"))
        assertEquals("RESOLVED_RECOVERED", res.status)
        assertNull(res.order) // PATCH returns the bare tx.discrepancy.update row — no include
        val rec = server.takeRequest()
        assertEquals("PATCH", rec.method)
        assertEquals("/api/discrepancies/d1", rec.path)
        assertTrue(rec.body.readUtf8().contains(""""resolutionNote":"customer paid the rest""""))
    }
}
