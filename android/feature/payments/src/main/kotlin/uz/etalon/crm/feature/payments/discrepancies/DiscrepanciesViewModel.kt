package uz.etalon.crm.feature.payments.discrepancies

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DiscrepanciesRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import javax.inject.Inject

/** Same wording the confirm queue and record-payment screens use for a refused action. */
private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

/** Mirrors DiscrepanciesRepository.resolve's own refusal, so the screen never offers an action
 *  the owner cannot perform and the repository never has to be the first to say no. */
private const val NO_PERMISSION_MESSAGE = "Тафовутларни ҳал қилишга рухсат йўқ"

private const val DISCREPANCY_RESOLVE = "discrepancy.resolve"

/** `resolutionNote` and `DiscrepancyUpdateSchema` both say `min(5)`. */
private const val MIN_NOTE = 5

/** `resolutionNote` is `z.string().min(5).max(500)`. */
private const val MAX_NOTE = 500

/**
 * The four resolutions the route treats as closing the discrepancy — every [DiscrepancyStatus]
 * except OPEN and UNKNOWN. OPEN is deliberately never offered here: the route clears the
 * resolver (`resolvedById`/`resolvedAt` both go to null) rather than setting one when it sees
 * OPEN, so presenting it in this list would read as a "resolution" when it is really the
 * opposite — a re-open. A re-open is not a feature this screen offers.
 */
val RESOLUTION_OPTIONS = listOf(
    DiscrepancyStatus.RESOLVED_RECOVERED,
    DiscrepancyStatus.RESOLVED_DISCOUNT,
    DiscrepancyStatus.RESOLVED_WRITEOFF,
    DiscrepancyStatus.DISPUTED,
)

/**
 * `DiscrepancyUpdateSchema`'s own requirements, applied before the network: a 422 arrives after
 * the owner has put the phone away, and the discrepancy is still open.
 *
 * Returns null when the resolution may go, or the Uzbek reason it may not.
 */
fun resolveBlocker(status: DiscrepancyStatus?, note: String): String? {
    if (status == null) return "Ҳал қилиш турини танланг"
    val trimmed = note.trim()
    return when {
        trimmed.length < MIN_NOTE -> "Изоҳ (мин. $MIN_NOTE белги) керак"
        trimmed.length > MAX_NOTE -> "Изоҳ $MAX_NOTE белгидан ошмаслиги керак"
        else -> null
    }
}

/**
 * The open sheet. Held in the ViewModel rather than in the composition so that what the owner
 * typed survives a rotation, and so the guard lives at the seam a test reaches.
 */
data class ResolveSheetState(
    val discrepancy: Discrepancy,
    val status: DiscrepancyStatus? = null,
    val note: String = "",
    val error: String? = null,
) {
    val blocker: String? get() = resolveBlocker(status, note)

    /**
     * True when this discrepancy already went through a resolve pass. The sheet always opens
     * blank — [status] and [note] start empty regardless — so without this, an owner replacing
     * an earlier RESOLVED_DISCOUNT with RESOLVED_WRITEOFF would never see the decision they are
     * overwriting; the route replaces the resolver, the timestamp and the note with no warning.
     * The screen reads this to show the existing status and note, read-only, before the choices.
     */
    val hasExistingResolution: Boolean
        get() = discrepancy.status != DiscrepancyStatus.OPEN && discrepancy.status != DiscrepancyStatus.UNKNOWN
}

data class DiscrepanciesUiState(
    val items: List<Discrepancy> = emptyList(),
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    /** The raw error from the last fetch, kept (not only its message) so [isOffline] is derived
     *  from its real type — the same shape ConfirmQueueUiState uses. */
    val lastRefreshError: AppError? = null,
    val canResolve: Boolean = false,
    val sheet: ResolveSheetState? = null,
) {
    /** Never true alongside [error] or while loading: an empty list next to an error banner reads
     *  as "no discrepancies" when the truth is "couldn't check". */
    val showEmptyState: Boolean get() = items.isEmpty() && !loading && error == null

    /** `PATCH /api/discrepancies/{id}` is not `withIdempotency`-wrapped server-side, so it may
     *  never be queued — with no signal it is refused rather than sent and failed. */
    val isOffline: Boolean get() = lastRefreshError is AppError.Network
}

