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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.ShipmentLine

private val ADD_SHIPMENT_STATUSES = setOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED)

data class ShipmentsUiState(
    val resource: Resource<OrderDetail> = Resource.Loading(null),
    val actionError: String? = null,
    val busy: Boolean = false,
    /** Trucks whose load is sitting in this operator's outbox, unsent. */
    val pendingShipmentIds: Set<String> = emptySet(),
) {
    val order: OrderDetail? get() = resource.dataOrNull
    val shipments: List<ShipmentLine> get() = order?.shipments.orEmpty()
    /** No cache yet and the first fetch hasn't landed — the only state a pull-to-refresh spinner
     *  should show, and one of two states (with [resourceError]) that must suppress the empty
     *  state below. */
    val isLoading: Boolean get() = resource is Resource.Loading && order == null
    val resourceError: String? get() = (resource as? Resource.Error)?.error?.message
    /** The only offline signal this screen has: a refresh that failed for lack of a network. */
    val isOffline: Boolean get() = (resource as? Resource.Error)?.error is AppError.Network
    val canAddShipment: Boolean get() = !busy && !isOffline && (order?.summary?.status?.let { it in ADD_SHIPMENT_STATUSES } ?: false)
    /** Never true alongside [resourceError]: an empty list next to an error banner reads as "no
     *  trucks" when the truth is "couldn't check" — the state that fooled an operator standing
     *  at a truck with no signal. */
    val showEmptyState: Boolean get() = shipments.isEmpty() && !isLoading && resourceError == null

    /**
     * A truck whose load was queued offline still comes back from the server as PENDING, so its
     * card would otherwise offer "load" a second time — and a second queued load carries a fresh
     * idempotency key, so the server takes it and then refuses it ("Shipment is already LOADED").
     * Deleting the truck is blocked for the same reason: it would strand the queued photo.
     */
    fun hasQueuedLoad(shipmentId: String): Boolean = shipmentId in pendingShipmentIds
}

@HiltViewModel(assistedFactory = ShipmentsViewModel.Factory::class)
class ShipmentsViewModel @AssistedInject constructor(
    private val orders: OrdersRepository,
    private val logistics: LogisticsRepository,
    outbox: OutboxRepository,
    @Assisted val orderId: String,
) : ViewModel() {
    @AssistedFactory
    interface Factory { fun create(orderId: String): ShipmentsViewModel }

    private val actionError = MutableStateFlow<String?>(null)
    private val busy = MutableStateFlow(false)

    // The outbox rows carry the shipment id they were queued for, which is the only way this
    // screen can tell a truck that was never loaded from one whose load has not been sent yet.
    private val queuedLoads = outbox.observeForOrder(orderId)
        .map { rows -> rows.mapNotNull { it.shipmentId }.toSet() }

    val state: StateFlow<ShipmentsUiState> = combine(orders.detail(orderId), actionError, busy, queuedLoads) { resource, err, isBusy, queued ->
        ShipmentsUiState(resource, err, isBusy, queued)
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
