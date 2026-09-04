package uz.etalon.crm.core.network

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Guards the interceptor ORDER wired in NetworkModule.okHttp, not just the
 * individual interceptors: EnvelopeInterceptor added first (outer),
 * AuthInterceptor second (inner). If that were reversed, AuthInterceptor
 * would never see a 401 -- EnvelopeInterceptor throws ApiException for any
 * {ok:false} body first, and that throw propagates out of chain.proceed()
 * before AuthInterceptor's post-proceed 401 check runs.
 */
class InterceptorChainTest {
    private lateinit var server: MockWebServer

    private class FakeTokens(var t: String?) : TokenProvider {
        var unauthorizedCalls = 0
        override suspend fun token() = t
        override suspend fun onUnauthorized() { unauthorizedCalls++; t = null }
    }

    @BeforeEach fun setUp() { server = MockWebServer().also { it.start() } }
    @AfterEach fun tearDown() = server.shutdown()

    private fun clientFor(tokens: TokenProvider) = OkHttpClient.Builder()
        .addInterceptor(EnvelopeInterceptor(EtalonJson.create()))
        .addInterceptor(AuthInterceptor(tokens))
        .build()

    @Test fun `a 401 envelope throws ApiException and clears the session exactly once`() {
        server.enqueue(
            MockResponse().setResponseCode(401)
                .setBody("""{"ok":false,"error":"Авторизация талаб қилинади · Authentication required"}""")
                .addHeader("Content-Type", "application/json")
        )
        val tokens = FakeTokens("abc")
        val client = clientFor(tokens)
        val e = assertThrows(ApiException::class.java) {
            client.newCall(Request.Builder().url(server.url("/api/orders")).build()).execute()
        }
        assertEquals(401, e.status)
        assertEquals(1, tokens.unauthorizedCalls)
    }

    @Test fun `a successful envelope carries the Bearer header and does not clear the session`() {
        server.enqueue(
            MockResponse().setBody("""{"ok":true,"data":{"n":1}}""").addHeader("Content-Type", "application/json")
        )
        val tokens = FakeTokens("abc")
        val client = clientFor(tokens)
        client.newCall(Request.Builder().url(server.url("/api/orders")).build()).execute()
        assertEquals("Bearer abc", server.takeRequest().getHeader("Authorization"))
        assertEquals(0, tokens.unauthorizedCalls)
    }
}
