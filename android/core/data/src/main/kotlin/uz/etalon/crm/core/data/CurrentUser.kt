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
 * Reads the identity `SessionPrefs` persists at every login/bootstrap and clears on sign-out.
 * That store, not `SessionRepository.me`, is the source of truth here: the worker can run in a
 * process started long after the last screen was closed, where the in-memory `me` is null but
 * the session (and its queued uploads) is still perfectly valid.
 */
@Singleton
class SessionCurrentUser @Inject constructor(private val prefs: SessionPrefs) : CurrentUser {
    override suspend fun id(): String? = prefs.lastMe.first()?.id
}
