package uz.etalon.crm.feature.logistics.drivers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DriversRepository
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.Driver
import javax.inject.Inject

data class DriversUiState(
    val drivers: List<Driver> = emptyList(),
    val activeOnly: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
) {
    /** Never true alongside [error]: an empty list next to an error banner reads as "no drivers"
     *  when the truth is "couldn't check" — the same rule ShipmentsUiState follows. */
    val showEmptyState: Boolean get() = drivers.isEmpty() && !loading && error == null
}

fun interface DriversListUseCase { suspend operator fun invoke(activeOnly: Boolean): Result<List<Driver>> }
fun interface DriverCreateUseCase { suspend operator fun invoke(name: String, phone: String, notes: String?): Result<Driver> }
fun interface DriverSetActiveUseCase { suspend operator fun invoke(id: String, active: Boolean): Result<Driver> }

open class DriversViewModel(
    list: DriversListUseCase,
    create: DriverCreateUseCase,
    setActive: DriverSetActiveUseCase,
) : ViewModel() {
    // Renamed internally so the public create()/setActive() below never shadows the constructor
    // parameter they call through — the same defensive rename LoadTruckViewModel's submit uses.
    private val listDrivers = list
    private val createDriver = create
    private val setDriverActive = setActive

    private val _state = MutableStateFlow(DriversUiState())
    val state: StateFlow<DriversUiState> = _state.asStateFlow()

    init { refresh() }

    /** activeOnly is a server-side filter (the repository sends it as a query param), so toggling
     *  it re-fetches rather than filtering a cached list client-side. */
    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            listDrivers(_state.value.activeOnly).fold(
                onSuccess = { rows -> _state.update { it.copy(drivers = rows, loading = false, error = null) } },
                onFailure = { t -> _state.update { it.copy(loading = false, error = t.toAppError().message) } },
            )
        }
    }

    fun setActiveOnly(v: Boolean) {
        _state.update { it.copy(activeOnly = v) }
        refresh()
    }

    fun create(name: String, phone: String, notes: String?) {
        if (name.isBlank()) {
            _state.update { it.copy(error = "Исмни киритинг") }
            return
        }
        if (_state.value.loading) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            createDriver(name.trim(), phone, notes?.trim()?.ifEmpty { null }).fold(
                onSuccess = { refresh() },
                onFailure = { t -> _state.update { it.copy(loading = false, error = t.toAppError().message) } },
            )
        }
    }

    fun setActive(id: String, active: Boolean) {
        if (_state.value.loading) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            setDriverActive(id, active).fold(
                onSuccess = { refresh() },
                onFailure = { t -> _state.update { it.copy(loading = false, error = t.toAppError().message) } },
            )
        }
    }
}

/** `canManage` is read once at construction, exactly like every Hilt subclass in this slice reads
 *  `imagePrep` for the route to forward — the permission does not change within a screen's
 *  lifetime, and the route this feeds is itself gated on `driver.view` in the nav graph (Task 15). */
@HiltViewModel
class HiltDriversViewModel @Inject constructor(
    repo: DriversRepository,
    session: SessionRepository,
) : DriversViewModel(
    list = DriversListUseCase { activeOnly -> repo.list(activeOnly) },
    create = DriverCreateUseCase { name, phone, notes -> repo.create(name, phone, notes) },
    setActive = DriverSetActiveUseCase { id, active -> repo.setActive(id, active) },
) {
    val canManage: Boolean = session.me.value?.can("driver.manage") ?: false
}
