package uz.etalon.crm.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.OrdersView
import java.io.IOException

/** An in-memory `DataStore<Preferences>`, the same shape `SessionSignOutOrderTest`'s
 *  `FakeDataStore` uses for a real `SessionPrefs` without touching disk. */
private class InMemoryPrefsStore : DataStore<Preferences> {
    private val state = MutableStateFlow<Preferences>(emptyPreferences())
    override val data: Flow<Preferences> = state
    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        val updated = transform(state.value)
        state.value = updated
        return updated
    }
}

private class BrokenOrdersDataStore : DataStore<Preferences> {
    override val data: Flow<Preferences> = flow { throw IOException("corrupt preferences file") }
    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences) = emptyPreferences()
}

class OrdersPrefsTest {
    @Test fun `defaults to LIST when nothing has been stored`() = runTest {
        assertEquals(OrdersView.LIST, OrdersPrefs(InMemoryPrefsStore()).ordersView.first())
    }

    @Test fun `round-trips a stored view`() = runTest {
        val prefs = OrdersPrefs(InMemoryPrefsStore())
        prefs.setOrdersView(OrdersView.CALENDAR)
        assertEquals(OrdersView.CALENDAR, prefs.ordersView.first())
        prefs.setOrdersView(OrdersView.LIST)
        assertEquals(OrdersView.LIST, prefs.ordersView.first())
    }

    @Test fun `a value this app never wrote degrades to LIST instead of crashing`() = runTest {
        val store = InMemoryPrefsStore()
        // Simulate a future enum member (or a corrupt string) already sitting in the file.
        store.updateData { it.toMutablePreferences().apply { this[stringPreferencesKey("orders_view")] = "GANTT" } }
        assertEquals(OrdersView.LIST, OrdersPrefs(store).ordersView.first())
    }

    @Test fun `a broken preferences read degrades to LIST instead of throwing`() = runTest {
        assertEquals(OrdersView.LIST, OrdersPrefs(BrokenOrdersDataStore()).ordersView.first())
    }
}
