package uz.etalon.crm.feature.logistics.location

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
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.LatLng
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.Resource

private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"
private const val MANUAL_INVALID_MESSAGE = "Координаталар нотўғри — масалан: 41.311, 69.279"

// A comma is ambiguous on its own: "41.311,69.279" pairs two dot-decimal numbers, but a bare
// "41,69" could equally be one comma-decimal number as two comma-separated integers. Dot-decimal
// numbers may sit on either side of a comma (with or without surrounding spaces); comma-decimal
// numbers (what the Uzbek keyboard types) are only accepted when whitespace — never a comma —
// separates the pair, so the ambiguous single-comma case is never silently guessed at.
private val DOT_DECIMAL_PAIR = Regex("""^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$""")
private val WHITESPACE_SEPARATED_PAIR = Regex("""^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$""")

/** "41.311, 69.279" typed or pasted by hand → a validated [LatLng], or null for anything that
 *  isn't unambiguously a coordinate pair in range (see the two patterns above). */
fun parseCoordinatePair(input: String): LatLng? {
    val trimmed = input.trim()
    val match = DOT_DECIMAL_PAIR.find(trimmed) ?: WHITESPACE_SEPARATED_PAIR.find(trimmed) ?: return null
    val lat = match.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
    val lng = match.groupValues[2].replace(',', '.').toDoubleOrNull() ?: return null
    if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return null
    return LatLng(lat, lng)
}

