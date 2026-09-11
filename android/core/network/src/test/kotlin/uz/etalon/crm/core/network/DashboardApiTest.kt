package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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

    // Task 1's own additions: recentOrders, collectedThisMonth's trend, collectedByMonth, and the
    // richer today-row fields. All arrive as bare JSON numbers on the money-shaped ones, same trap
    // as the rest of this endpoint.
    @Test fun `recentOrders, collectedThisMonth's trend and collectedByMonth decode as BigDecimal, and a today row carries the richer fields`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"todayDeliveries":{"count":1,"totalArea":18.4,"date":"2026-09-07","orders":[
              |  {"id":"o1","orderNumber":"A-1","clientName":"Client","totalArea":18.4,"status":"DISPATCHED","clientAddress":"Навоий 1","totalPrice":18420000,"remaining":18420000}
              |]},
              |"openDiscrepancies":{"count":0,"totalAmount":0},
              |"outstandingReceivables":{"total":0,"orderCount":0},
              |"ordersByPaymentState":{"paid":0,"partial":0,"awaiting":0},
              |"recentOrders":[
              |  {"id":"r1","orderNumber":"B-1","clientName":"C1","status":"PLACED","scheduledAt":"2026-09-08T00:00:00Z","totalPrice":500000,"remaining":100000}
              |],
              |"collectedThisMonth":{"total":13500000,"paymentCount":4,"periodStart":"2026-09-01","periodEnd":"2026-09-30","trend":{"deltaPct":8.2,"direction":"up","polarity":"positive"}},
              |"collectedByMonth":[
              |  {"month":"2026-08","collected":9000000,"paymentCount":3},
              |  {"month":"2026-09","collected":13500000,"paymentCount":4}
              |]
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.dashboard()
        val today = dto.todayDeliveries.orders.single()
        assertEquals("DISPATCHED", today.status)
        assertEquals("Навоий 1", today.clientAddress)
        assertEquals(BigDecimal("18420000"), today.totalPrice)
        assertEquals(BigDecimal("18420000"), today.remaining)
        assertEquals(1, dto.recentOrders.size)
        assertEquals(BigDecimal("500000"), dto.recentOrders.single().totalPrice)
        assertEquals(BigDecimal("13500000"), dto.collectedThisMonth?.total)
        assertEquals(BigDecimal("8.2"), dto.collectedThisMonth?.trend?.deltaPct)
        assertEquals("up", dto.collectedThisMonth?.trend?.direction)
        assertEquals(2, dto.collectedByMonth.size)
        assertEquals(BigDecimal("9000000"), dto.collectedByMonth[0].collected)
    }

    // The pre-Task-1 shape: no recentOrders/collectedThisMonth/collectedByMonth keys, and a today
    // row with none of its new fields. Every one of them must fall back to its default rather than
    // failing the decode.
    @Test fun `a pre-Task-1 payload with none of the new keys still decodes, with defaults`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"todayDeliveries":{"count":1,"totalArea":10,"date":"2026-09-07","orders":[
              |  {"id":"o1","orderNumber":"A-1","clientName":"Client","totalArea":10}
              |]},
              |"openDiscrepancies":{"count":0,"totalAmount":0},
              |"outstandingReceivables":{"total":0,"orderCount":0},
              |"ordersByPaymentState":{"paid":0,"partial":0,"awaiting":0}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.dashboard()
        val today = dto.todayDeliveries.orders.single()
        assertEquals("PLACED", today.status)
        assertNull(today.clientAddress)
        assertEquals(BigDecimal.ZERO, today.totalPrice)
        assertEquals(BigDecimal.ZERO, today.remaining)
        assertEquals(emptyList<Any>(), dto.recentOrders)
        assertNull(dto.collectedThisMonth)
        assertEquals(emptyList<Any>(), dto.collectedByMonth)
    }
}
