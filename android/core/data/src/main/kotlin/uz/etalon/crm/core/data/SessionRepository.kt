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

    suspend fun login(loginName: String, pin: String): Result<Me> = runCatching {
        val res = api.login(LoginRequest(loginName.trim(), pin))
        tokens.set(res.token)
        prefs.setLastLoginName(loginName.trim())
        res.user.toMe().also { _me.value = it; prefs.setLastMe(it) }
    }

    /** Cold start. A 401 here clears the token (AuthInterceptor) and the caller shows the PIN screen. */
    suspend fun bootstrap(): Result<Bootstrap> =
        runCatching { api.bootstrap().toDomain().also { _me.value = it.me; prefs.setLastMe(it.me) } }

    suspend fun changePin(currentPin: String, newPin: String): Result<Unit> = runCatching {
        api.changePin(ChangePinRequest(currentPin, newPin))
        _me.value = _me.value?.copy(mustChangePassword = false)
    }

    /** Local sign-out: the mobile JWT has no server-side logout; device unregistration is DeviceRepository's job.
     *  db.wipe() clears the Room tables; orders.clearCache() clears OrdersRepository's in-memory outcome maps —
     *  both are needed or the next signed-in user could briefly see the previous user's cached orders.
     *  setLastMe(null) drops the cached identity so the offline fallback cannot resurrect this session. */
    suspend fun signOut() { tokens.clear(); _me.value = null; prefs.setLastMe(null); db.wipe(); orders.clearCache() }
}
