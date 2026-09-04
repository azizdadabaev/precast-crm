package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

private val PUBLIC_PATHS = listOf("/api/auth/login", "/api/health")

class AuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val isPublic = PUBLIC_PATHS.any { req.url.encodedPath == it }
        val token = if (isPublic) null else runBlocking { tokens.token() }
        val authed = if (token != null) req.newBuilder().header("Authorization", "Bearer $token").build() else req
        val res = chain.proceed(authed)
        if (res.code == 401 && !isPublic) runBlocking { tokens.onUnauthorized() }
        return res
    }
}
