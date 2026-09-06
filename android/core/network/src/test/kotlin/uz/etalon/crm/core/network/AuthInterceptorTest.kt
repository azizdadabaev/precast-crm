package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AuthInterceptorTest {
    private class FakeTokens(var t: String?) : TokenProvider {
        var unauthorizedCalls = 0
        override suspend fun token() = t
        override suspend fun onUnauthorized() { unauthorizedCalls++; t = null }
    }

    @Test fun `adds the Bearer header when a token exists and skips it when not`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}")); server.enqueue(MockResponse().setBody("{}"))
        val tokens = FakeTokens("abc")
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokens)).build()
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertEquals("Bearer abc", server.takeRequest().getHeader("Authorization"))
        tokens.t = null
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }

    @Test fun `a 401 clears the session once`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":"Unauthorized"}"""))
        val tokens = FakeTokens("abc")
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokens)).build()
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertEquals(1, tokens.unauthorizedCalls)
        server.shutdown()
    }

    /** The outbox drain pins the token it started with onto each upload, so a row claimed under one
     *  operator cannot go out under the next one's credential. The interceptor reads the store live,
     *  once per call, so it must leave an Authorization header the caller already set. */
    @Test fun `an Authorization header the caller set is never replaced`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}"))
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(FakeTokens("current"))).build()
        client.newCall(
            Request.Builder().url(server.url("/api/orders/o1/load")).header("Authorization", "Bearer pinned").build()
        ).execute()
        val sent = server.takeRequest()
        assertEquals("Bearer pinned", sent.getHeader("Authorization"))
        assertEquals(1, sent.headers.values("Authorization").size, "exactly one Authorization header may be sent")
        server.shutdown()
    }

    @Test fun `login is never given a stale token`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}"))
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(FakeTokens("old"))).build()
        client.newCall(Request.Builder().url(server.url("/api/auth/login")).build()).execute()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }
}
