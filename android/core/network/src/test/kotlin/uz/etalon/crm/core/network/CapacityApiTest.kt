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

/** `GET /api/orders/capacity` (`src/app/api/orders/capacity/route.ts`) decode, both with and
 *  without the server's `thresholds` — an older server omits them and the caller (`CapacityRepository`)
 *  is the one that falls back, so this only pins that the DTO itself tolerates their absence. */
class CapacityApiTest {
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

    // The one thing this whole slice depends on: totalArea travels as a bare JSON number with two
    // decimal places (`Math.round(x * 100) / 100` server-side), never a quoted string, and must
    // decode to the exact BigDecimal rather than round-tripping through a Double.
    @Test fun `a day's totalArea decodes as the exact BigDecimal, not a Double`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"days":[{"date":"2026-09-12","totalArea":285.4,"totalOrders":3,"totalBlocks":1216}],
              |"thresholds":{"low":300,"moderate":450,"heavy":600}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.capacity(from = "2026-08-31", to = "2026-10-11")
        val day = dto.days.single()
        assertEquals("2026-09-12", day.date)
        assertEquals(BigDecimal("285.4"), day.totalArea)
        assertEquals("285.4", day.totalArea.toPlainString())
        assertEquals(3, day.totalOrders)
        assertEquals(1216, day.totalBlocks)
        assertEquals(BigDecimal("300"), dto.thresholds?.low)
        assertEquals(BigDecimal("450"), dto.thresholds?.moderate)
        assertEquals(BigDecimal("600"), dto.thresholds?.heavy)
        assertEquals("/api/orders/capacity?from=2026-08-31&to=2026-10-11", server.takeRequest().path)
    }

    // An older server that has not shipped CAPACITY_THRESHOLDS yet: the DTO itself must not fail
    // to decode just because the key is missing.
    @Test fun `a response with no thresholds decodes with thresholds null`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{"days":[]}}""",
        ))
        val dto = api.capacity(from = "2026-08-31", to = "2026-10-11")
        assertEquals(emptyList<Any>(), dto.days)
        assertNull(dto.thresholds)
    }

    @Test fun `missing dates are simply omitted, not sent as zeros`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{
              |"days":[{"date":"2026-09-02","totalArea":204,"totalOrders":5,"totalBlocks":800}],
              |"thresholds":{"low":300,"moderate":450,"heavy":600}
              |}}"""
                .trimMargin().replace("\n", ""),
        ))
        val dto = api.capacity(from = "2026-08-31", to = "2026-10-11")
        assertEquals(1, dto.days.size)
        assertEquals(BigDecimal("204"), dto.days.single().totalArea)
    }
}
