package uz.etalon.crm.feature.payments.record

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
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.PaymentsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentRecordInput
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.core.ui.format.formatMoney
import java.time.LocalDate

/** Same wording the shipments, drivers, dispatch and delivery-location screens use. */
private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

/** Mirrors PaymentsRepository.record's own refusal, so the screen never offers an action the
 *  operator cannot perform and the repository never has to be the first to say no. */
private const val NO_PERMISSION_MESSAGE = "Тўловни қайд этишга рухсат йўқ"

private const val PAYMENT_RECORD = "payment.record"
private const val PAYMENT_CONFIRM = "payment.confirm"

/** `notes: z.string().max(500)` in PaymentRecordSchema. */
private const val MAX_NOTES = 500

/** MAX_BACKDATE_DAYS in src/lib/payment-attribution.ts — a date older than this is far likelier
 *  a typo than a real backdate, and the server refuses it with a 422. */
internal const val MAX_BACKDATE_DAYS = 120L

/**
 * What the record-payment sheet holds.
 *
 * [isOffline] is derived rather than stored: the two fetches this screen makes are the only
 * connectivity evidence it has, and keeping each failure whole — the way `DispatchUiState` keeps
 * its `driversFetchError` — leaves both a message and the narrower network fact available,
 * instead of collapsing every failure into one boolean.
 */
data class RecordPaymentUiState(
    val order: OrderDetail? = null,
    val amountDigits: String = "",
    val method: PaymentMethod = PaymentMethod.CASH,
    val source: PaymentSource = PaymentSource.IN_OFFICE_CASH,
    val handOverNow: Boolean = false,
    val driverId: String? = null,
    val drivers: List<Driver> = emptyList(),
    val notes: String = "",
    val receipts: List<PreparedImage> = emptyList(),
    /** Unset means "the customer paid today", which is what the server assumes when `paidOn` is
     *  absent — the state every historical row is in. */
    val paidOn: LocalDate? = null,
    /** Held rather than read from the clock inside a getter, so validation is a pure function of
     *  the state and a screenshot baseline cannot change meaning with the day it is replayed. */
    val today: LocalDate = LocalDate.now(TASHKENT),
    val submitting: Boolean = false,
    val error: String? = null,
    val detailError: AppError? = null,
    val driversError: AppError? = null,
    /** Both resolved from the persisted session, defaulting to "no" until they are: an action
     *  offered and then withdrawn is worse than one that appears a frame late. */
    val canRecord: Boolean = false,
    val canAutoConfirm: Boolean = false,
    /** Set once the server has created the row. From that moment the payment exists, and
     *  [submit] must never create a second one — only finish attaching the receipts. */
    val paymentId: String? = null,
    val done: Boolean = false,
) {
    /** Mirrors DeliveryProofUiState.amount. Total, not partial: it is read during composition,
     *  and restored state or a future caller could hand it a string [Money.parse] rejects — that
     *  must read as "nothing entered", never a crash. The keypad's comma never reaches
     *  [Money.parse], which only understands the plain-decimal strings the server itself sends. */
    val amount: Money
        get() = amountDigits.replace(',', '.').let { d ->
            if (d.isEmpty()) Money.ZERO else runCatching { Money.parse(d) }.getOrDefault(Money.ZERO)
        }

    /** `recordableRemaining`, NOT `remaining`: the server subtracts payments already awaiting
     *  confirmation, so anything between the two 422s the moment one is pending. */
    val cap: Money get() = order?.recordableRemaining ?: Money.ZERO
    val overCap: Money get() = (amount - cap).coerceAtLeastZero()

    /** The only offline signal this screen has: a fetch that failed for lack of a network.
     *  `POST /api/payments` is not `withIdempotency`-wrapped, so it can never be queued. */
    val isOffline: Boolean get() = detailError is AppError.Network || driversError is AppError.Network
    val loadErrorMessage: String? get() = (detailError ?: driversError)?.message

    val canSubmit: Boolean get() = !submitting && !isOffline && canRecord && validateRecord(this) == null

    /** A driver is collected only on the one source that has one, and bank/online has no
     *  physical hand-over to record — both mirror PaymentRecordSchema's refinements. */
    val driverApplies: Boolean get() = source == PaymentSource.FROM_DRIVER_AT_DELIVERY
    val handOverApplies: Boolean get() = source != PaymentSource.BANK_OR_ONLINE

    /** Whole UZS, rounded DOWN so a quick chip can never land a hair above the cap. */
    val fullAmountDigits: String get() = cap.amount.setScale(0, java.math.RoundingMode.DOWN).toPlainString()
    val halfAmountDigits: String
        get() = cap.amount.divide(java.math.BigDecimal(2), 0, java.math.RoundingMode.DOWN).toPlainString()
}

