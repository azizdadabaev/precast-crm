package uz.etalon.crm.feature.logistics.loadtruck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OrderDetail

data class LoadTruckUiState(
    val photo: PreparedImage? = null,
    /** The order this photo belongs to, for the header's «№ · client» and ruling R7's
     *  «Юклаш рўйхати». Null until the detail resolves — the camera comes up first. */
    val order: OrderDetail? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

fun interface LoadTruckUseCase {
    suspend operator fun invoke(orderId: String, photo: PreparedImage): Result<String>
}

open class LoadTruckViewModel(
    private val orderId: String,
    private val load: LoadTruckUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(LoadTruckUiState())
    val state: StateFlow<LoadTruckUiState> = _state.asStateFlow()

    fun onPhoto(p: PreparedImage) = _state.update { it.copy(photo = p, error = null) }
    fun retake() = _state.update { it.copy(photo = null, error = null) }

    /** The order keeps refreshing behind this screen while the camera is up, exactly as
     *  ShipmentLoadViewModel's allowance does; the load list and the header meta follow it. */
    fun applyOrder(o: OrderDetail) = _state.update { it.copy(order = o) }

    fun submit() {
        val photo = _state.value.photo
        if (photo == null) {
            _state.update { it.copy(error = "Аввал расм олинг") }
            return
        }
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            load(orderId, photo).fold(
                onSuccess = { _state.update { s -> s.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { s -> s.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel(assistedFactory = HiltLoadTruckViewModel.Factory::class)
class HiltLoadTruckViewModel @AssistedInject constructor(
    repo: LogisticsRepository,
    private val orders: OrdersRepository,
    val imagePrep: ImagePrep,
    @Assisted("orderId") orderId: String,
    @Assisted("extra") extraPhoto: Boolean,
) : LoadTruckViewModel(
    orderId,
    LoadTruckUseCase { id, photo ->
        if (extraPhoto) repo.addLoadedPhoto(id, photo) else repo.loadTruck(id, photo)
    },
) {
    init {
        // Ruling R7's load list, and the header's «№ · client». The order is already cached from
        // the detail this route was opened from, so it resolves near-instantly; collecting rather
        // than reading once also keeps the list right if the rooms change while the camera is up.
        viewModelScope.launch {
            orders.detail(orderId).collect { r -> r.dataOrNull?.let { applyOrder(it) } }
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String, @Assisted("extra") extraPhoto: Boolean): HiltLoadTruckViewModel
    }
}
