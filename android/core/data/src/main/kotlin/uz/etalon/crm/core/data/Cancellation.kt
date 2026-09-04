package uz.etalon.crm.core.data

import kotlinx.coroutines.CancellationException

/**
 * Like [runCatching], but never swallows coroutine cancellation. A plain `runCatching` around a
 * suspending call turns "the caller's scope was cancelled" (a screen left, a ViewModel cleared)
 * into a `Result.failure` that the UI then reports as a real error, and it breaks structured
 * concurrency by resuming work whose job is already dead.
 */
inline fun <T> runCatchingCancellable(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (e: CancellationException) {
    throw e
} catch (t: Throwable) {
    Result.failure(t)
}
