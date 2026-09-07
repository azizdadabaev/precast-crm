package uz.etalon.crm.feature.payments.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.PaymentsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import javax.inject.Inject

/** Same wording the shipments, drivers and record-payment screens use for a refused action. */
private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

/** Mirrors PaymentsRepository.confirm/reject's own refusal, so the screen never offers an action
 *  the owner cannot perform and the repository never has to be the first to say no. */
private const val NO_PERMISSION_MESSAGE = "Тўловларни тасдиқлашга рухсат йўқ"

private const val PAYMENT_CONFIRM = "payment.confirm"

/** `discrepancyNote` and `DiscrepancyUpdateSchema` both say `min(5)`; `adjustmentNote` is checked
 *  by the confirm route itself with the same figure. */
private const val MIN_NOTE = 5

/** `reason: z.string().min(3)` in PaymentRejectSchema. */
private const val MIN_REASON = 3

/** Both notes and the reject reason are `z.string().max(500)`. */
private const val MAX_NOTE = 500

/**
 * What the owner may do about a shortfall, as the confirm route's `discrepancyAction` enum. Kept
 * here rather than in `:core:model` because it is not a shape the server ever sends back — it
 * exists only for the length of one confirm request, and the row it produces comes back as a
 * [uz.etalon.crm.core.model.DiscrepancyStatus] instead (TRACK → OPEN, DISCOUNT →
 * RESOLVED_DISCOUNT, WRITEOFF → RESOLVED_WRITEOFF).
 */
enum class DiscrepancyAction { TRACK, DISCOUNT, WRITEOFF }

/**
 * The shortfall against [finalAmount] — the figure the owner is about to confirm, which is not
 * necessarily the one that was recorded, so [PaymentQueueItem.shortfall] cannot answer it.
 *
 * The gate is the narrow one the confirm route enforces: a dispatch's `expectedCollection` is the
 * amount a DRIVER was sent out to collect on one delivery. In-office cash and bank transfers carry
 * no driver, so comparing them to it is meaningless — and would force the owner to justify a
 * discrepancy on a payment that is not short of anything. `fromDriver` is exactly the route's
 * `payment.collectedById != null`.
 */
fun shortfallOf(item: PaymentQueueItem, finalAmount: Money): Money =
    item.expectedFromDriver?.let { (it - finalAmount).coerceAtLeastZero() } ?: Money.ZERO

/** The dispatch figure this payment may be measured against, or null when there is nothing to
 *  measure it against. The single place that gate is written, so a card and a sheet can never
 *  disagree about whether a payment is short. */
val PaymentQueueItem.expectedFromDriver: Money?
    get() = expectedCollection?.takeIf { fromDriver }

/**
 * Every contextual rule `POST /api/payments/{id}/confirm` enforces, applied before the network:
 * a 422 arrives after the owner has put the phone away, and the money is still unconfirmed.
 *
 * Returns null when the confirmation may go, or the Uzbek reason it may not.
 */
fun confirmBlocker(
    item: PaymentQueueItem,
    amount: Money,
    adjustmentNote: String,
    action: DiscrepancyAction?,
    note: String,
): String? {
    // `amount: z.coerce.number().positive().optional()` — a cleared field would 422 on the schema.
    if (amount.isZero || amount.isNegative) return "Суммани киритинг"

    // compareTo, not equals: Money wraps BigDecimal, where "1000000" and "1000000.00" are equal
    // in value but not by equals — and the server compares numbers, not strings.
    val amountChanged = amount.compareTo(item.amount) != 0
    val trimmedAdjustment = adjustmentNote.trim()
    if (amountChanged) {
        if (trimmedAdjustment.length < MIN_NOTE) {
            return "Суммани ўзгартирганда созлаш изоҳи (мин. $MIN_NOTE белги) керак"
        }
        if (trimmedAdjustment.length > MAX_NOTE) return "Созлаш изоҳи $MAX_NOTE белгидан ошмаслиги керак"
    }

    if (!shortfallOf(item, amount).isZero) {
        if (action == null) return "Тасдиқлаш учун тафовут амалини танланг"
        val trimmedNote = note.trim()
        if (trimmedNote.length < MIN_NOTE) return "Тафовут изоҳи (мин. $MIN_NOTE белги) керак"
        if (trimmedNote.length > MAX_NOTE) return "Тафовут изоҳи $MAX_NOTE белгидан ошмаслиги керак"
    }
    return null
}

