package uz.etalon.crm.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import uz.etalon.crm.core.model.OrdersView
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** Persists the Orders tab's Рўйхат/Жадвал switch (R11), restored on open. Shares the same
 *  `DataStore<Preferences>` [SessionPrefs] uses (`DataStoreModule.sessionDataStore`) under its
 *  own key, rather than a second file. */
@Singleton
class OrdersPrefs @Inject constructor(private val store: DataStore<Preferences>) {
    private val view = stringPreferencesKey("orders_view")

    /** Same degrade-on-read-failure shape as [SessionPrefs.safeData] — the boot path must never
     *  hang behind a corrupt preferences file. */
    private val safeData: Flow<Preferences> = store.data.catch { e ->
        if (e is IOException) emit(emptyPreferences()) else throw e
    }

    /** A value this app never wrote (a future enum member, or a corrupt file) degrades to
     *  [OrdersView.LIST] rather than crash the screen that reads it. */
    val ordersView: Flow<OrdersView> = safeData.map { p ->
        p[view]?.let { name -> runCatching { OrdersView.valueOf(name) }.getOrNull() } ?: OrdersView.LIST
    }

    suspend fun setOrdersView(v: OrdersView) { store.edit { it[view] = v.name } }
}
