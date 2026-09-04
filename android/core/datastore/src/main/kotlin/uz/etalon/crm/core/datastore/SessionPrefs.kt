package uz.etalon.crm.core.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

internal val Context.sessionDataStore by preferencesDataStore("session_prefs")

@Singleton
class SessionPrefs @Inject constructor(private val store: DataStore<Preferences>) {
    private val lastLogin = stringPreferencesKey("last_login_name")
    private val fcm = stringPreferencesKey("fcm_token")
    private val meId = stringPreferencesKey("me_id")
    private val meName = stringPreferencesKey("me_name")
    private val meRole = stringPreferencesKey("me_role")
    private val mePermissions = stringSetPreferencesKey("me_permissions")
    private val meMustChangePassword = booleanPreferencesKey("me_must_change_password")

    /** DataStore throws IOException *into* the flow when the file is unreadable or corrupt. These
     *  flows are read on the boot path (MainViewModel.init, LoginViewModel.init) where an escaping
     *  exception leaves the app stuck on the splash spinner forever — degrade to "nothing stored". */
    private val safeData: Flow<Preferences> = store.data.catch { e ->
        if (e is IOException) emit(emptyPreferences()) else throw e
    }

    val lastLoginName: Flow<String?> = safeData.map { it[lastLogin] }
    suspend fun setLastLoginName(v: String) { store.edit { it[lastLogin] = v } }
    val fcmToken: Flow<String?> = safeData.map { it[fcm] }
    suspend fun setFcmToken(v: String?) { store.edit { if (v == null) it.remove(fcm) else it[fcm] = v } }

    /** The last authenticated user. Kept so a bootstrap that fails on a flaky network can fall
     *  back to the cached identity instead of dumping the user back to the PIN screen. Cleared
     *  by signOut(), which also runs on the 401 path — a token the server rejected must not be
     *  able to resurrect a session. */
    val lastMe: Flow<Me?> = safeData.map { p ->
        val id = p[meId] ?: return@map null
        Me(
            id = id,
            name = p[meName].orEmpty(),
            role = Role.from(p[meRole].orEmpty()),
            permissions = p[mePermissions].orEmpty(),
            mustChangePassword = p[meMustChangePassword] ?: false,
        )
    }

    suspend fun setLastMe(me: Me?) {
        store.edit { p ->
            if (me == null) {
                p.remove(meId); p.remove(meName); p.remove(meRole); p.remove(mePermissions); p.remove(meMustChangePassword)
            } else {
                p[meId] = me.id
                p[meName] = me.name
                p[meRole] = me.role.name
                p[mePermissions] = me.permissions
                p[meMustChangePassword] = me.mustChangePassword
            }
        }
    }
}
