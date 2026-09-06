package uz.etalon.crm.feature.logistics.shipments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource

private val ADD_SHIPMENT_STATUSES = setOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED)

data class ShipmentsUiState(
    val resource: Resource<OrderDetail> = Resource.Loading(null),
    val actionError: String? = null,
    val busy: Boolean = false,
) {
    val order: OrderDetail? get() = resource.dataOrNull
    /** The only offline signal this screen has: a refresh that failed for lack of a network. */
    val isOffline: Boolean get() = (resource as? Resource.Error)?.error is AppError.Network
    val canAddShipment: Boolean get() = !busy && !isOffline && (order?.summary?.status?.let { it in ADD_SHIPMENT_STATUSES } ?: false)
}

@HiltViewModel(assistedFactory = ShipmentsViewModel.Factory::class)
class ShipmentsViewModel @AssistedInject constructor(
    private val orders: OrdersRepository,
    private val logistics: LogisticsRepository,
    @Assisted val orderId: String,
) : ViewModel() {
    @AssistedFactory
    interface Factory { fun create(orderId: String): ShipmentsViewModel }

    private val actionError = MutableStateFlow<String?>(null)
    private val busy = MutableStateFlow(false)

    val state: StateFlow<ShipmentsUiState> = combine(orders.detail(orderId), actionError, busy) { resource, err, isBusy ->
        ShipmentsUiState(resource, err, isBusy)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShipmentsUiState())

    init { refresh() }

    fun refresh() { viewModelScope.launch { orders.refreshDetail(orderId) } }

    fun addShipment() = runAction { logistics.createShipment(orderId) }
    fun deleteShipment(shipmentId: String) = runAction { logistics.deleteShipment(orderId, shipmentId) }
    fun deliverShipment(shipmentId: String) = runAction { logistics.deliverShipment(orderId, shipmentId) }

    private fun runAction(call: suspend () -> Result<Unit>) {
        if (busy.value) return
        busy.value = true
        viewModelScope.launch {
            call().fold(
                onSuccess = { actionError.value = null },
                onFailure = { t -> actionError.value = t.toAppError().message },
            )
            busy.value = false
        }
    }
}
