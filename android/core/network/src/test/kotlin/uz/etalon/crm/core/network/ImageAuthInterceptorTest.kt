package uz.etalon.crm.core.network

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ImageAuthInterceptorTest {
    private class FakeTokens(var t: String?) : TokenProvider {
        var unauthorizedCalls = 0
        override suspend fun token() = t
        override suspend fun onUnauthorized() { unauthorizedCalls++; t = null }
    }

    @Test fun `a photo request carries the operator's token`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("jpegbytes"))
        val client = OkHttpClient.Builder().addInterceptor(ImageAuthInterceptor(FakeTokens("abc"))).build()

        client.newCall(Request.Builder().url(server.url("/uploads/orders/o1/loaded-1.jpg")).build()).execute()

        assertEquals("Bearer abc", server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }

    @Test fun `with nobody signed in the request goes out bare`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("jpegbytes"))
        val client = OkHttpClient.Builder().addInterceptor(ImageAuthInterceptor(FakeTokens(null))).build()

        client.newCall(Request.Builder().url(server.url("/uploads/x.jpg")).build()).execute()

        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }

    /**
     * The reason this is not [AuthInterceptor]. A thumbnail that 401s must not sign the operator
     * out: they would be bounced to the PIN screen — losing the screen they were standing on, mid
     * delivery — because a picture failed to load.
     */
    @Test fun `a 401 on a photo never clears the session`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setResponseCode(401))
        val tokens = FakeTokens("abc")
        val client = OkHttpClient.Builder().addInterceptor(ImageAuthInterceptor(tokens)).build()

        client.newCall(Request.Builder().url(server.url("/uploads/x.jpg")).build()).execute()

        assertEquals(0, tokens.unauthorizedCalls)
        assertEquals("abc", tokens.t)
        server.shutdown()
    }
}
