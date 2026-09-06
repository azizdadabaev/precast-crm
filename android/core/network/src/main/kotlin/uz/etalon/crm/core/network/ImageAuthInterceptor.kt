package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * The bearer token for image loads.
 *
 * Loaded/delivery photos come back as `/uploads/…` paths on the same origin as the API, and the
 * image loader had no credential at all — against a local dev server, where the Next.js middleware
 * guards those paths, every thumbnail simply failed to render.
 *
 * Deliberately NOT [AuthInterceptor]: that one calls `onUnauthorized()` on a 401, which clears the
 * session and drops the operator on the PIN screen. A photo that will not load must never do that.
 * A 401 here is left to the image loader, which shows the placeholder.
 *
 * This is the client half of a two-sided fix. The server currently honours a bearer token on the
 * API path only, not on the uploads path, so in the local dev setup these requests still come back
 * 401 until the middleware's matcher is widened. In production Caddy serves the uploads path
 * publicly, which is why the gap was invisible there — and is its own open item.
 */
class ImageAuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        // A caller that pinned its own credential keeps it, same rule as AuthInterceptor.
        if (req.header("Authorization") != null) return chain.proceed(req)
        val token = runBlocking { tokens.token() } ?: return chain.proceed(req)
        return chain.proceed(req.newBuilder().header("Authorization", "Bearer $token").build())
    }
}
