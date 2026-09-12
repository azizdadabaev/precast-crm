package uz.etalon.crm.feature.payments.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DiscrepanciesRepository
import uz.etalon.crm.core.data.PaymentsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.isConflictClass
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentCounts
import uz.etalon.crm.core.model.PaymentQueue
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.ui.format.formatMoneyHero
import javax.inject.Inject

/** Same wording the shipments, drivers and record-payment screens use for a refused action. */
private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

/** Mirrors PaymentsRepository.confirm/reject's own refusal, so the screen never offers an action
 *  the owner cannot perform and the repository never has to be the first to say no. */
private const val NO_PERMISSION_MESSAGE = "Тўловларни тасдиқлашга рухсат йўқ"

private const val PAYMENT_CONFIRM = "payment.confirm"

/** What `GET /api/discrepancies` is gated on, server-side. Ruling R9's second door into the
 *  discrepancies screen is drawn only for an operator who may actually open it. */
private const val DISCREPANCY_VIEW = "discrepancy.view"

/**
 * Ruling R8's two toasts. Kotlin constants rather than string resources for the same reason
 * [OFFLINE_MESSAGE], [NO_PERMISSION_MESSAGE] and every sentence [confirmBlocker] returns are: a
 * ViewModel in this app takes no `Context`, and inventing one seam per message would put the
 * queue's wording in two places. The figure is formatted by `formatMoneyHero` — whose own KDoc
 * names a toast as the case it exists for — so the amount carries its UZS, as design §3.5 draws it.
 */
private const val TOAST_CONFIRMED = "%s тасдиқланди"
private const val TOAST_REJECTED = "Тўлов рад этилди"

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
 * The driver gate itself is NOT restated here: it lives once, in
 * [PaymentQueueItem.expectedFromDriver], which [PaymentQueueItem.shortfall] reads too. Two
 * expressions of one rule would be two things to keep in step.
 */
fun shortfallOf(item: PaymentQueueItem, finalAmount: Money): Money =
    item.expectedFromDriver?.let { (it - finalAmount).coerceAtLeastZero() } ?: Money.ZERO

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
    /**
     * The three tab counts (R7). Null while they are unknown — a first load, or a server old
     * enough not to send them — and the switch then shows its labels without numbers rather than
     * three zeroes, which would read as "there is nothing in any tab".
     *
     * Deliberately NOT cleared when the tab changes or a fetch fails: the counts are computed
     * server-side with every filter except `status`, so they describe the same three tabs
     * whichever one is open, and blanking them mid-switch would flicker the numbers off the
     * control on every tap.
     */
    val counts: PaymentCounts? = null,
    /**
     * Open cash discrepancies, for R9's «Тафовутлар N» pill. Zero means either "none open" or
     * "not allowed to look" — the count is fetched only for an operator holding `discrepancy.view`
     * — and both answers draw the same thing: no pill. One field, because a screen that shows the
     * pill on `N > 0` has no use for the two cases apart.
     */
    val openDiscrepancies: Int = 0,
    /** R8's toast, cleared by the screen after [uz.etalon.crm.core.designsystem.components.TOAST_DURATION_MS]. */
    val toast: String? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    /** The raw error from the last fetch, kept (not only its message) so [isOffline] is derived
     *  from its real type — the same shape DriversUiState uses. */
    val lastRefreshError: AppError? = null,
    val canConfirm: Boolean = false,
    /**
     * The third state [canConfirm] cannot express. "Not yet known" is not "no", and treating it
     * as one flashed the no-permission notice at every owner for a frame on entry. The guards
     * keep reading the plain Boolean, which fails closed; only what is SHOWN waits.
     */
    val permissionsResolved: Boolean = false,
    val sheet: ConfirmSheetState? = null,
) {
    /** Shown only once the answer is known — and as a neutral notice, not an error: an ACCOUNTANT
     *  holds `payment.view` without `payment.confirm` by design, and reads this queue on purpose. */
    val showNoConfirmPermission: Boolean get() = permissionsResolved && !canConfirm

    /** Never true alongside [error] or while loading: an empty list next to an error banner reads
     *  as "no payments" when the truth is "couldn't check". */
    val showEmptyState: Boolean get() = items.isEmpty() && !loading && error == null

    /** Neither confirm nor reject is `withIdempotency`-wrapped server-side, so neither may ever be
     *  queued — with no signal they are refused rather than sent and failed. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network

    /** The open tab's own figure off [counts] — the number the switch draws beside its label. */
    val tabCount: Int? get() = counts?.let { tabCountOf(it, tab) }

    /**
     * `GET /api/payments` caps its rows at `LIST_LIMIT` (500) while `counts` is computed with no
     * cap at all, so on a business's third year the «Тасдиқланган» pill reads a figure the list
     * under it cannot reach. Unsaid, the last row reads as the oldest payment there is.
     *
     * Excluded while loading and beside either banner for the same reason [showEmptyState] is:
     * a sentence about what is missing from the list, next to "couldn't check", describes the
     * wrong thing. And never over an empty list, where the count and the emptiness contradict
     * each other outright.
     */
    val showTruncatedNotice: Boolean
        get() = !loading && error == null && !isOffline &&
            items.isNotEmpty() && (tabCount ?: 0) > items.size
}

/** Which of the three figures belongs beside which tab (R7). The screen reads it for all three
 *  labels; [ConfirmQueueUiState.tabCount] reads it for the open one. */
internal fun tabCountOf(counts: PaymentCounts, tab: PaymentStatus): Int? = when (tab) {
    PaymentStatus.PENDING_CONFIRMATION -> counts.pending
    PaymentStatus.CONFIRMED -> counts.confirmed
    PaymentStatus.REJECTED -> counts.rejected
    PaymentStatus.UNKNOWN -> null
}

