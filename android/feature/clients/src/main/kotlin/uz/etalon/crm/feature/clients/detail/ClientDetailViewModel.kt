package uz.etalon.crm.feature.clients.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.ClientDetail

/** `PATCH /api/clients/{id}` server-side; the edit action is offered only to a holder. */
internal const val CLIENT_EDIT = "client.edit"

data class ClientDetailUiState(
    val client: ClientDetail? = null,
    val loading: Boolean = true,
    val error: String? = null,
    /** Kept as the error itself, not only its message, so [isOffline] reads its real type. */
    val lastRefreshError: AppError? = null,
    val canEdit: Boolean = false,
    /** "Not yet known" is not "no" — see ClientsUiState.permissionsResolved for the same rule. */
    val permissionsResolved: Boolean = false,
) {
    /** `PATCH /api/clients/{id}` is not `withIdempotency`-wrapped, so an edit may never be
     *  queued: with no signal the sheet would offer a save that is refused rather than sent. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network

    val showEditAction: Boolean get() = permissionsResolved && canEdit

    /** The client loaded and has never ordered anything — distinct from "we could not read it",
     *  which shows the error banner and no order section at all. */
    val showNoOrders: Boolean get() = client?.orders?.isEmpty() == true
}

fun interface ClientDetailUseCase {
    suspend operator fun invoke(id: String): Result<ClientDetail>
}

fun interface ClientDetailPermissionUseCase {
    suspend operator fun invoke(action: String): Boolean
}

/** One customer: who they are, the number to call them on, and what they have ordered. */
open class ClientDetailViewModel(
    private val clientId: String,
    load: ClientDetailUseCase,
    permissions: ClientDetailPermissionUseCase,
) : ViewModel() {
    private val loadClient = load
    private val can = permissions

    private val _state = MutableStateFlow(ClientDetailUiState())
    val state: StateFlow<ClientDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val edit = can(CLIENT_EDIT)
            _state.update { it.copy(canEdit = edit, permissionsResolved = true) }
        }
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            loadClient(clientId).fold(
                onSuccess = { c ->
                    _state.update { it.copy(client = c, loading = false, error = null, lastRefreshError = null) }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    _state.update { it.copy(loading = false, error = e.message, lastRefreshError = e) }
                },
            )
        }
    }
}

/**
 * Nav 3 hands the key to the entry rather than to a `SavedStateHandle`, so the client id arrives
 * through assisted injection — the same shape `OrderDetailViewModel` uses.
 */
@HiltViewModel(assistedFactory = HiltClientDetailViewModel.Factory::class)
class HiltClientDetailViewModel @AssistedInject constructor(
    @Assisted clientId: String,
    clients: ClientsRepository,
    permissions: PermissionGate,
) : ClientDetailViewModel(
    clientId = clientId,
    load = ClientDetailUseCase { id -> clients.detail(id) },
    permissions = ClientDetailPermissionUseCase { action -> permissions.can(action) },
) {
    @AssistedFactory
    interface Factory {
        fun create(clientId: String): HiltClientDetailViewModel
    }
}
