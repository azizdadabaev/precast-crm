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
    private val orders: OrdersRepository,
) {
    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()
    val isLoggedIn: Flow<Boolean> = tokens.isLoggedIn

    /** The last authenticated user, surviving process death; see SessionPrefs.lastMe. */
    val lastMe: Flow<Me?> = prefs.lastMe

    /**
     * Everything that could still belong to somebody else is destroyed here, before this session
     * has a token — that token is what a drain or an authenticated fetch would run under.
     *
     * The order cache is cleared unconditionally: `signOut()` already does it, but a process
     * death between its two DAO calls would strand the previous user's rows, and the app lands
     * back here with the tokens already gone. Repeating it is idempotent and cheap.
     *
     * The outbox is filtered by ownership instead of emptied. A queued delivery proof belongs to
     * the operator who took it: a *different* operator signing in destroys it (rows and JPEGs),
     * while the same operator signing back in — the routine path after a 401, since there is no
     * token refresh — keeps it and sends it.
     */
    suspend fun login(loginName: String, pin: String): Result<Me> = runCatchingCancellable {
        val res = api.login(LoginRequest(loginName.trim(), pin))
        db.clearOrderCache()
        db.purgeOutboxOwnedByOthers(res.user.id).forEach { path -> runCatching { File(path).delete() } }
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
     *  db.clearOrderCache() empties the cached orders; orders.clearCache() drops OrdersRepository's own
     *  in-memory outcome maps — both are needed or the next signed-in user could briefly see the previous
     *  user's orders. setLastMe(null) drops the cached identity so the offline fallback cannot resurrect this
     *  session, and it is also what leaves the outbox with no current owner: the worker claims nothing until
     *  someone signs in.
     *  orders.clearCache() must run BEFORE db.clearOrderCache(): a refresh already in flight captured the old
     *  epoch, and bumping it first guarantees that write is rejected instead of landing in the table
     *  db.clearOrderCache() just emptied.
     *  The outbox is deliberately left intact — a queued upload belongs to the operator who made it and
     *  survives their session ending; `login()` destroys it only for a *different* operator. */
    suspend fun signOut() {
        tokens.clear(); _me.value = null; prefs.setLastMe(null); orders.clearCache()
        db.clearOrderCache()
    }
}
