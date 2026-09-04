package uz.etalon.crm.feature.auth

import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.network.ApiException

/**
 * A 401 from a credential check (login PIN, current PIN on change-PIN) means "wrong
 * credential", not "session expired" — the generic `toAppError()` mapping collapses every
 * 401 to `AppError.Unauthorized`'s fixed "Сессия тугади" message, so show the server's own
 * bilingual message instead. Falls back to the generic mapping for any other throwable.
 */
internal fun Throwable.credentialErrorMessage(): String = (this as? ApiException)?.uzbekMessage ?: toAppError().message
