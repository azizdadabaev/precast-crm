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
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Driver
import javax.inject.Inject

private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

data class DriversUiState(
    val drivers: List<Driver> = emptyList(),
    val activeOnly: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    /** The raw error from the last `refresh()`, kept (not just its message) so [isOffline] can be
     *  derived from its real type — exactly how ShipmentsUiState derives its own offline signal
     *  from the kept `Resource.Error`, rather than from a fact-losing boolean. */
    val lastRefreshError: AppError? = null,
) {
    /** Never true alongside [error]: an empty list next to an error banner reads as "no drivers"
     *  when the truth is "couldn't check" — the same rule ShipmentsUiState follows. */
    val showEmptyState: Boolean get() = drivers.isEmpty() && !loading && error == null
    /** Driver create/activate/deactivate are all online-only (see LogisticsRepository's online-only
     *  section for the same rule on dispatch) — none of them is server-side idempotent, so none may
     *  run, or be attempted, while the last known state of the connection is "no network". */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network
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
                onSuccess = { rows -> _state.update { it.copy(drivers = rows, loading = false, error = null, lastRefreshError = null) } },
                onFailure = { t ->
                    val appError = t.toAppError()
                    _state.update { it.copy(loading = false, error = appError.message, lastRefreshError = appError) }
                },
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
        // Phone is this product's unique client key (see reference_client_identity_rule): a short
        // value would still pass the repository's create() call and get stored as somebody's unique
        // phone. The screen always sends "998" + the 9 local digits it collected, so the whole
        // string must be exactly 12 digits, not merely non-blank.
        if (phone.length != 12 || !phone.all(Char::isDigit)) {
            _state.update { it.copy(error = "Телефон рақами 9 та рақамдан иборат бўлиши керак") }
            return
        }
        if (_state.value.loading) return
        if (_state.value.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
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
        if (_state.value.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            setDriverActive(id, active).fold(
                onSuccess = { refresh() },
                onFailure = { t -> _state.update { it.copy(loading = false, error = t.toAppError().message) } },
            )
        }
    }
}

/**
 * `canManage` collects `SessionRepository.lastMe` — the persisted identity that survives a
 * bootstrap failure — instead of snapshotting `session.me.value` once. `me` (in-memory) is only
 * ever set from inside a *successful* `bootstrap()`/`login()`; on an offline cold start,
 * `MainViewModel` falls back to `lastMe` for the signed-in `Me` it shows but `session.me` itself is
 * never populated, so a one-time read of `.value` at construction would freeze `canManage` at
 * `false` for this ViewModel's entire life, even once a later bootstrap succeeds and `lastMe`
 * updates. Collecting the flow keeps it live for exactly that recovery. The route this feeds is
 * itself gated on `driver.view` in the nav graph (Task 15).
 */
@HiltViewModel
class HiltDriversViewModel @Inject constructor(
    repo: DriversRepository,
    session: SessionRepository,
) : DriversViewModel(
    list = DriversListUseCase { activeOnly -> repo.list(activeOnly) },
    create = DriverCreateUseCase { name, phone, notes -> repo.create(name, phone, notes) },
    setActive = DriverSetActiveUseCase { id, active -> repo.setActive(id, active) },
) {
    private val _canManage = MutableStateFlow(false)
    val canManage: StateFlow<Boolean> = _canManage.asStateFlow()

    init {
        viewModelScope.launch {
            session.lastMe.collect { me -> _canManage.value = me?.can("driver.manage") ?: false }
        }
    }
}
