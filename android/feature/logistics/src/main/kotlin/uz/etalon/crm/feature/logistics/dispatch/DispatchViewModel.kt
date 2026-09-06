package uz.etalon.crm.feature.logistics.dispatch

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
import uz.etalon.crm.core.data.DriversRepository
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.model.Money

data class DispatchUiState(
    val drivers: List<Driver> = emptyList(),
    val driverId: String? = null,
    val truck: String = "",
    val amountDigits: String = "",
    val willCollectCash: Boolean = false,
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
    /** The raw outcome of the last active-driver fetch, kept whole — not collapsed into a message
     *  string or a network-only boolean — exactly like ShipmentsUiState keeps its `Resource.Error`
     *  whole so both a display message and a retry-affordance survive for *any* failure (a 403, a
     *  500, a decode error), not only the network case. [isOffline] is one narrower fact derived
     *  from it. */
    val driversFetchError: AppError? = null,
) {
    /** Mirrors DeliveryProofUiState.amount: the keypad's comma never reaches [Money.parse], and an
     *  empty or unparsable field reads as zero rather than crashing a restored/deeplinked state. */
    val amount: Money get() = amountDigits.replace(',', '.').let { d -> if (d.isEmpty()) Money.ZERO else runCatching { Money.parse(d) }.getOrDefault(Money.ZERO) }
    val driversErrorMessage: String? get() = driversFetchError?.message
    /** The one signal that blocks *submitting*: neither dispatch route is idempotent (see
     *  LogisticsRepository's online-only section), so with no network the action is disabled
     *  outright rather than queued. A non-network driver-fetch failure (403, 500…) still lets a
     *  no-driver dispatch through — it only means the picker couldn't be filled. */
    val isOffline: Boolean get() = driversFetchError is AppError.Network
}

fun interface DispatchDriversUseCase { suspend operator fun invoke(): Result<List<Driver>> }

/** Whole-order dispatch: LogisticsRepository.createDispatch, expectedCollection required. */
fun interface CreateDispatchUseCase {
    suspend operator fun invoke(driverId: String?, truck: String?, expectedCollection: Money): Result<Unit>
}

/** One truck of a split shipment: LogisticsRepository.dispatchShipment, cashToCollect optional. */
fun interface DispatchShipmentUseCase {
    suspend operator fun invoke(driverId: String?, truck: String?, driverWillCollectCash: Boolean, cashToCollect: Money?): Result<Unit>
}

open class DispatchViewModel(
    private val shipmentId: String?,
    drivers: DispatchDriversUseCase,
    createDispatch: CreateDispatchUseCase,
    dispatchShipment: DispatchShipmentUseCase,
) : ViewModel() {
    private val listDrivers = drivers
    private val createDispatchUseCase = createDispatch
    private val dispatchShipmentUseCase = dispatchShipment

    private val _state = MutableStateFlow(DispatchUiState())
    val state: StateFlow<DispatchUiState> = _state.asStateFlow()

    init { refreshDrivers() }

    /** Also the retry action behind the driver-fetch error banner: a 403/500/decode failure, and
     *  going offline itself, both need a way back other than leaving the screen. */
    fun refreshDrivers() {
        viewModelScope.launch {
            listDrivers().fold(
                onSuccess = { rows -> _state.update { it.copy(drivers = rows, driversFetchError = null) } },
                onFailure = { t -> _state.update { it.copy(driversFetchError = t.toAppError()) } },
            )
        }
    }

    fun setDriverId(id: String?) = _state.update { it.copy(driverId = id, error = null) }
    fun setTruck(v: String) = _state.update { it.copy(truck = v, error = null) }

    /** Turning cash collection off clears any typed amount, exactly like DeliveryProofViewModel's
     *  noCashCollected: the amount and "will collect" flag can never sit contradicted. */
    fun setWillCollectCash(v: Boolean) = _state.update { it.copy(willCollectCash = v, amountDigits = if (v) it.amountDigits else "", error = null) }
    fun setAmountDigits(v: String) = _state.update { it.copy(amountDigits = v, error = null) }

    fun submit() {
        val s = _state.value
        if (s.submitting) return
        // Whole-order dispatch's expectedCollection is required by the server schema and the
        // Dispatch row is @unique per order — a zero mis-submit flips the order to DISPATCHED with
        // no way to undo it from the app (an admin has to walk the order back manually). Per-shipment
        // dispatch has no such field to guard: a shipment with no cash to collect is legitimate.
        if (shipmentId == null && s.amount.isZero) {
            _state.update { it.copy(error = "Кутилган суммани киритинг") }
            return
        }
        _state.update { it.copy(submitting = true, error = null) }
        val truck = s.truck.trim().ifEmpty { null }
        viewModelScope.launch {
            val result = if (shipmentId == null) {
                createDispatchUseCase(s.driverId, truck, s.amount)
            } else {
                dispatchShipmentUseCase(s.driverId, truck, s.willCollectCash, if (s.willCollectCash) s.amount else null)
            }
            result.fold(
                onSuccess = { _state.update { st -> st.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { st -> st.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel(assistedFactory = HiltDispatchViewModel.Factory::class)
class HiltDispatchViewModel @AssistedInject constructor(
    drivers: DriversRepository,
    logistics: LogisticsRepository,
    @Assisted("orderId") orderId: String,
    @Assisted("shipmentId") shipmentId: String?,
) : DispatchViewModel(
    shipmentId = shipmentId,
    drivers = DispatchDriversUseCase { drivers.list(activeOnly = true) },
    createDispatch = CreateDispatchUseCase { driverId, truck, expectedCollection ->
        logistics.createDispatch(orderId, driverId, truck, expectedCollection, notes = null)
    },
    dispatchShipment = DispatchShipmentUseCase { driverId, truck, driverWillCollectCash, cashToCollect ->
        logistics.dispatchShipment(orderId, requireNotNull(shipmentId), driverId, truck, driverWillCollectCash, cashToCollect)
    },
) {
    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String, @Assisted("shipmentId") shipmentId: String?): HiltDispatchViewModel
    }
}
