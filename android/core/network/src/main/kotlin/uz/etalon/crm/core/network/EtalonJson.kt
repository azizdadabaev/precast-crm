package uz.etalon.crm.core.network

import kotlinx.serialization.json.Json

/**
 * The single Json configuration shared by NetworkModule and tests, so
 * request/response (de)serialization behaves identically everywhere.
 * encodeDefaults = true matters for requests such as LoginRequest.client
 * and DeviceRegisterRequest.platform: their default values must still be
 * sent, not silently dropped, or the server falls back to its own default
 * ("web") or rejects the request as missing a required field.
 */
object EtalonJson {
    fun create(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }
}
