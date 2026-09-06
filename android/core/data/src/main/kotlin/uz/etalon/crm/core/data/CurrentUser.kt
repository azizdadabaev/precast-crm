package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.first
import uz.etalon.crm.core.datastore.SessionPrefs
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Who an outbox row belongs to. The enqueue path stamps this id on the row and `:core:sync`'s
 * worker claims only rows carrying it, so a queued photo and cash figure can only ever be
 * uploaded under the token of the operator who captured them.
 */
fun interface CurrentUser {
    /** The signed-in operator's id, or null when nobody is signed in. */
    suspend fun id(): String?
}

/**
 * Whether the signed-in operator holds a permission — the client-side mirror of the server's
 * `withPermission(...)` wrapper.
 *
 * It exists so a repository can refuse to QUEUE work the server would answer 403 to. A rejected
 * queued upload is not a recoverable error: `outcomeFor` maps a 4xx to a permanent Fail, and the
 * failed row then blocks the order's action bar until the operator deletes the photo they took.
 * Nothing is signed in ⇒ false; deciding otherwise would let an unauthenticated caller queue.
 */
fun interface PermissionGate {
    suspend fun can(action: String): Boolean
}

/**
 * Reads the identity `SessionPrefs` persists at every login/bootstrap and clears on sign-out.
 * That store, not `SessionRepository.me`, is the source of truth here: the worker can run in a
 * process started long after the last screen was closed, where the in-memory `me` is null but
 * the session (and its queued uploads) is still perfectly valid.
 */
@Singleton
class SessionCurrentUser @Inject constructor(private val prefs: SessionPrefs) : CurrentUser, PermissionGate {
    override suspend fun id(): String? = prefs.lastMe.first()?.id
    override suspend fun can(action: String): Boolean = prefs.lastMe.first()?.can(action) == true
}
