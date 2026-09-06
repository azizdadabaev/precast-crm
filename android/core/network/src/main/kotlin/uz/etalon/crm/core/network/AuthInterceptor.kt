package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/** No Authorization header at all: these run before there is a session. */
private val PUBLIC_PATHS = listOf("/api/auth/login", "/api/health")

/** Authenticated (the header is still sent), but a 401 here means "wrong credential", not
 *  "session expired": the change-PIN endpoint answers a wrong *current* PIN with a 401. Clearing
 *  the token would sign the user out of the whole app instead of letting the screen show
 *  «Жорий PIN нотўғри». */
private val NO_SESSION_CLEAR_PATHS = listOf("/api/users/me/password")

class AuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val isPublic = PUBLIC_PATHS.any { req.url.encodedPath == it }
        val keepsSession = isPublic || NO_SESSION_CLEAR_PATHS.any { req.url.encodedPath == it }
        // A caller that set its own Authorization header pinned a specific credential on purpose —
        // the outbox drain does, so a row claimed under one operator cannot be sent under the next
        // one's token if the session changes hands mid-drain. Reading the store here and calling
        // .header() would silently replace it. Public paths never carry one.
        val pinned = !isPublic && req.header("Authorization") != null
        val token = if (isPublic || pinned) null else runBlocking { tokens.token() }
        val authed = if (token != null) req.newBuilder().header("Authorization", "Bearer $token").build() else req
        val res = chain.proceed(authed)
        if (res.code == 401 && !keepsSession) runBlocking { tokens.onUnauthorized() }
        return res
    }
}
