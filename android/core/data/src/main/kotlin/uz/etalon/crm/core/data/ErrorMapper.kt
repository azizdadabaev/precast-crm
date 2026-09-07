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

/**
 * Whether a failed write means the server has already moved past the state the screen was acting
 * on: 404 the row is gone, 409 someone else got there first, 422 the row is no longer in the
 * state the route accepts ("Тўлов аллақачон CONFIRMED"). Retrying such a call is hopeless — what
 * the screen is holding is stale, and the fix is to re-read the list.
 *
 * A network failure is the opposite case: the state is fine and the retry is the whole point, so
 * the sheet stays open with what was typed.
 */
val AppError.isConflictClass: Boolean
    get() = when (this) {
        is AppError.Conflict, is AppError.Validation -> true
        is AppError.Server -> status == 404
        else -> false
    }