data class DeliveryLocationUiState(
    val lat: Double? = null,
    val lng: Double? = null,
    val label: String = "",
    val url: String? = null,
    val linkInput: String = "",
    val manualInput: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    /** The last error seen from the order-detail stream this screen seeds its initial pin from —
     *  kept by its real type (not just a boolean) so [isOffline] is derived from it exactly the
     *  way ShipmentsUiState and DriversUiState derive their own. */
    val lastRefreshError: AppError? = null,
) {
    val hasPin: Boolean get() = lat != null && lng != null
    /** Setting the location has no server-side idempotency (see LogisticsRepository's online-only
     *  section), so it may never be attempted — or silently queued — while offline. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network
    val canSave: Boolean get() = hasPin && !busy && !isOffline
    val canClear: Boolean get() = hasPin && !busy && !isOffline
}

fun interface ResolveMapLinkUseCase { suspend operator fun invoke(url: String): Result<LatLng> }
fun interface SetDeliveryLocationUseCase {
    suspend operator fun invoke(lat: Double?, lng: Double?, url: String?, label: String?): Result<Unit>
}

open class DeliveryLocationViewModel(
    private val deviceLocation: DeviceLocation,
    resolveLink: ResolveMapLinkUseCase,
    private val setLocation: SetDeliveryLocationUseCase,
) : ViewModel() {
    // Renamed internally so the public resolveLink() below never shadows the constructor
    // parameter it calls through — the same defensive rename DriversViewModel's create() uses.
    private val resolveMapLink = resolveLink
    private val _state = MutableStateFlow(DeliveryLocationUiState())
    val state: StateFlow<DeliveryLocationUiState> = _state.asStateFlow()

    // Once true, the order-detail stream's own copy of the pin must never overwrite this screen's
    // local state again — set the moment the operator (or a save/clear already in flight) makes
    // this screen's state the authoritative one, so a stale/cached tick landing right after can't
    // silently revive a pin the operator just changed or cleared.
    private var userEdited = false

    fun onLinkInputChange(v: String) = _state.update { it.copy(linkInput = v, error = null) }
    fun onManualInputChange(v: String) = _state.update { it.copy(manualInput = v, error = null) }
    fun onLabelChange(v: String) {
        userEdited = true
        _state.update { it.copy(label = v, error = null) }
    }

    fun useMyLocation() {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            deviceLocation.current().fold(
                onSuccess = { p -> userEdited = true; _state.update { it.copy(busy = false, lat = p.lat, lng = p.lng, url = null) } },
                onFailure = { t -> _state.update { it.copy(busy = false, error = t.toAppError().message) } },
            )
        }
    }

    /** A failed resolve leaves lat/lng/label exactly as they were — an operator standing at a
     *  site with a bad link must not lose whatever pin was already good. */
    fun resolveLink() {
        val link = _state.value.linkInput.trim()
        if (link.isEmpty() || _state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            resolveMapLink(link).fold(
                onSuccess = { p -> userEdited = true; _state.update { it.copy(busy = false, lat = p.lat, lng = p.lng, url = link) } },
                onFailure = { t -> _state.update { it.copy(busy = false, error = t.toAppError().message) } },
            )
        }
    }

    /** Coordinates are exact values, same as money: a malformed manual entry is refused here,
     *  in Uzbek, rather than ever reaching the server. */
    fun applyManualInput() {
        val parsed = parseCoordinatePair(_state.value.manualInput)
        if (parsed == null) {
            _state.update { it.copy(error = MANUAL_INVALID_MESSAGE) }
            return
        }
        userEdited = true
        _state.update { it.copy(lat = parsed.lat, lng = parsed.lng, url = null, error = null) }
    }

    fun save() {
        val s = _state.value
        if (s.busy || !s.hasPin) return
        if (s.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
        userEdited = true
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            setLocation(s.lat, s.lng, s.url, s.label.trim().ifBlank { null }).fold(
                onSuccess = { _state.update { it.copy(busy = false, saved = true) } },
                onFailure = { t -> _state.update { it.copy(busy = false, error = t.toAppError().message) } },
            )
        }
    }

    /** Clears all four server-side columns at once (see DeliveryLocationRequest.toJsonBody's
     *  explicit-nulls body) — never a partial clear. */
    fun clear() {
        val s = _state.value
        if (s.busy || !s.hasPin) return
        if (s.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
        userEdited = true
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            setLocation(null, null, null, null).fold(
                onSuccess = {
                    _state.update {
                        it.copy(busy = false, lat = null, lng = null, label = "", url = null, linkInput = "", manualInput = "", saved = true)
                    }
                },
                onFailure = { t -> _state.update { it.copy(busy = false, error = t.toAppError().message) } },
            )
        }
    }

    /** Called as the order-detail stream this screen was opened from ticks. Seeds the screen from
     *  the order's already-known pin on every tick up until the operator's first edit — after
     *  that [userEdited] keeps this screen's own state authoritative, so neither a background
     *  refresh nor a stale cached tick following a just-completed save/clear can stomp on it —
     *  and keeps [DeliveryLocationUiState.isOffline] live off every tick's error the same way
     *  HiltDeliveryProofViewModel keeps applyExpected live. */
    fun onOrderResource(resource: Resource<OrderDetail>) {
        val detail = resource.dataOrNull
        _state.update { s ->
            val withSeed = if (!userEdited && detail != null) {
                s.copy(lat = detail.deliveryLat, lng = detail.deliveryLng, label = detail.deliveryLocationLabel.orEmpty(), url = detail.deliveryLocationUrl)
            } else s
            withSeed.copy(lastRefreshError = (resource as? Resource.Error)?.error)
        }
    }
}

@HiltViewModel(assistedFactory = HiltDeliveryLocationViewModel.Factory::class)
class HiltDeliveryLocationViewModel @AssistedInject constructor(
    private val orders: OrdersRepository,
    logistics: LogisticsRepository,
    deviceLocation: DeviceLocation,
    @Assisted("orderId") orderId: String,
) : DeliveryLocationViewModel(
    deviceLocation = deviceLocation,
    resolveLink = ResolveMapLinkUseCase { url -> logistics.resolveMapLink(url) },
    setLocation = SetDeliveryLocationUseCase { lat, lng, url, label -> logistics.setDeliveryLocation(orderId, lat, lng, url, label) },
) {
    init {
        viewModelScope.launch { orders.detail(orderId).collect(::onOrderResource) }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String): HiltDeliveryLocationViewModel
    }
}
