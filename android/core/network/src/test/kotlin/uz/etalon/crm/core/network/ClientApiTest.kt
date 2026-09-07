package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import uz.etalon.crm.core.network.dto.ClientWriteRequest

class ClientApiTest {
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

    @Test fun `clients list decodes each row's order count from _count`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":[{"id":"c1","name":"Client","phone":"998901112233","address":"Toshkent","_count":{"deals":0,"orders":4}}]}""",
        ))
        val list = api.clients(q = "Client")
        assertEquals(1, list.size)
        assertEquals(4, list[0].counts.orders)
        assertEquals("/api/clients?q=Client", server.takeRequest().path)
    }

    // POST /api/clients returns the raw Prisma row on both its create and its
    // dedup-by-phone branch — neither includes `_count` (see src/app/api/clients/route.ts).
    // A required field here would throw on every successful create; ClientRowDto defaults
    // `counts` instead.
    @Test fun `createClient decodes a response with no _count without throwing`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{"id":"c2","name":"Yangi","phone":"998901112244","address":null}}""",
        ))
        val row = api.createClient(ClientWriteRequest(name = "Yangi", phone = "998901112244"))
        assertEquals("c2", row.id)
        assertNull(row.address)
        assertEquals(0, row.counts.orders)
    }

    @Test fun `client detail decodes the order list with its money as a string`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{"id":"c1","name":"Client","phone":"998901112233","address":null,"notes":null,
              |"orders":[{"id":"o1","orderNumber":"A-1","status":"PLACED","totalPrice":"1250000.00","scheduledAt":"2026-09-10T00:00:00.000Z"}]}}"""
                .trimMargin().replace("\n", ""),
        ))
        val detail = api.client("c1")
        assertEquals(1, detail.orders.size)
        assertEquals("1250000.00", detail.orders[0].totalPrice)
        assertEquals("/api/clients/c1", server.takeRequest().path)
    }

    @Test fun `updateClient sends the write request and reads back the updated row`() = runTest {
        server.enqueue(ok(
            """{"ok":true,"data":{"id":"c1","name":"Yangi исм","phone":"998901112233","address":"Andijon"}}""",
        ))
        val row = api.updateClient("c1", ClientWriteRequest(name = "Yangi исм", phone = "998901112233", address = "Andijon"))
        assertEquals("Yangi исм", row.name)
        val rec = server.takeRequest()
        assertEquals("PATCH", rec.method)
        assertEquals("/api/clients/c1", rec.path)
        assertTrue(rec.body.readUtf8().contains(""""address":"Andijon""""))
    }
}