/**
 * Every rule `POST /api/payments` enforces, applied before the network — a 422 arrives after the
 * operator has already put the phone away, and the customer is standing at the counter.
 * Mirrors PaymentRecordSchema's three refinements plus the route's own order-state and
 * remaining-balance checks (src/app/api/payments/route.ts).
 */
fun validateRecord(s: RecordPaymentUiState): String? {
    val order = s.order ?: return "Буюртма маълумоти ҳали юкланмади"
    return when {
        order.summary.status == OrderStatus.CANCELED -> "Бекор қилинган буюртмага тўлов қайд этилмайди"
        s.amount.isZero || s.amount.isNegative -> "Суммани киритинг"
        s.amount > s.cap -> "Сумма қолдиқдан ошиб кетди · кўпи билан ${formatMoney(s.cap)}"
        s.driverApplies && s.driverId == null -> "Ҳайдовчини танланг"
        !s.driverApplies && s.driverId != null -> "Ҳайдовчи фақат ҳайдовчидан олинган нақдда кўрсатилади"
        !s.handOverApplies && s.handOverNow -> "Банк/онлайн тўловда офисга топшириш бўлмайди"
        s.method == PaymentMethod.UNKNOWN -> "Тўлов усулини танланг"
        s.notes.length > MAX_NOTES -> "Изоҳ $MAX_NOTES белгидан ошмаслиги керак"
        s.paidOn != null && s.paidOn.isAfter(s.today) -> "Тўлов санаси келажакда бўлиши мумкин эмас"
        s.paidOn != null && s.paidOn.isBefore(s.today.minusDays(MAX_BACKDATE_DAYS)) ->
            "Тўлов санаси $MAX_BACKDATE_DAYS кундан эски бўлмаслиги керак"
        else -> null
    }
}

fun interface RecordPaymentUseCase {
    suspend operator fun invoke(input: PaymentRecordInput): Result<String>
}

fun interface AttachReceiptUseCase {
    suspend operator fun invoke(paymentId: String, photo: PreparedImage): Result<String>
}

fun interface PaymentDriversUseCase {
    suspend operator fun invoke(): Result<List<Driver>>
}

fun interface PaymentPermissionsUseCase {
    suspend operator fun invoke(action: String): Boolean
}

