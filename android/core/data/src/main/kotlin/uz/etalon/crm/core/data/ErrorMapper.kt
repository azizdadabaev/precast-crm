package uz.etalon.crm.core.data

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

fun Throwable.toAppError(): AppError = when (this) {
    is ApiException -> when (status) {
        401 -> AppError.Unauthorized
        403 -> AppError.Forbidden(uzbekMessage)
        422 -> AppError.Validation(
            if (error == "Validation failed") "Маълумот нотўғри" else uzbekMessage,
            runCatching {
                details!!.jsonObject["fieldErrors"]!!.jsonObject.mapValues { (_, v) -> v.jsonArray.first().jsonPrimitive.content }
            }.getOrDefault(emptyMap()),
        )
        409 -> AppError.Conflict(uzbekMessage, code)
        else -> AppError.Server(uzbekMessage, status)
    }
    is IOException -> AppError.Network("Интернет йўқ")
    else -> AppError.Server(message ?: "Хатолик", 0)
}
