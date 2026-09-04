package uz.etalon.crm.core.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionDataStore by preferencesDataStore("session_prefs")

@Singleton
class SessionPrefs @Inject constructor(private val context: Context) {
    private val lastLogin = stringPreferencesKey("last_login_name")
    private val fcm = stringPreferencesKey("fcm_token")
    val lastLoginName: Flow<String?> = context.sessionDataStore.data.map { it[lastLogin] }
    suspend fun setLastLoginName(v: String) { context.sessionDataStore.edit { it[lastLogin] = v } }
    val fcmToken: Flow<String?> = context.sessionDataStore.data.map { it[fcm] }
    suspend fun setFcmToken(v: String?) { context.sessionDataStore.edit { if (v == null) it.remove(fcm) else it[fcm] = v } }
}