/** `PaymentRejectSchema`: a reason, at least 3 characters, at most 500. */
fun rejectBlocker(reason: String): String? {
    val trimmed = reason.trim()
    return when {
        trimmed.length < MIN_REASON -> "Сабаб керак (мин. $MIN_REASON белги)"
        trimmed.length > MAX_NOTE -> "Сабаб $MAX_NOTE белгидан ошмаслиги керак"
        else -> null
    }
}

/** Which of the two irreversible decisions the open sheet is asking for. */
enum class ConfirmMode { APPROVE, REJECT }

/**
 * The open sheet. Held in the ViewModel rather than in the composition so that what the owner
 * typed survives the keypad taking the screen, and so the guards live at the seam a test reaches.
 */
data class ConfirmSheetState(
    val item: PaymentQueueItem,
    val mode: ConfirmMode = ConfirmMode.APPROVE,
    /** Seeded with the recorded amount in whole UZS — the keypad has no decimals. */
    val amountDigits: String = item.amount.roundedWhole().toPlainString(),
    val adjustmentNote: String = "",
    val action: DiscrepancyAction? = null,
    val note: String = "",
    val rejectReason: String = "",
    val error: String? = null,
) {
    /** Mirrors RecordPaymentUiState.amount: read during composition, so an unparsable string must
     *  read as "nothing entered", never crash the sheet. */
    val amount: Money
        get() = amountDigits.replace(',', '.').let { d ->
            if (d.isEmpty()) Money.ZERO else runCatching { Money.parse(d) }.getOrDefault(Money.ZERO)
        }

    val amountChanged: Boolean get() = amount.compareTo(item.amount) != 0
    val shortfall: Money get() = shortfallOf(item, amount)
    val hasShortfall: Boolean get() = !shortfall.isZero
    /** The figure a shortfall is measured against — shown only where it means something. */
    val expected: Money? get() = item.expectedFromDriver
    val blocker: String?
        get() = if (mode == ConfirmMode.REJECT) rejectBlocker(rejectReason)
        else confirmBlocker(item, amount, adjustmentNote, action, note)
}

