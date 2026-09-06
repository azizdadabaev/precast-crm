package uz.etalon.crm.feature.orders.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.runCatchingCancellable
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource

@HiltViewModel(assistedFactory = OrderDetailViewModel.Factory::class)
class OrderDetailViewModel @AssistedInject constructor(
    private val repo: OrdersRepository,
    private val outbox: OutboxRepository,
    private val logistics: LogisticsRepository,
    @Assisted val orderId: String,
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(orderId: String): OrderDetailViewModel
    }

    val state: StateFlow<Resource<OrderDetail>> = repo.detail(orderId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    /** This operator's own queue for this order. Nothing here triggers a detail refresh: the
     *  upload worker already pulls the order fresh after every send that lands, and a second
     *  refresh driven off the queue emptying would only race it. */
    val pending: StateFlow<List<PendingUpload>> = outbox.observeForOrder(orderId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    init { refresh() }

    fun refresh() { viewModelScope.launch { repo.refreshDetail(orderId) } }

    fun retryUpload(id: String) = runAction { runCatchingCancellable { outbox.retry(id) } }
    fun cancelUpload(id: String) = runAction { runCatchingCancellable { outbox.cancel(id) } }

    /** Online only — the delete route carries no server-side idempotency, so it is never queued.
     *  LogisticsRepository re-fetches the order on success, which is what drops the tile. */
    fun deletePhoto(photoId: String) = runAction { logistics.deleteLoadedPhoto(orderId, photoId) }

    private fun runAction(call: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            call().fold(
                onSuccess = { _actionError.value = null },
                onFailure = { t -> _actionError.value = t.toAppError().message },
            )
        }
    }
}
