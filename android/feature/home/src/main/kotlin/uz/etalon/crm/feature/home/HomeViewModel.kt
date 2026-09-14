package uz.etalon.crm.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.CalculatorRepository
import uz.etalon.crm.core.data.HomeRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.AllTimeMoney
import uz.etalon.crm.core.model.Aov
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthBooked
import uz.etalon.crm.core.model.MonthOrders
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PeriodMoney
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TodayDelivery
import java.math.BigDecimal
import java.math.RoundingMode
import javax.inject.Inject

internal const val PERM_DASHBOARD_VIEW_BASIC = "dashboard.viewBasic"
internal const val PERM_DASHBOARD_VIEW = "dashboard.view"

/** How many months a rail sparkline draws (design §2.3). The series are cut to this here rather
 *  than in composition, so the screen is handed exactly what it renders. */
private const val SPARKLINE_MONTHS = 8

/**
 * Every figure the dashboard's top half renders (design §2.2–§2.4), modelled apart from
 * [HomeUiState] so "not yet fetched or not permitted" (`null`) can never be confused with a
 * genuine zero — the defect the Task 7 brief calls out by name.
 *
 * The three series are already windowed and already `BigDecimal`: sparkline geometry is the one
 * place a figure stops being money, and doing that division in composition would redo it on every
 * recomposition of a screen that scrolls.
 */
data class HomeDashboard(
    // §2.2 — the receivables hero.
    val receivables: Money,
    val receivableOrders: Int,
    val paidOrders: Int,
    val partialOrders: Int,
    val awaitingOrders: Int,
    // §2.3 — the financial rail. Each card: this month, its trend, its all-time line, its series.
    val booked: PeriodMoney,
    val bookedAllTime: AllTimeMoney,
    val bookedSeries: List<BigDecimal>,
    val collected: PeriodMoney,
    val collectedAllTime: AllTimeMoney,
    val collectedSeries: List<BigDecimal>,
    val aov: Aov,
    val aovSeries: List<BigDecimal>,
    // §2.4 — the operational grid.
    val activeCustomers: Int,
    val todayArea: BigDecimal,
    val openDiscrepancies: Int,
    val openDiscrepancyTotal: Money,
    /** Absent when the server's `loadedVolumeByMonth` carries no row for [currentMonthKey] — the
     *  card then reads «Бу ой юк йўқ» rather than a zeroed figure. */
    val loadedThisMonth: LoadedVolume?,
    /** `"2026-09"`, the month the whole screen is about; the loaded card names it. */
    val currentMonthKey: String,
)

/**
 * §2.3's AOV series: each month's bookings divided by that month's order count, in whole UZS.
 *
 * The brief's own formula (`bookedByMonth[i].booked ÷ ordersByMonth[i].count`), taken in
 * [BigDecimal] with [RoundingMode.HALF_UP] to match the web's `Math.round` — never a `Double`,
 * and never a rounding the server would not have done. A month with no orders has no average at
 * all, so it contributes **zero** rather than a division by zero or a carried-forward value.
 *
 * The two arrays are paired by month key rather than by index: they arrive the same length and in
 * the same order today, but an index pairing that silently slips by one would divide September's
 * bookings by August's count and nothing on screen would look wrong.
 */
