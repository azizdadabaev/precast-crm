package uz.etalon.crm.feature.logistics.delivery

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
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail

data class DeliveryProofUiState(
    val photo: PreparedImage? = null,
    val amountDigits: String = "",
    val noCashCollected: Boolean = false,
    val note: String = "",
    val driverReturned: Boolean = false,
    val expected: Money = Money.ZERO,
    /** The order being delivered, for the header's «№ · client» and the gate's meta line. Null
     *  until the detail resolves — the camera comes up first. */
    val order: OrderDetail? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
) {
    /** An empty field and a typed zero are the same fact to the server: nothing collected yet.
     *  The comma the keypad uses for a decimal point never reaches [Money.parse], which only
     *  understands the plain-decimal strings the server itself sends. Total, not partial: this
     *  is read during composition, and restored state, a deeplink, or a future caller could hand
     *  it a string [Money.parse] rejects — that must read as "nothing entered", never a crash. */
    val amount: Money get() = amountDigits.replace(',', '.').let { d -> if (d.isEmpty()) Money.ZERO else runCatching { Money.parse(d) }.getOrDefault(Money.ZERO) }
    val shortfall: Money get() = (expected - amount).coerceAtLeastZero()
    /** The fat-finger direction: an extra digit produces too much, not too little, and nothing
     *  else in this screen calls that out. Informational only — a customer really can pay more —
     *  so this never blocks submission the way [shortfall] never does either. */
    val overCollected: Money get() = (amount - expected).coerceAtLeastZero()
}

/**
 * The same three rules the delivery-proof route enforces, applied before the
 * upload is queued. Without this a queued proof could sit for an hour and then
 * be rejected for a note the operator is no longer standing there to write.
 */
fun validateDeliveryCash(cash: DeliveryCash): String? = when {
    cash.amount.isNegative -> "Сумма манфий бўлиши мумкин эмас"
    cash.noCashCollected && !cash.amount.isZero -> "«Нақд олинмади» билан сумма бир вақтда бўлмайди"
    cash.noCashCollected && cash.note.trim().length < 3 -> "Нима учун нақд олинмаганини ёзинг"
    else -> null
}

fun interface DeliveryProofUseCase {
    suspend operator fun invoke(photo: PreparedImage, cash: DeliveryCash): Result<String>
}

open class DeliveryProofViewModel(
    orderId: String,
    expected: Money,
    submit: DeliveryProofUseCase,
) : ViewModel() {
    // Kept under a different name from the public submit() below: a same-named constructor
    // parameter and member function resolve fine by arity, but there is no reason to rely on it.
    private val submitProof = submit

    private val _state = MutableStateFlow(DeliveryProofUiState(expected = expected))
    val state: StateFlow<DeliveryProofUiState> = _state.asStateFlow()

    fun onPhoto(p: PreparedImage) = _state.update { it.copy(photo = p, error = null) }
    fun retake() = _state.update { it.copy(photo = null, error = null) }
    fun setAmountDigits(digits: String) = _state.update { it.copy(amountDigits = digits, error = null) }

    /**
     * Turning "no cash collected" on clears any amount already typed, so the two facts — collected
     * zero vs. did not collect — can never sit contradicted in the same state.
     *
     * The note is deliberately NOT cleared when the switch goes back off. It is only ever *sent*
     * under `noCashCollected` — `POST /orders/{id}/delivery-proof` writes it in that branch alone
     * — so a leftover reason is invisible to the record either way, and wiping it meant a driver
     * who fat-fingered the switch had to retype the sentence he had just written. The screen hides
     * the field instead.
     */
    fun setNoCashCollected(v: Boolean) = _state.update {
        it.copy(noCashCollected = v, amountDigits = if (v) "" else it.amountDigits, error = null)
    }

    fun setNote(v: String) = _state.update { it.copy(note = v, error = null) }
    fun setDriverReturned(v: Boolean) = _state.update { it.copy(driverReturned = v, error = null) }

    /** The order detail this screen was opened from may still be loading its dispatch when the
     *  camera comes up first; the expected collection is applied live as it resolves, exactly
     *  like ShipmentLoadViewModel's allowance. */
    fun applyExpected(e: Money) = _state.update { it.copy(expected = e) }

    /** The order behind the expected collection, kept for the header and the gate's meta line. */
    fun applyOrder(o: OrderDetail) = _state.update { it.copy(order = o) }

    fun submit() {
        val s = _state.value
        // Terminal, and checked before anything else — see LoadTruckViewModel.submit: the button
        // stays on screen for ruling R5's dwell, and a second enqueue of the same photo fails on a
        // file the outbox has already moved. Here it would also raise a second cash row.
        if (s.done) return
        val photo = s.photo
        if (photo == null) {
            _state.update { it.copy(error = "Аввал расм олинг") }
            return
        }
        val cash = DeliveryCash(
            amount = s.amount,
            noCashCollected = s.noCashCollected,
            // The route persists `noCashCollectedNote` in the `noCashCollected` branch and nowhere
            // else, so a note kept from a toggled-off switch must not ride along: the wire says
            // exactly what the record will say.
            note = if (s.noCashCollected) s.note else "",
            driverReturned = s.driverReturned,
        )
        val problem = validateDeliveryCash(cash)
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }
        if (s.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            submitProof(photo, cash).fold(
                onSuccess = { _state.update { st -> st.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { st -> st.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

/**
 * `deliveryProof` returns a bare outbox id, not an order — there is no server-side relation to
 * rebuild one from. The order this proof belongs to is re-fetched by whoever owns the detail
 * screen this route returns to, once the outbox actually sends it; nothing here fabricates one.
 */
@HiltViewModel(assistedFactory = HiltDeliveryProofViewModel.Factory::class)
class HiltDeliveryProofViewModel @AssistedInject constructor(
    private val orders: OrdersRepository,
    logistics: LogisticsRepository,
    val imagePrep: ImagePrep,
    @Assisted("orderId") orderId: String,
) : DeliveryProofViewModel(
    orderId,
    expected = Money.ZERO,
    submit = DeliveryProofUseCase { photo, cash -> logistics.deliveryProof(orderId, photo, cash) },
) {
    init {
        // The order is already cached from the screen the operator just came from, so this
        // resolves near-instantly; it also keeps tracking a concurrent dispatch update.
        viewModelScope.launch {
            orders.detail(orderId).collect { r ->
                r.dataOrNull?.let {
                    applyOrder(it)
                    applyExpected(it.dispatch?.expectedCollection ?: Money.ZERO)
                }
            }
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String): HiltDeliveryProofViewModel
    }
}