data class ConfirmQueueUiState(
    val tab: PaymentStatus = PaymentStatus.PENDING_CONFIRMATION,
    val items: List<PaymentQueueItem> = emptyList(),
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    /** The raw error from the last fetch, kept (not only its message) so [isOffline] is derived
     *  from its real type — the same shape DriversUiState uses. */
    val lastRefreshError: AppError? = null,
    val canConfirm: Boolean = false,
    val sheet: ConfirmSheetState? = null,
) {
    /** Never true alongside [error] or while loading: an empty list next to an error banner reads
     *  as "no payments" when the truth is "couldn't check". */
    val showEmptyState: Boolean get() = items.isEmpty() && !loading && error == null

    /** Neither confirm nor reject is `withIdempotency`-wrapped server-side, so neither may ever be
     *  queued — with no signal they are refused rather than sent and failed. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network
}

fun interface PaymentQueueUseCase {
    suspend operator fun invoke(status: PaymentStatus): Result<List<PaymentQueueItem>>
}

fun interface PaymentConfirmUseCase {
    suspend operator fun invoke(
        id: String, amount: Money?, adjustmentNote: String?, action: String?, note: String?,
    ): Result<Unit>
}

fun interface PaymentRejectUseCase {
    suspend operator fun invoke(id: String, reason: String): Result<Unit>
}

fun interface ConfirmPermissionUseCase {
    suspend operator fun invoke(action: String): Boolean
}

/**
 * The owner's confirmation queue: three tabs, each a server-side status filter, and one sheet in
 * front of the only two irreversible actions on the phone.
 */
open class ConfirmQueueViewModel(
    queue: PaymentQueueUseCase,
    confirm: PaymentConfirmUseCase,
    reject: PaymentRejectUseCase,
    permissions: ConfirmPermissionUseCase,
) : ViewModel() {
    private val loadQueue = queue
    private val confirmPayment = confirm
    private val rejectPayment = reject
    private val can = permissions

    private val _state = MutableStateFlow(ConfirmQueueUiState())
    val state: StateFlow<ConfirmQueueUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { _state.update { it.copy(canConfirm = can(PAYMENT_CONFIRM)) } }
        refresh()
    }

    /** Status is a server-side filter, so switching tabs re-fetches rather than filtering a
     *  cached list — the same rule DriversViewModel's `activeOnly` follows. */
    fun setTab(tab: PaymentStatus) {
        if (_state.value.tab == tab) return
        _state.update { it.copy(tab = tab, items = emptyList()) }
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            loadQueue(_state.value.tab).fold(
                onSuccess = { rows ->
                    _state.update { it.copy(items = rows, loading = false, error = null, lastRefreshError = null) }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    _state.update { it.copy(loading = false, error = e.message, lastRefreshError = e) }
                },
            )
        }
    }

    fun openApprove(item: PaymentQueueItem) =
        _state.update { it.copy(sheet = ConfirmSheetState(item = item, mode = ConfirmMode.APPROVE)) }

    fun openReject(item: PaymentQueueItem) =
        _state.update { it.copy(sheet = ConfirmSheetState(item = item, mode = ConfirmMode.REJECT)) }

    fun closeSheet() = _state.update { it.copy(sheet = null) }

    fun setAmountDigits(v: String) = updateSheet { it.copy(amountDigits = v, error = null) }
    fun setAdjustmentNote(v: String) = updateSheet { it.copy(adjustmentNote = v, error = null) }
    fun setNote(v: String) = updateSheet { it.copy(note = v, error = null) }
    fun setRejectReason(v: String) = updateSheet { it.copy(rejectReason = v, error = null) }

    fun setAction(v: DiscrepancyAction?) = updateSheet { it.copy(action = v, error = null) }

    fun submitApprove() {
        val sheet = guardedSheet(ConfirmMode.APPROVE) ?: return
        val changed = sheet.amountChanged
        val short = sheet.hasShortfall
        runAction {
            // Only what the route will actually read. An adjustment note without an amount change,
            // or a discrepancy action on a payment that is not short, would be dropped server-side
            // — sending them would only make the request disagree with what was approved. `short`
            // is re-read from the amount actually being confirmed, so an action chosen against a
            // lower figure and then adjusted away cannot open a discrepancy that no longer exists.
            confirmPayment(
                sheet.item.id,
                if (changed) sheet.amount else null,
                if (changed) sheet.adjustmentNote.trim() else null,
                if (short) sheet.action?.name else null,
                if (short) sheet.note.trim() else null,
            )
        }
    }

    fun submitReject() {
        val sheet = guardedSheet(ConfirmMode.REJECT) ?: return
        runAction { rejectPayment(sheet.item.id, sheet.rejectReason.trim()) }
    }

    /**
     * The four guards both actions share, in the order that gives the owner the most useful
     * reason. They live here and not only on the button: this is the seam a test can reach, and
     * neither call has server-side idempotency behind it.
     */
    private fun guardedSheet(mode: ConfirmMode): ConfirmSheetState? {
        val s = _state.value
        val sheet = s.sheet?.takeIf { it.mode == mode } ?: return null
        if (s.busy) return null
        if (!s.canConfirm) {
            updateSheet { it.copy(error = NO_PERMISSION_MESSAGE) }
            return null
        }
        if (s.isOffline) {
            updateSheet { it.copy(error = OFFLINE_MESSAGE) }
            return null
        }
        val problem = sheet.blocker
        if (problem != null) {
            updateSheet { it.copy(error = problem) }
            return null
        }
        return sheet
    }

    /** Runs the write, then re-fetches: a payment that stayed in the pending tab would be
     *  confirmed a second time, and the route answers that with "Payment is already CONFIRMED". */
    private fun runAction(call: suspend () -> Result<Unit>) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            call().fold(
                onSuccess = {
                    _state.update { it.copy(busy = false, sheet = null) }
                    refresh()
                },
                onFailure = { t ->
                    val message = t.toAppError().message
                    _state.update { it.copy(busy = false, sheet = it.sheet?.copy(error = message)) }
                },
            )
        }
    }

    private fun updateSheet(block: (ConfirmSheetState) -> ConfirmSheetState) =
        _state.update { it.copy(sheet = it.sheet?.let(block)) }
}

@HiltViewModel
class HiltConfirmQueueViewModel @Inject constructor(
    payments: PaymentsRepository,
    permissions: PermissionGate,
) : ConfirmQueueViewModel(
    queue = PaymentQueueUseCase { status -> payments.queue(status) },
    confirm = PaymentConfirmUseCase { id, amount, adjustmentNote, action, note ->
        payments.confirm(id, amount, adjustmentNote, action, note)
    },
    reject = PaymentRejectUseCase { id, reason -> payments.reject(id, reason) },
    permissions = ConfirmPermissionUseCase { action -> permissions.can(action) },
)