fun interface PaymentQueueUseCase {
    suspend operator fun invoke(status: PaymentStatus): Result<PaymentQueue>
}

/** How many cash discrepancies are still OPEN, for R9's header pill. A seam like the four above
 *  so the count can be fixed in a test without a repository. */
fun interface OpenDiscrepancyCountUseCase {
    suspend operator fun invoke(): Result<Int>
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
    openDiscrepancies: OpenDiscrepancyCountUseCase = OpenDiscrepancyCountUseCase { Result.success(0) },
) : ViewModel() {
    private val loadQueue = queue
    private val confirmPayment = confirm
    private val rejectPayment = reject
    private val can = permissions
    private val countOpenDiscrepancies = openDiscrepancies

    private val _state = MutableStateFlow(ConfirmQueueUiState())
    val state: StateFlow<ConfirmQueueUiState> = _state.asStateFlow()

    /** Not on the state: nothing draws it. It exists only so a re-count after a confirmation does
     *  not fire a request that the server would answer with 403. */
    private var mayReadDiscrepancies = false

    init {
        viewModelScope.launch {
            val confirm0 = can(PAYMENT_CONFIRM)
            _state.update { it.copy(canConfirm = confirm0, permissionsResolved = true) }
            mayReadDiscrepancies = can(DISCREPANCY_VIEW)
            loadDiscrepancyCount()
        }
        refresh()
    }

    /**
     * R9's pill count. A failure is SILENT: this is a secondary door to a screen the Home avatar
     * sheet already opens, and an error banner over the payments queue about a list the owner did
     * not ask for would bury the one that matters. Nothing is logged either — the count is a
     * figure about money the owner holds, not a diagnostic.
     */
    private suspend fun loadDiscrepancyCount() {
        if (!mayReadDiscrepancies) return
        countOpenDiscrepancies().onSuccess { n -> _state.update { it.copy(openDiscrepancies = n) } }
    }

    /** Status is a server-side filter, so switching tabs re-fetches rather than filtering a
     *  cached list — the same rule DriversViewModel's `activeOnly` follows. */
    fun setTab(tab: PaymentStatus) {
        if (_state.value.tab == tab) return
        _state.update { it.copy(tab = tab, items = emptyList()) }
        refresh()
    }

    fun refresh() = reload(carry = null)

    /** [carry] is a message the refresh must NOT erase — the reason the list is being re-read in
     *  the first place, when a write failed because the row had already moved on. */
    private fun reload(carry: String?) {
        _state.update { it.copy(loading = true, error = carry) }
        viewModelScope.launch {
            loadQueue(_state.value.tab).fold(
                onSuccess = { page ->
                    _state.update {
                        it.copy(
                            items = page.items,
                            // Null counts (an older server) leave the last known ones standing
                            // rather than blanking the switch mid-session.
                            counts = page.counts ?: it.counts,
                            loading = false, error = carry, lastRefreshError = null,
                        )
                    }
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
        // The figure the owner actually confirmed, not the one that was recorded — captured here
        // because the sheet is gone by the time the toast is shown.
        val confirmed = sheet.amount
        runAction(
            toast = TOAST_CONFIRMED.format(formatMoneyHero(confirmed)),
            // A TRACK confirmation opens a new discrepancy row, so R9's pill would otherwise
            // carry yesterday's count until the tab was left and re-entered.
            recountDiscrepancies = short,
        ) {
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
        runAction(toast = TOAST_REJECTED) { rejectPayment(sheet.item.id, sheet.rejectReason.trim()) }
    }

    /** R8: the screen shows the toast for [uz.etalon.crm.core.designsystem.components.TOAST_DURATION_MS]
     *  and then calls this. The ViewModel does not time it — only the screen knows whether the
     *  toast was ever on screen, and a composition that never ran must not consume one. */
    fun clearToast() = _state.update { it.copy(toast = null) }

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

    /**
     * Runs the write, then re-fetches: a payment that stayed in the pending tab would be
     * confirmed a second time, and the route answers that with "Тўлов аллақачон CONFIRMED".
     *
     * A FAILURE re-fetches too when it is conflict-class — and that is the failure that most
     * needs it. "Someone else already confirmed this" leaves the row on screen still looking
     * actionable, so the owner retries an action that can never succeed. The sheet stays open
     * only for a network-class failure, where retrying is the whole point.
     */
    private fun runAction(
        toast: String,
        recountDiscrepancies: Boolean = false,
        call: suspend () -> Result<Unit>,
    ) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            call().fold(
                onSuccess = {
                    _state.update { it.copy(busy = false, sheet = null, toast = toast) }
                    refresh()
                    if (recountDiscrepancies) loadDiscrepancyCount()
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    if (e.isConflictClass) {
                        _state.update { it.copy(busy = false, sheet = null) }
                        reload(carry = e.message)
                    } else {
                        _state.update { it.copy(busy = false, sheet = it.sheet?.copy(error = e.message)) }
                    }
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
    discrepancies: DiscrepanciesRepository,
    permissions: PermissionGate,
) : ConfirmQueueViewModel(
    queue = PaymentQueueUseCase { status -> payments.queue(status) },
    confirm = PaymentConfirmUseCase { id, amount, adjustmentNote, action, note ->
        payments.confirm(id, amount, adjustmentNote, action, note)
    },
    reject = PaymentRejectUseCase { id, reason -> payments.reject(id, reason) },
    permissions = ConfirmPermissionUseCase { action -> permissions.can(action) },
    // The existing list route, read for its size alone: the discrepancies screen itself is what
    // shows the rows, and this ViewModel only needs the figure for R9's pill.
    openDiscrepancies = OpenDiscrepancyCountUseCase {
        discrepancies.list(status = DiscrepancyStatus.OPEN).map { it.size }
    },
)
