package uz.etalon.crm.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** The server's {ok,data} / {ok:false,error,details} envelope (src/lib/api.ts). */
@Serializable
data class Envelope(val ok: Boolean, val data: JsonElement? = null, val error: String? = null, val details: JsonElement? = null)