/** OPEN and DISPUTED both still need attention — DISPUTED means an HR/disciplinary process is
 *  under way, not that the cash question is settled. */
private fun isUnfinished(status: DiscrepancyStatus) =
    status == DiscrepancyStatus.OPEN || status == DiscrepancyStatus.DISPUTED

/**
 * Unfinished rows (OPEN, DISPUTED) before resolved ones, so the actionable rows do not sink
 * under a long resolved history. `sortedBy` is a stable sort, so within each group the server's
 * own `reportedAt` order — the list route's own ordering — is left untouched.
 */
private fun sortedForList(rows: List<Discrepancy>): List<Discrepancy> =
    rows.sortedBy { if (isUnfinished(it.status)) 0 else 1 }

fun interface DiscrepancyListUseCase {
    suspend operator fun invoke(): Result<List<Discrepancy>>
}

fun interface DiscrepancyResolveUseCase {
    suspend operator fun invoke(id: String, status: DiscrepancyStatus, note: String): Result<Unit>
}

fun interface DiscrepancyPermissionUseCase {
    suspend operator fun invoke(action: String): Boolean
}

/**
 * Cash discrepancies flagged when a driver's collection came back short, and their resolution.
 * Online-only, exactly like the confirm queue: neither write behind this screen carries
 * server-side idempotency.
 */
open class DiscrepanciesViewModel(
    list: DiscrepancyListUseCase,
    resolve: DiscrepancyResolveUseCase,
    permissions: DiscrepancyPermissionUseCase,
) : ViewModel() {
    private val loadList = list
    private val resolveDiscrepancy = resolve
    private val can = permissions

    private val _state = MutableStateFlow(DiscrepanciesUiState())
    val state: StateFlow<DiscrepanciesUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { _state.update { it.copy(canResolve = can(DISCREPANCY_RESOLVE)) } }
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            loadList().fold(
                onSuccess = { rows ->
                    _state.update { it.copy(items = sortedForList(rows), loading = false, error = null, lastRefreshError = null) }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    _state.update { it.copy(loading = false, error = e.message, lastRefreshError = e) }
                },
            )
        }
    }

    fun openResolve(d: Discrepancy) = _state.update { it.copy(sheet = ResolveSheetState(discrepancy = d)) }
    fun closeSheet() = _state.update { it.copy(sheet = null) }

    fun setStatus(v: DiscrepancyStatus) = updateSheet { it.copy(status = v, error = null) }
    fun setNote(v: String) = updateSheet { it.copy(note = v, error = null) }

    fun submitResolve() {
        val sheet = guardedSheet() ?: return
        val status = requireNotNull(sheet.status) // guardedSheet's blocker check already ensures this
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            resolveDiscrepancy(sheet.discrepancy.id, status, sheet.note.trim()).fold(
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

    /**
     * The three guards the action shares, in the order that gives the owner the most useful
     * reason. They live here and not only on the button: this is the seam a test can reach, and
     * the resolve route carries no server-side idempotency behind it.
     */
    private fun guardedSheet(): ResolveSheetState? {
        val s = _state.value
        val sheet = s.sheet ?: return null
        if (s.busy) return null
        if (!s.canResolve) {
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

    private fun updateSheet(block: (ResolveSheetState) -> ResolveSheetState) =
        _state.update { it.copy(sheet = it.sheet?.let(block)) }
}

@HiltViewModel
class HiltDiscrepanciesViewModel @Inject constructor(
    discrepancies: DiscrepanciesRepository,
    permissions: PermissionGate,
) : DiscrepanciesViewModel(
    list = DiscrepancyListUseCase { discrepancies.list() },
    resolve = DiscrepancyResolveUseCase { id, status, note -> discrepancies.resolve(id, status, note) },
    permissions = DiscrepancyPermissionUseCase { action -> permissions.can(action) },
)
