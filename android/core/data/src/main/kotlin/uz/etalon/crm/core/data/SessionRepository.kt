package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.data.mapper.toMe
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.model.Bootstrap
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.ChangePinRequest
import uz.etalon.crm.core.network.dto.LoginRequest
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepository @Inject constructor(
    private val api: EtalonApi, private val tokens: TokenStore, private val prefs: SessionPrefs, private val db: EtalonDatabase,
    private val orders: OrdersRepository, private val outbox: OutboxRepository,
) {
    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()
    val isLoggedIn: Flow<Boolean> = tokens.isLoggedIn

    /** The last authenticated user, surviving process death; see SessionPrefs.lastMe. */
    val lastMe: Flow<Me?> = prefs.lastMe

    /** Wipes again before this session's first authenticated fetch. `signOut()` below clears
     *  orders and the outbox in two separate DAO transactions; a process death between them
     *  (or between the wipe and the file cleanup) would strand the previous user's rows —
     *  their tokens are already cleared by then, so the app lands back here, on login(), and
     *  nothing has scheduled the outbox yet. Repeating the wipe is idempotent and cheap on the
     *  normal path (both tables are already empty), and closes that gap unconditionally. */
    suspend fun login(loginName: String, pin: String): Result<Me> = runCatchingCancellable {
        db.wipe().forEach { path -> runCatching { File(path).delete() } }
        val res = api.login(LoginRequest(loginName.trim(), pin))
        tokens.set(res.token)
        prefs.setLastLoginName(loginName.trim())
        res.user.toMe().also { _me.value = it; prefs.setLastMe(it) }
    }

    /** Cold start. A 401 here clears the token (AuthInterceptor) and the caller shows the PIN screen. */
    suspend fun bootstrap(): Result<Bootstrap> =
        runCatchingCancellable { api.bootstrap().toDomain().also { _me.value = it.me; prefs.setLastMe(it.me) } }

    suspend fun changePin(currentPin: String, newPin: String): Result<Unit> = runCatchingCancellable {
        api.changePin(ChangePinRequest(currentPin, newPin))
        _me.value = _me.value?.copy(mustChangePassword = false)
    }

    /** Local sign-out: the mobile JWT has no server-side logout; device unregistration is DeviceRepository's job.
     *  db.wipe() clears the Room tables; orders.clearCache()/outbox.clearCache() clear each repository's own
     *  in-memory guard (OrdersRepository's outcome maps; OutboxRepository's epoch) — all of it is needed or
     *  the next signed-in user could briefly see the previous user's cached orders, or Task 7's worker could
     *  upload a photo/cash figure the previous user queued under whoever signs in next.
     *  setLastMe(null) drops the cached identity so the offline fallback cannot resurrect this session.
     *  orders.clearCache() and outbox.clearCache() must both run BEFORE db.wipe(): a refresh or an enqueue
     *  already in flight captured the old epoch, and bumping it first guarantees that write is rejected
     *  instead of landing in the table db.wipe() just emptied.
     *  db.wipe() also returns the outbox's queued JPEG paths: the DAO only owns the table, so deleting the
     *  actual files is this repository's job. A missing or undeletable file must not fail sign-out. */
    suspend fun signOut() {
        tokens.clear(); _me.value = null; prefs.setLastMe(null); orders.clearCache(); outbox.clearCache()
        val orphanedFiles = db.wipe()
        orphanedFiles.forEach { path -> runCatching { File(path).delete() } }
    }
}
