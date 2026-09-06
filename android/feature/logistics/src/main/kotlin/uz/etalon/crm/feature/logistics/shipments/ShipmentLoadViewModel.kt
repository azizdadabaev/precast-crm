package uz.etalon.crm.feature.logistics.shipments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage

data class ShipmentLoadUiState(
    val photo: PreparedImage? = null,
    val beams: Map<String, Int> = emptyMap(),
    val blocks: Int = 0,
    val allowance: Allowance = Allowance(emptyMap(), 0),
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

fun interface ShipmentLoadUseCase {
    suspend operator fun invoke(orderId: String, shipmentId: String, photo: PreparedImage?, beams: Map<String, Int>, blocks: Int): Result<String>
}

open class ShipmentLoadViewModel(
    private val orderId: String,
    private val shipmentId: String,
    initialAllowance: Allowance,
    private val load: ShipmentLoadUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(ShipmentLoadUiState(allowance = initialAllowance))
    val state: StateFlow<ShipmentLoadUiState> = _state.asStateFlow()

    fun onPhoto(p: PreparedImage) = _state.update { it.copy(photo = p, error = null) }
    fun retake() = _state.update { it.copy(photo = null, error = null) }

    /** Recomputes as the order detail keeps refreshing behind this screen (e.g. another truck's
     *  load lands while this one is being counted); existing counts are re-clamped so a shrunk
     *  allowance can never leave the state holding more than the server will now accept. */
    fun applyAllowance(a: Allowance) = _state.update { s ->
        s.copy(
            allowance = a,
            beams = s.beams.mapValues { (k, v) -> v.coerceIn(0, a.beams[k] ?: 0) },
            blocks = s.blocks.coerceIn(0, a.blocks),
        )
    }

    fun setBeam(lengthKey: String, count: Int) = _state.update { s ->
        val cap = s.allowance.beams[lengthKey] ?: 0
        s.copy(beams = s.beams + (lengthKey to count.coerceIn(0, cap)), error = null)
    }

    fun setBlocks(count: Int) = _state.update { s ->
        s.copy(blocks = count.coerceIn(0, s.allowance.blocks), error = null)
    }

    fun submit() {
        val s = _state.value
        if (s.photo == null) {
            _state.update { it.copy(error = "Аввал расм олинг") }
            return
        }
        if (s.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            val beams = s.beams.filterValues { it > 0 }
            load(orderId, shipmentId, s.photo, beams, s.blocks).fold(
                onSuccess = { _state.update { st -> st.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { st -> st.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel(assistedFactory = HiltShipmentLoadViewModel.Factory::class)
class HiltShipmentLoadViewModel @AssistedInject constructor(
    private val orders: OrdersRepository,
    private val outbox: OutboxRepository,
    logistics: LogisticsRepository,
    val imagePrep: ImagePrep,
    @Assisted("orderId") orderId: String,
    @Assisted("shipmentId") shipmentId: String,
) : ShipmentLoadViewModel(
    orderId, shipmentId,
    initialAllowance = Allowance(emptyMap(), 0),
    load = ShipmentLoadUseCase { oId, sId, photo, beams, blocks -> logistics.loadShipment(oId, sId, photo, beams, blocks) },
) {
    init {
        // The order's rooms/shipments are already cached from the shipments list screen the
        // operator just came from, so this resolves near-instantly; it also keeps tracking the
        // allowance live so a concurrent update elsewhere is reflected here too.
        //
        // The outbox is combined in for the offline case: a load counted onto an earlier truck is
        // sitting in the queue, invisible to the server, and without it the cap here would be the
        // whole order total — a 422 that becomes permanent the moment the queue drains.
        viewModelScope.launch {
            combine(orders.detail(orderId), outbox.observeForOrder(orderId)) { r, queued -> r to queued }
                .collect { (r, queued) ->
                    r.dataOrNull?.let { applyAllowance(allowanceFor(it, excludingShipmentId = shipmentId, queued = queued)) }
                }
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String, @Assisted("shipmentId") shipmentId: String): HiltShipmentLoadViewModel
    }
}
