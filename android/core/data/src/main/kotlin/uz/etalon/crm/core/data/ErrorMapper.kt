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
    // NOT dead code: DeviceLocation.kt deliberately throws a plain IllegalStateException whose
    // message IS the Uzbek string to show (location_permission_needed / location_failed), and
    // the delivery-location screen relies on that message reaching the user here unchanged —
    // see DeliveryLocationViewModelTest's device-location/resolver failure cases. Any exception
    // reaching this branch is expected, by that convention, to already carry Uzbek text; the
    // null-message case is the only one this fallback exists for.
    //
    // That convention is not enforced by the type system — core/calc's CalculationError, for
    // one, carries an internal ENGLISH validation message and would leak it here unchanged were
    // it ever thrown from a screen. The calculator IS wired up now, but no CalculationError
    // reaches this branch from it: `recomputeRow` catches every one of them itself and answers a
    // null result (a row mid-typing is expected traffic, not an error), and nothing else in the
    // calculator calls the engine directly. So this stays a dormant gap rather than a live one;
    // closing it needs a marker distinguishing "already Uzbek, safe to show" throwables from
    // everything else, which is a wider change than this fallback line.
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
