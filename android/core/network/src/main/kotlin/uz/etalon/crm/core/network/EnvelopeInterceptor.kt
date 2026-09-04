package uz.etalon.crm.core.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/**
 * Rewrites {ok:true,data:T} bodies to just T so Retrofit's converter
 * deserialises T directly, and throws ApiException for {ok:false} on any
 * status or for non-JSON error responses. Twin of src/lib/fetcher.ts.
 * Binary responses (PDF, xlsx) pass through untouched.
 */
class EnvelopeInterceptor(private val json: Json) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val res = chain.proceed(chain.request())
        val type = res.header("Content-Type") ?: ""
        if (!type.contains("application/json")) {
            if (res.isSuccessful) return res
            res.close()
            throw ApiException(res.code, "Сервер хатоси · Server error")
        }
        val text = res.body.string()
        val env = runCatching { json.decodeFromString(Envelope.serializer(), text) }.getOrNull()
            // Not an envelope (legacy bare JSON): pass through untouched.
            ?: return res.newBuilder().body(text.toResponseBody(JSON_TYPE)).build()
        if (!env.ok) throw ApiException(res.code, env.error ?: "Сервер хатоси · Server error", env.details)
        val data: JsonElement = env.data ?: JsonNull
        return res.newBuilder().body(json.encodeToString(JsonElement.serializer(), data).toResponseBody(JSON_TYPE)).build()
    }
    private companion object { val JSON_TYPE = "application/json".toMediaType() }
}
