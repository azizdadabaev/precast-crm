package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.GET

@Serializable data class Thing(val n: Int)
interface ThingApi { @GET("/api/thing") suspend fun thing(): Thing }

class EnvelopeInterceptorTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ThingApi
    @BeforeEach fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = Json { ignoreUnknownKeys = true }
        api = Retrofit.Builder().baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(EnvelopeInterceptor(json)).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(ThingApi::class.java)
    }
    @AfterEach fun tearDown() = server.shutdown()

    @Test fun `unwraps ok true data`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"data":{"n":7}}""").addHeader("Content-Type", "application/json"))
        assertEquals(Thing(7), api.thing())
    }
    @Test fun `ok false on HTTP 200 throws ApiException with the Uzbek half`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":false,"error":"Рухсат йўқ · Permission denied (order.view)"}""").addHeader("Content-Type", "application/json"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(200, e.status)
        assertEquals("Рухсат йўқ", e.uzbekMessage)
    }
    @Test fun `HTTP 403 with details code is exposed`() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"ok":false,"error":"Хабарлар қулфланган · Inbox locked","details":{"code":"INBOX_LOCKED"}}""").addHeader("Content-Type", "application/json"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(403, e.status)
        assertEquals("INBOX_LOCKED", e.code)
    }
    @Test fun `non-JSON 5xx becomes ApiException with status`() = runTest {
        server.enqueue(MockResponse().setResponseCode(502).setBody("Bad Gateway"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(502, e.status)
    }
}
