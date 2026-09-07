package uz.etalon.crm.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.HomeRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.TodayDelivery
import java.math.BigDecimal
import javax.inject.Inject

internal const val PERM_DASHBOARD_VIEW_BASIC = "dashboard.viewBasic"
internal const val PERM_DASHBOARD_VIEW = "dashboard.view"

/** The operational tiles: today's deliveries, open discrepancies, receivables. Modelled apart
 *  from [HomeUiState] so "not yet fetched or not permitted" (`null`) can never be confused with
 *  a genuine zero — the defect the Task 7 brief calls out by name. */
data class HomeTiles(
    val todayCount: Int,
    val todayArea: BigDecimal,
    val openDiscrepancies: Int,
    val openDiscrepancyTotal: Money,
    val receivables: Money,
    val receivableOrders: Int,
)

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val today: List<TodayDelivery> = emptyList(),
    /** The signed-in operator's own queue — [uz.etalon.crm.core.data.OutboxRepository.observePendingCount]
     *  is already owner-scoped, so this is never another operator's work. */
    val pendingUploads: Int = 0,
    /** "Not yet known" is not "no" — nothing about the tiles renders before this is true. */
    val permissionsResolved: Boolean = false,
    val hasDashboardAccess: Boolean = false,
    /** Present only once a permitted fetch has actually succeeded; absent (not a zeroed
     *  [HomeTiles]) whenever the operator lacks `dashboard.viewBasic`/`dashboard.view`. */
    val tiles: HomeTiles? = null,
) {
    /** A genuine "nothing scheduled today" — never true while loading, while an error banner
     *  shows, or without dashboard access. That last exclusion matters: without it, a DRIVER
     *  reading this text sees «Бугунга буюртма йўқ» when the truth is "cannot check", which may
     *  include their own deliveries. See [showNoAccessState] for what renders instead. */
    val showEmptyState: Boolean get() = permissionsResolved && hasDashboardAccess && today.isEmpty() && !loading && error == null

    /** The withheld-permission case: a *different* fact from [showEmptyState], and the two must
     *  never share a string. Never an error affordance — the operator cannot act on a permission
     *  they don't hold, so a retry-capable red banner here would be noise, not help. */
    val showNoAccessState: Boolean get() = permissionsResolved && !hasDashboardAccess && !loading && error == null
}

fun interface HomeUseCase { suspend operator fun invoke(): Result<HomeSummary> }
fun interface HomePermissionUseCase { suspend operator fun invoke(action: String): Boolean }
fun interface HomeOutboxUseCase { operator fun invoke(): Flow<Int> }

/**
 * The «Бугун» column. Every signed-in operator gets one — this ViewModel needs no permission to
 * construct — but the one endpoint Task 2/3 modelled for today's deliveries and the operational
 * tiles, `GET /api/dashboard`, is itself gated server-side on `dashboard.viewBasic` OR
 * `dashboard.view` (`withPermissionAny` in `src/app/api/dashboard/route.ts`): a caller holding
 * neither gets a 403 for the *whole* payload, not a trimmed one, and `ROLE_TEMPLATES.DRIVER`
 * holds neither. There is no second, ungated endpoint this slice can read today's deliveries
 * from, so for that population "everyone sees the Бугун column" means the column renders with a
 * distinct "cannot check" state — [HomeUiState.showNoAccessState] — never the "nothing scheduled"
 * text [HomeUiState.showEmptyState] uses, and never an error banner either. The operator's own
 * outbox status (a local, permission-free read) still shows regardless. This is a deliberate
 * deviation from a literal reading of the brief; see the Task 7/8 report for the evidence.
 */
open class HomeViewModel(
    private val home: HomeUseCase,
    private val permissions: HomePermissionUseCase,
    outboxPending: HomeOutboxUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val access = permissions(PERM_DASHBOARD_VIEW_BASIC) || permissions(PERM_DASHBOARD_VIEW)
            _state.update { it.copy(hasDashboardAccess = access, permissionsResolved = true) }
            if (access) load() else _state.update { it.copy(loading = false) }
        }
        viewModelScope.launch {
            outboxPending().collectLatest { n -> _state.update { it.copy(pendingUploads = n) } }
        }
    }

    /** Pull-to-refresh and the error banner's retry. A no-op without dashboard access: there is
     *  nothing server-side this operator may ask for, and asking anyway would only turn a silent
     *  empty state into a 403 the operator cannot act on. */
    fun refresh() {
        if (_state.value.hasDashboardAccess) load()
    }

    private fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            home().fold(
                onSuccess = { s ->
                    _state.update {
                        it.copy(
                            loading = false, error = null,
                            today = s.today,
                            tiles = HomeTiles(
                                todayCount = s.today.size, todayArea = s.todayArea,
                                openDiscrepancies = s.openDiscrepancies, openDiscrepancyTotal = s.openDiscrepancyTotal,
                                receivables = s.receivables, receivableOrders = s.receivableOrders,
                            ),
                        )
                    }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    // A permission withdrawn mid-session (or a client-side check that briefly
                    // raced the server) answers exactly like never having had it: silence, not a
                    // red banner — see the class doc.
                    if (e is AppError.Forbidden) {
                        _state.update {
                            it.copy(loading = false, error = null, hasDashboardAccess = false, tiles = null, today = emptyList())
                        }
                    } else {
                        _state.update { it.copy(loading = false, error = e.message) }
                    }
                },
            )
        }
    }
}

@HiltViewModel
class HiltHomeViewModel @Inject constructor(
    home: HomeRepository,
    outbox: OutboxRepository,
    permissions: PermissionGate,
) : HomeViewModel(
    home = HomeUseCase { home.home() },
    permissions = HomePermissionUseCase { action -> permissions.can(action) },
    outboxPending = HomeOutboxUseCase { outbox.observePendingCount() },
)
