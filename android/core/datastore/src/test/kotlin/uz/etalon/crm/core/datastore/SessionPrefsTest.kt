package uz.etalon.crm.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.IOException

/** DataStore reports a corrupt or unreadable file by throwing into `data`. */
private class BrokenDataStore : DataStore<Preferences> {
    override val data: Flow<Preferences> = flow { throw IOException("corrupt preferences file") }
    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences) = emptyPreferences()
}

class SessionPrefsTest {
    /** These flows are read on the boot path; an escaping IOException would hang the splash forever. */
    @Test fun `a broken preferences read degrades to no stored session instead of throwing`() = runTest {
        val prefs = SessionPrefs(BrokenDataStore())
        assertNull(prefs.lastMe.first())
        assertNull(prefs.lastLoginName.first())
        assertNull(prefs.fcmToken.first())
    }
}