open class RecordPaymentViewModel(
    private val orderId: String,
    record: RecordPaymentUseCase,
    attach: AttachReceiptUseCase,
    drivers: PaymentDriversUseCase,
    permissions: PaymentPermissionsUseCase,
    today: LocalDate = LocalDate.now(TASHKENT),
) : ViewModel() {
    private val recordPayment = record
    private val attachReceipt = attach
    private val listDrivers = drivers
    private val can = permissions

    private val _state = MutableStateFlow(RecordPaymentUiState(today = today))
    val state: StateFlow<RecordPaymentUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val record0 = can(PAYMENT_RECORD)
            val confirm0 = can(PAYMENT_CONFIRM)
            _state.update { it.copy(canRecord = record0, canAutoConfirm = confirm0) }
        }
        refreshDrivers()
    }

    /** Also the retry behind the load-error banner. Only active drivers: the server refuses an
     *  inactive one with a 422. */
    fun refreshDrivers() {
        viewModelScope.launch {
            listDrivers().fold(
                onSuccess = { rows -> _state.update { it.copy(drivers = rows, driversError = null) } },
                onFailure = { t -> _state.update { it.copy(driversError = t.toAppError()) } },
            )
        }
    }

    /**
     * The order carries the cap, so it is tracked live rather than read once: a payment recorded
     * elsewhere while this sheet is open shrinks [RecordPaymentUiState.cap], and the form must
     * follow it down instead of submitting against a figure the server has already moved past.
     */
    fun applyOrder(r: Resource<OrderDetail>) = _state.update {
        it.copy(
            order = r.dataOrNull ?: it.order,
            detailError = (r as? Resource.Error)?.error,
        )
    }

    fun setAmountDigits(v: String) = _state.update { it.copy(amountDigits = v, error = null) }
    fun setMethod(v: PaymentMethod) = _state.update { it.copy(method = v, error = null) }

    /** Clears the two fields the new source makes illegal, exactly like DispatchViewModel's
     *  `setWillCollectCash` clears its amount: the form can never sit in a shape
     *  PaymentRecordSchema would reject with nothing on screen explaining why. */
    fun setSource(v: PaymentSource) = _state.update {
        it.copy(
            source = v,
            driverId = if (v == PaymentSource.FROM_DRIVER_AT_DELIVERY) it.driverId else null,
            handOverNow = if (v == PaymentSource.BANK_OR_ONLINE) false else it.handOverNow,
            error = null,
        )
    }

    fun setHandOverNow(v: Boolean) = _state.update { it.copy(handOverNow = v, error = null) }
    fun setDriverId(v: String?) = _state.update { it.copy(driverId = v, error = null) }
    fun setNotes(v: String) = _state.update { it.copy(notes = v, error = null) }
    fun setPaidOn(v: LocalDate?) = _state.update { it.copy(paidOn = v, error = null) }

    fun addReceipt(p: PreparedImage) = _state.update { it.copy(receipts = it.receipts + p, error = null) }
    fun removeReceipt(index: Int) = _state.update {
        it.copy(receipts = it.receipts.filterIndexed { i, _ -> i != index }, error = null)
    }

    /** The way off the screen when a receipt will not attach. The payment itself is already
     *  recorded by then; the photo is the only thing left, and it is not worth trapping the
     *  operator at the counter over. */
    fun finishWithoutReceipts() {
        if (_state.value.paymentId != null) _state.update { it.copy(receipts = emptyList(), done = true) }
    }

    fun submit() {
        val s = _state.value
        if (s.submitting) return
        // Guarded here and not only on the button: this is the seam a test can reach.
        if (!s.canRecord) {
            _state.update { it.copy(error = NO_PERMISSION_MESSAGE) }
            return
        }
        // `POST /api/payments` has no idempotency key behind it, so with no signal the record is
        // refused outright rather than sent and failed. Only the receipt uploads may be queued.
        if (s.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
        val alreadyRecorded = s.paymentId
        if (alreadyRecorded == null) {
            val problem = validateRecord(s)
            if (problem != null) {
                _state.update { it.copy(error = problem) }
                return
            }
        }
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            val paymentId = alreadyRecorded ?: run {
                val input = PaymentRecordInput(
                    orderId = orderId,
                    amount = s.amount,
                    method = s.method,
                    source = s.source,
                    handOverNow = s.handOverNow,
                    collectedByDriverId = s.driverId,
                    notes = s.notes.trim().ifEmpty { null },
                    paidOn = s.paidOn?.toString(),
                )
                recordPayment(input).getOrElse { t ->
                    _state.update { st -> st.copy(submitting = false, error = t.toAppError().message) }
                    return@launch
                }
            }
            // From here the payment row EXISTS. Everything below only attaches receipts to it —
            // a retry must never run the record call again, or the order gets a second payment.
            _state.update { it.copy(paymentId = paymentId) }
            attachReceipts(paymentId)
        }
    }

    /**
     * Receipts attach AFTER recording, never before: `attachReceipt` enqueues an outbox row and
     * returns that row's id, not a URL, so it could never fill the request's `receiptUrls`. The
     * upload route is `withIdempotency`-wrapped, which is exactly why it may be queued while the
     * record itself may not — so a network drop after the record lands still delivers the photos.
     */
    private suspend fun attachReceipts(paymentId: String) {
        val outstanding = _state.value.receipts
        val failed = mutableListOf<PreparedImage>()
        var firstError: String? = null
        outstanding.forEach { photo ->
            attachReceipt(paymentId, photo).onFailure { t ->
                failed += photo
                if (firstError == null) firstError = t.toAppError().message
            }
        }
        _state.update {
            if (failed.isEmpty()) it.copy(submitting = false, receipts = emptyList(), done = true)
            else it.copy(submitting = false, receipts = failed, error = firstError)
        }
    }
}

@HiltViewModel(assistedFactory = HiltRecordPaymentViewModel.Factory::class)
class HiltRecordPaymentViewModel @AssistedInject constructor(
    orders: OrdersRepository,
    payments: PaymentsRepository,
    drivers: DriversRepository,
    permissions: PermissionGate,
    val imagePrep: ImagePrep,
    @Assisted("orderId") orderId: String,
) : RecordPaymentViewModel(
    orderId = orderId,
    record = RecordPaymentUseCase { input -> payments.record(input) },
    attach = AttachReceiptUseCase { paymentId, photo -> payments.attachReceipt(paymentId, orderId, photo) },
    drivers = PaymentDriversUseCase { drivers.list(activeOnly = true) },
    permissions = PaymentPermissionsUseCase { action -> permissions.can(action) },
) {
    init {
        viewModelScope.launch { orders.detail(orderId).collect { applyOrder(it) } }
        // The cached order is what the operator just came from, but the cap depends on what is
        // already in the owner's confirm queue — a figure another operator can have moved since.
        viewModelScope.launch { orders.refreshDetail(orderId) }
    }

    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String): HiltRecordPaymentViewModel
    }
}