internal fun aovSeries(
    booked: List<MonthBooked>,
    orders: List<MonthOrders>,
    months: Int = SPARKLINE_MONTHS,
): List<BigDecimal> {
    val countOf = orders.associate { it.month to it.count }
    return booked.takeLast(months).map { m ->
        val count = countOf[m.month] ?: 0
        if (count <= 0) BigDecimal.ZERO
        else m.booked.amount.divide(BigDecimal(count), 0, RoundingMode.HALF_UP)
    }
}

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val today: List<TodayDelivery> = emptyList(),
    /** The «Сўнгги буюртмалар» card: the most recently scheduled orders, newest first. Empty
     *  without dashboard access, for the same reason [today] is. */
    val recent: List<RecentOrder> = emptyList(),
    /** The signed-in operator's own queue — [uz.etalon.crm.core.data.OutboxRepository.observePendingCount]
     *  is already owner-scoped, so this is never another operator's work. */
    val pendingUploads: Int = 0,
    /** Orders the server permanently refused while they sat in that queue (design D10, ruling R6).
     *  By the time a rejection arrives the calculator has long been cleared, so the bell is the
     *  only surface that can tell the operator it happened — see
     *  [uz.etalon.crm.core.data.CalculatorRepository.observeRejectedOrders]. */
    val rejectedOrders: List<RejectedOrder> = emptyList(),
    /** Ruling I3: set once a rejected order's own figures have been written back as the
     *  calculator's draft. The route reads it, switches to the calculator tab and clears it —
     *  one navigation per tap, whatever recompositions happen in between. */
    val reopenedInCalculator: Boolean = false,
    /** Why a re-open failed, in Uzbek, shown above the list. Nothing was deleted — the row is
     *  still there to try again or to dismiss. */
    val reopenError: String? = null,
    /** "Not yet known" is not "no" — nothing about the dashboard renders before this is true. */
    val permissionsResolved: Boolean = false,
    val hasDashboardAccess: Boolean = false,
    /** Present only once a permitted fetch has actually succeeded; absent (not a zeroed
     *  [HomeDashboard]) whenever the operator lacks `dashboard.viewBasic`/`dashboard.view`. */
    val dash: HomeDashboard? = null,
) {
    /** §2.4's «Бугунги етказишлар» bar: how much of today is already out of the yard. DISPATCHED
     *  and DELIVERED both count — a truck on the road has left, whether or not it has arrived. */
    val todayDone: Int get() = today.count {
        it.status == OrderStatus.DISPATCHED || it.status == OrderStatus.DELIVERED
    }

    /** What the bell badges: work still unsent PLUS rejections nobody has read yet. Both are the
     *  operator's own outbox and both are dismissed from the one sheet, so one dot counts them —
     *  a rejection that showed no badge would sit unread behind a bell that looked idle. */
    val outboxBadge: Int get() = pendingUploads + rejectedOrders.size

    /** A genuine "nothing scheduled today" — never true while loading, while an error banner
     *  shows, or without dashboard access. That last exclusion matters: without it, a DRIVER
     *  reading this text sees «Бугунга буюртма йўқ» when the truth is "cannot check", which may
     *  include their own deliveries. See [showNoAccessState] for what renders instead. */
    val showEmptyState: Boolean get() = permissionsResolved && hasDashboardAccess && today.isEmpty() && !loading && error == null

    /** The withheld-permission case: a *different* fact from [showEmptyState], and the two must
     *  never share a string. Never an error affordance — the operator cannot act on a permission
     *  they don't hold, so a retry-capable red banner here would be noise, not help. */
    val showNoAccessState: Boolean get() = permissionsResolved && !hasDashboardAccess && !loading && error == null

    /** The recent card's «Ҳали буюртма йўқ» follows the same rule as [showEmptyState]: it may only
     *  appear once a permitted fetch has actually settled, so it never stands in for "still
     *  loading" or for a refresh that failed. Until then the card is not drawn at all. */
    val showRecentEmpty: Boolean get() = permissionsResolved && hasDashboardAccess && recent.isEmpty() && !loading && error == null
}

fun interface HomeUseCase { suspend operator fun invoke(): Result<HomeSummary> }
fun interface HomePermissionUseCase { suspend operator fun invoke(action: String): Boolean }
fun interface HomeOutboxUseCase { operator fun invoke(): Flow<Int> }
fun interface HomeRejectedOrdersUseCase { operator fun invoke(): Flow<List<RejectedOrder>> }
fun interface HomeDiscardRejectedOrderUseCase { suspend operator fun invoke(id: String) }

/** Ruling I3: writes a rejected order's payload back as the calculator's draft and drops the row —
 *  see `CalculatorRepository.reopenRejectedOrder` for what survives that round trip. */
