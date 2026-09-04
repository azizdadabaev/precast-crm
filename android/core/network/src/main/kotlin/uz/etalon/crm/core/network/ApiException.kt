package uz.etalon.crm.core.network

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException

class ApiException(val status: Int, val error: String, val details: JsonElement? = null) : IOException(error) {
    /** Server strings are "Uzbek · English"; the UI shows the Uzbek half. */
    val uzbekMessage: String get() = error.split(" · ").first().trim()
    /** Machine code such as INBOX_LOCKED, PHONE_BELONGS_TO_OTHER, BLENDER_OFFLINE. */
    val code: String? get() = runCatching { details?.jsonObject?.get("code")?.jsonPrimitive?.content }.getOrNull()
}
