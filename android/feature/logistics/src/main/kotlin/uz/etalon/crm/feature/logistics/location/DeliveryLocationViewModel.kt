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
import uz.etalon.crm.core.ui.format.formatDecimal
import java.math.BigDecimal

private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"
private const val MANUAL_INVALID_MESSAGE = "Координаталар нотўғри — мисол: 41.311, 69.279 ёки 41,311 69,279"

// A comma is ambiguous on its own: "41.311,69.279" pairs two dot-decimal numbers, but a bare
// "41,69" could equally be one comma-decimal number as two comma-separated integers. Three
// unambiguous forms are accepted instead: two dot-decimal numbers may sit on either side of a
// comma (with or without surrounding spaces) — DOT_DECIMAL_PAIR; two comma-decimal numbers (what
// the Uzbek keyboard types, and what formatPinForDisplay shows) may be joined by a comma the same
// way, since each side's own internal comma plus that separator comma is unambiguous —
// COMMA_DECIMAL_PAIR; or either kind of number may be split by whitespace alone, with no comma
// at all — WHITESPACE_SEPARATED_PAIR. A bare single-comma string never matches any of the three,
// so it is never silently guessed at.
private val DOT_DECIMAL_PAIR = Regex("""^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$""")
private val COMMA_DECIMAL_PAIR = Regex("""^(-?\d+,\d+)\s*,\s*(-?\d+,\d+)$""")
private val WHITESPACE_SEPARATED_PAIR = Regex("""^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$""")

/** "41.311, 69.279" (or its comma-decimal counterpart "41,311, 69,279") typed or pasted by hand
 *  → a validated [LatLng], or null for anything that isn't unambiguously a coordinate pair in
 *  range (see the three patterns above). */
fun parseCoordinatePair(input: String): LatLng? {
    val trimmed = input.trim()
    val match = DOT_DECIMAL_PAIR.find(trimmed) ?: COMMA_DECIMAL_PAIR.find(trimmed) ?: WHITESPACE_SEPARATED_PAIR.find(trimmed) ?: return null
    val lat = match.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
    val lng = match.groupValues[2].replace(',', '.').toDoubleOrNull() ?: return null
    if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return null
    return LatLng(lat, lng)
}

/** The exact string this screen shows for a pin — comma-decimal, per the project's number
 *  convention (CLAUDE.md §3) — and, thanks to [COMMA_DECIMAL_PAIR] above, also exactly what
 *  [parseCoordinatePair] accepts back: a pin can always be copied out of this screen and typed
 *  straight back into the manual field without being rejected. */
fun formatPinForDisplay(lat: Double, lng: Double): String =
    "${formatDecimal(BigDecimal.valueOf(lat), 5)}, ${formatDecimal(BigDecimal.valueOf(lng), 5)}"

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
    /** The order-detail fetch this screen seeds its initial pin from — kept whole (not reduced to
     *  a boolean or a bare message) so a 401/403/422/500 is shown for what it is, with a retry,
     *  exactly the way ShipmentsUiState and DriversUiState keep their own `Resource`/error. */
    val orderResource: Resource<OrderDetail> = Resource.Loading(null),
) {
    val hasPin: Boolean get() = lat != null && lng != null
    /** No cache yet and the first fetch hasn't landed — mirrors ShipmentsUiState.isLoading. */
    val isLoading: Boolean get() = orderResource is Resource.Loading && orderResource.dataOrNull == null
    val resourceError: String? get() = (orderResource as? Resource.Error)?.error?.message
    /** Setting the location has no server-side idempotency (see LogisticsRepository's online-only
     *  section), so it may never be attempted — or silently queued — while offline. */
    val isOffline: Boolean get() = (orderResource as? Resource.Error)?.error is AppError.Network
    val canSave: Boolean get() = hasPin && !busy && !isOffline
    val canClear: Boolean get() = hasPin && !busy && !isOffline
    /** Never true alongside [resourceError] or while [isLoading]: "no pin" and "don't know yet"
     *  must never read the same, the same rule ShipmentsUiState/DriversUiState follow. */
    val showEmptyState: Boolean get() = !hasPin && !isLoading && resourceError == null
}

fun interface ResolveMapLinkUseCase { suspend operator fun invoke(url: String): Result<LatLng> }
fun interface SetDeliveryLocationUseCase {
    suspend operator fun invoke(lat: Double?, lng: Double?, url: String?, label: String?): Result<Unit>
}
fun interface RefreshOrderUseCase { suspend operator fun invoke() }

open class DeliveryLocationViewModel(
    private val deviceLocation: DeviceLocation,
    resolveLink: ResolveMapLinkUseCase,
    private val setLocation: SetDeliveryLocationUseCase,
    refreshOrder: RefreshOrderUseCase = RefreshOrderUseCase {},
) : ViewModel() {
    // Renamed internally so the public resolveLink()/refresh() below never shadow the constructor
    // parameters they call through — the same defensive rename DriversViewModel's create() uses.
    private val resolveMapLink = resolveLink
    private val refreshOrderUseCase = refreshOrder
    private val _state = MutableStateFlow(DeliveryLocationUiState())
    val state: StateFlow<DeliveryLocationUiState> = _state.asStateFlow()

    // Once true, the order-detail stream's own copy of the pin must never overwrite this screen's
    // local state again — set the moment the operator (or a save/clear already in flight) makes
    // this screen's state the authoritative one, so a stale/cached tick landing right after can't
    // silently revive a pin the operator just changed or cleared.
    private var userEdited = false

    /** Triggers the actual network fetch behind the order-detail stream — the same split
     *  ShipmentsViewModel uses (`refresh()` calls `orders.refreshDetail`, while `state` separately
     *  observes `orders.detail`'s flow). Runs once on construction and again on the retry banner. */
    init { refresh() }
    fun refresh() { viewModelScope.launch { refreshOrderUseCase() } }

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
        val s = _state.value
        val link = s.linkInput.trim()
        if (link.isEmpty() || s.busy) return
        if (s.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
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
     *  and keeps the whole [Resource] (not just its error) live, the same way
     *  HiltDeliveryProofViewModel keeps applyExpected live off the same kind of stream. */
    fun onOrderResource(resource: Resource<OrderDetail>) {
        val detail = resource.dataOrNull
        _state.update { s ->
            val withSeed = if (!userEdited && detail != null) {
                s.copy(lat = detail.deliveryLat, lng = detail.deliveryLng, label = detail.deliveryLocationLabel.orEmpty(), url = detail.deliveryLocationUrl)
            } else s
            withSeed.copy(orderResource = resource)
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
    refreshOrder = RefreshOrderUseCase { orders.refreshDetail(orderId) },
) {
    init {
        viewModelScope.launch { orders.detail(orderId).collect(::onOrderResource) }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String): HiltDeliveryLocationViewModel
    }
}