fun interface HomeReopenRejectedOrderUseCase { suspend operator fun invoke(id: String): Result<Unit> }

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
    // Defaulted to nothing at all so the existing tests — and any caller that has no interest in
    // the queue — need not know these exist. A Home with no rejections is the ordinary Home.
    rejectedOrders: HomeRejectedOrdersUseCase = HomeRejectedOrdersUseCase { flowOf(emptyList()) },
    private val discardRejected: HomeDiscardRejectedOrderUseCase = HomeDiscardRejectedOrderUseCase { },
    private val reopenRejected: HomeReopenRejectedOrderUseCase = HomeReopenRejectedOrderUseCase { Result.success(Unit) },
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
        // Rejections outlive the quote they came from, so this is collected for the whole life of
        // the screen rather than once: one can land while Home is already open.
        viewModelScope.launch {
            rejectedOrders().collectLatest { rows -> _state.update { it.copy(rejectedOrders = rows) } }
        }
    }

    /** «Тушунарли» on the outbox sheet: the operator has read the rejection and the row goes for
     *  good. The list refreshes itself — the flow above is watching the same rows. */
    fun discardRejectedOrder(id: String) {
        viewModelScope.launch { discardRejected(id) }
    }

    /**
     * «Калькуляторда очиш»: the refused order becomes the calculator's draft and the row goes.
     *
     * On success the route is told to switch tabs ([HomeUiState.reopenedInCalculator]); on failure
     * the sheet says why and the row stays. The list needs no nudging either way — the rejections
     * flow is watching the same rows.
     */
    fun reopenRejectedOrder(id: String) {
        viewModelScope.launch {
            reopenRejected(id).fold(
                onSuccess = { _state.update { it.copy(reopenedInCalculator = true, reopenError = null) } },
                onFailure = { t -> _state.update { it.copy(reopenError = t.toAppError().message) } },
            )
        }
    }

    /** The route has switched to the calculator; the flag is spent. */
    fun consumeReopen() {
        _state.update { it.copy(reopenedInCalculator = false) }
    }

    /** The sheet closed: a failed re-open's message must not greet the next opening, which may
     *  be about a different row entirely. */
    fun dismissReopenError() {
        _state.update { it.copy(reopenError = null) }
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
                            today = s.today, recent = s.recent,
                            dash = HomeDashboard(
                                receivables = s.receivables, receivableOrders = s.receivableOrders,
                                paidOrders = s.paidOrders, partialOrders = s.partialOrders,
                                awaitingOrders = s.awaitingOrders,
                                booked = s.booked, bookedAllTime = s.bookedAllTime,
                                bookedSeries = s.bookedByMonth.takeLast(SPARKLINE_MONTHS).map { it.booked.amount },
                                collected = s.collected, collectedAllTime = s.collectedAllTime,
                                collectedSeries = s.collectedByMonth.takeLast(SPARKLINE_MONTHS).map { it.collected.amount },
                                aov = s.aov, aovSeries = aovSeries(s.bookedByMonth, s.ordersByMonth),
                                activeCustomers = s.activeCustomers,
                                todayArea = s.todayArea,
                                openDiscrepancies = s.openDiscrepancies,
                                openDiscrepancyTotal = s.openDiscrepancyTotal,
                                loadedThisMonth = s.loadedThisMonth,
                                currentMonthKey = s.currentMonthKey,
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
                            it.copy(
                                loading = false, error = null, hasDashboardAccess = false,
                                dash = null, today = emptyList(), recent = emptyList(),
                            )
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
    calculator: CalculatorRepository,
) : HomeViewModel(
    home = HomeUseCase { home.home() },
    permissions = HomePermissionUseCase { action -> permissions.can(action) },
    outboxPending = HomeOutboxUseCase { outbox.observePendingCount() },
    rejectedOrders = HomeRejectedOrdersUseCase { calculator.observeRejectedOrders() },
    discardRejected = HomeDiscardRejectedOrderUseCase { id -> calculator.discardRejectedOrder(id) },
    reopenRejected = HomeReopenRejectedOrderUseCase { id -> calculator.reopenRejectedOrder(id) },
)
