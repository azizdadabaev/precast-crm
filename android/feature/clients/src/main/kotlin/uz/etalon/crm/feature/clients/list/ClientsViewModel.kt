package uz.etalon.crm.feature.clients.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.ClientSummary
import javax.inject.Inject

/** `POST /api/clients` server-side; the add action is offered only to an operator holding it. */
internal const val CLIENT_CREATE = "client.create"

/**
 * How long the field waits after the last keystroke before it asks the server. Long enough that
 * typing a nine-digit phone is one request rather than nine, short enough that an operator who
 * has stopped typing does not notice it. Exposed so the test measures the real figure.
 */
const val CLIENT_SEARCH_DEBOUNCE_MS = 300L

data class ClientsUiState(
    /** Exactly what the operator typed — never normalised, never stripped. See [ClientsViewModel]. */
    val query: String = "",
    val items: List<ClientSummary> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    /** The raw error from the last fetch, kept (not only its message) so [isOffline] is derived
     *  from its real type — the same shape ConfirmQueueUiState and DriversUiState use. */
    val lastRefreshError: AppError? = null,
    val canCreate: Boolean = false,
    /**
     * "Not yet known" is not "no". The guards below read [canCreate], which fails closed; this
     * says whether that `false` is an answer or merely the default, so nothing about the
     * permission is rendered before it is known.
     */
    val permissionsResolved: Boolean = false,
) {
    /** Never true alongside [error] and never while loading. An empty client list beside an error
     *  banner reads as "this customer is not in the CRM" — and an operator who believes that
     *  creates a second row for a customer who already has one. */
    val showEmptyState: Boolean get() = items.isEmpty() && !loading && error == null

    /** Create and edit are both online-only — neither client route is `withIdempotency`-wrapped
     *  server-side, so neither may be queued. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network

    /** Shown only once the answer is known, so the button never appears and then vanishes. */
    val showAddAction: Boolean get() = permissionsResolved && canCreate
}

fun interface ClientsListUseCase {
    suspend operator fun invoke(query: String?): Result<List<ClientSummary>>
}

fun interface ClientsPermissionUseCase {
    suspend operator fun invoke(action: String): Boolean
}

/**
 * Finding a customer. Phone is this product's unique customer identity — names may legitimately
 * repeat, so two rows reading «Навоий Build» are two different customers and never a problem to
 * flag.
 *
 * The typed query goes to the server VERBATIM (trimmed only). `GET /api/clients?q=` feeds it to
 * `phoneMatchForms`, which strips it to digits and matches the trailing 4, 7, 9 or 12 of the
 * stored number, *and* to a `name contains` in parallel. So a phone pasted with any separators a
 * human uses already works, while stripping the separators here would break searching by name.
 */
open class ClientsViewModel(
    list: ClientsListUseCase,
    permissions: ClientsPermissionUseCase,
) : ViewModel() {
    private val loadClients = list
    private val can = permissions

    private val _state = MutableStateFlow(ClientsUiState())
    val state: StateFlow<ClientsUiState> = _state.asStateFlow()

    /** The one in-flight fetch, whether debounced or explicit. Held so a new keystroke replaces a
     *  search that has not gone out yet, and so an explicit refresh cancels a pending one rather
     *  than racing it. */
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            val create = can(CLIENT_CREATE)
            _state.update { it.copy(canCreate = create, permissionsResolved = true) }
        }
        load(delayFirst = false)
    }

    fun setQuery(v: String) {
        if (_state.value.query == v) return
        _state.update { it.copy(query = v) }
        load(delayFirst = true)
    }

    /** Pull-to-refresh and the error banner's retry: goes out now, on the query as it stands. */
    fun refresh() = load(delayFirst = false)

    private fun load(delayFirst: Boolean) {
        loadJob?.cancel()
        _state.update { it.copy(loading = true) }
        loadJob = viewModelScope.launch {
            if (delayFirst) delay(CLIENT_SEARCH_DEBOUNCE_MS)
            // A blank field is "no filter", not a search for the empty string.
            val q = _state.value.query.trim().ifBlank { null }
            loadClients(q).fold(
                onSuccess = { rows ->
                    _state.update { it.copy(items = rows, loading = false, error = null, lastRefreshError = null) }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    _state.update { it.copy(loading = false, error = e.message, lastRefreshError = e) }
                },
            )
        }
    }
}

@HiltViewModel
class HiltClientsViewModel @Inject constructor(
    clients: ClientsRepository,
    permissions: PermissionGate,
) : ClientsViewModel(
    list = ClientsListUseCase { q -> clients.list(q) },
    permissions = ClientsPermissionUseCase { action -> permissions.can(action) },
)
