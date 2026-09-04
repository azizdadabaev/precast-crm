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

    @Test fun `login is never given a stale token`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}"))
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(FakeTokens("old"))).build()
        client.newCall(Request.Builder().url(server.url("/api/auth/login")).build()).execute()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }
}
