package uz.etalon.crm.core.datastore

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import uz.etalon.crm.core.network.TokenProvider
import javax.inject.Inject
import javax.inject.Singleton

interface TokenStore {
    suspend fun get(): String?
    suspend fun set(token: String)
    suspend fun clear()
    val isLoggedIn: Flow<Boolean>

    /** The inbox unlock token. The server gives it a 12 h life; it is simply re-requested after. */
    suspend fun inboxUnlock(): String?
    suspend fun setInboxUnlock(token: String)
}

class InMemoryTokenStore : TokenStore {
    private val state = MutableStateFlow<String?>(null)
    private var unlock: String? = null
    override suspend fun get() = state.value
    override suspend fun set(token: String) { state.value = token }
    override suspend fun clear() { state.value = null; unlock = null }
    override val isLoggedIn: Flow<Boolean> = state.map { it != null }
    override suspend fun inboxUnlock() = unlock
    override suspend fun setInboxUnlock(token: String) { unlock = token }
}

/** JWT at rest, encrypted with an Android Keystore master key (spec §4.7). */
@Singleton
class KeystoreTokenStore @Inject constructor(context: Context) : TokenStore {
    private val prefs = EncryptedSharedPreferences.create(
        context, "etalon_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    private val state = MutableStateFlow(prefs.getString(KEY, null))
    override suspend fun get() = state.value
    override suspend fun set(token: String) = withContext(Dispatchers.IO) { prefs.edit().putString(KEY, token).apply(); state.value = token }
    // Signing out drops the unlock with the session: the next operator on this handset must not
    // inherit an inbox somebody else opened.
    override suspend fun clear() = withContext(Dispatchers.IO) {
        prefs.edit().remove(KEY).remove(UNLOCK_KEY).apply()
        state.value = null
    }
    override val isLoggedIn: Flow<Boolean> = state.map { it != null }
    override suspend fun inboxUnlock(): String? = withContext(Dispatchers.IO) { prefs.getString(UNLOCK_KEY, null) }
    override suspend fun setInboxUnlock(token: String) = withContext(Dispatchers.IO) {
        prefs.edit().putString(UNLOCK_KEY, token).apply()
    }
    private companion object { const val KEY = "jwt"; const val UNLOCK_KEY = "inbox_unlock" }
}

/** Bridges the store to the network layer's TokenProvider. */
class StoreTokenProvider @Inject constructor(private val store: TokenStore) : TokenProvider {
    override suspend fun token() = store.get()
    override suspend fun onUnauthorized() = store.clear()
    override suspend fun inboxUnlockToken() = store.inboxUnlock()
}
