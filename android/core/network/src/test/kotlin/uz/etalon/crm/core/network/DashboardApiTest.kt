package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.math.BigDecimal

class DashboardApiTest {
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

    // The one thing this whole slice depends on: the dashboard sends money as a bare JSON
    // number (Math.round(...) server-side), not a decimal string like every other endpoint.
    // Double.toString(999999999999) would switch to scientific notation at this Decimal(14,2)
    // ceiling; BigDecimalSerializer's decode (JsonPrimitive.content -> BigDecimal) must not.
    @Test fun `a dashboard figure at the Decimal(14,2) ceiling decodes without scientific notation`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"todayDeliveries":{"count":0,"totalArea":0,"date":"2026-09-07","orders":[]},
              |"openDiscrepancies":{"count":0,"totalAmount":0},
              |"outstandingReceivables":{"total":999999999999,"orderCount":3},
              |"ordersByPaymentState":{"paid":0,"partial":0,"awaiting":0}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.dashboard()
        assertEquals(BigDecimal("999999999999"), dto.outstandingReceivables.total)
        assertEquals("999999999999", dto.outstandingReceivables.total.toPlainString())
        assertEquals(3, dto.outstandingReceivables.orderCount)
    }

    @Test fun `today's deliveries and their per-order area decode as exact BigDecimal, not Double`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"todayDeliveries":{"count":2,"totalArea":45.7,"date":"2026-09-07","orders":[
              |  {"id":"o1","orderNumber":"A-1","clientName":"Client","totalArea":20.3},
              |  {"id":"o2","orderNumber":"A-2","clientName":"Client 2","totalArea":25.4}
              |]},
              |"openDiscrepancies":{"count":1,"totalAmount":150000},
              |"outstandingReceivables":{"total":2000000,"orderCount":1},
              |"ordersByPaymentState":{"paid":5,"partial":2,"awaiting":1}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.dashboard()
        assertEquals(2, dto.todayDeliveries.orders.size)
        assertEquals(BigDecimal("45.7"), dto.todayDeliveries.totalArea)
        assertEquals(BigDecimal("20.3"), dto.todayDeliveries.orders[0].totalArea)
        assertEquals(BigDecimal("150000"), dto.openDiscrepancies.totalAmount)
        assertEquals(5, dto.ordersByPaymentState.paid)
        assertEquals("/api/dashboard", server.takeRequest().path)
    }

    // DashboardPayload carries far more than these four fields (trends, the payment donut, top
    // clients — Phase 2's owner editorial Home). ignoreUnknownKeys must let the rest through
    // unread rather than failing decode.
    @Test fun `unmodelled dashboard fields do not break the decode`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"bookedThisMonth":{"total":9999999,"orderCount":10,"periodStart":"2026-09-01","periodEnd":"2026-09-30","trend":null},
              |"topCustomers":[{"id":"c1","name":"Client","totalCollected":500000,"orderCount":2}],
              |"todayDeliveries":{"count":0,"totalArea":0,"date":"2026-09-07","orders":[]},
              |"openDiscrepancies":{"count":0,"totalAmount":0},
              |"outstandingReceivables":{"total":0,"orderCount":0,"trend":null},
              |"ordersByPaymentState":{"paid":0,"partial":0,"awaiting":0}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.dashboard()
        assertEquals(BigDecimal.ZERO, dto.todayDeliveries.totalArea)
    }
}
