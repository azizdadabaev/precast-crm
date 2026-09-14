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
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PeriodMoney
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.RegionOrders
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.TopCustomer
import uz.etalon.crm.core.model.monthScope
import java.math.BigDecimal
import javax.inject.Inject

internal const val PERM_DASHBOARD_VIEW_BASIC = "dashboard.viewBasic"
internal const val PERM_DASHBOARD_VIEW = "dashboard.view"

/** §2.6: the card lists the five biggest payers, ranked here rather than trusted from the wire —
 *  the web sorts the same array before it draws it. */
private const val TOP_CUSTOMERS = 5

/** §2.7: how many of the server's `recentOrders` the card draws. */
private const val RECENT_ROWS = 4

/**
 * Every figure the dashboard renders (design §2.2–§2.7 and §2b), modelled apart from
 * [HomeUiState] so "not yet fetched or not permitted" (`null`) can never be confused with a
 * genuine zero — the defect the Task 7 brief calls out by name.
 *
 * The three series are already windowed and already `BigDecimal`: sparkline geometry is the one
 * place a figure stops being money, and doing that division in composition would redo it on every
 * recomposition of a screen that scrolls.
 *
 * §2.3b: the rail's own figures come from [uz.etalon.crm.core.model.monthScope] for the month the
 * operator picked in the chart, not from the server's `bookedThisMonth` fields — for the current
 * month the two are the same numbers, and for any other month only the series can answer. What
 * does NOT follow the picker is written down beside each field: the receivables hero, the all-time
 * lines, the donut, the top clients, the recent orders and the region ranking.
 */
data class HomeDashboard(
    // §2.2 — the receivables hero. A point-in-time balance: it never follows the month picker.
    val receivables: Money,
    val receivableOrders: Int,
    val paidOrders: Int,
    val partialOrders: Int,
    val awaitingOrders: Int,
    // §2.3 / §2.3b — the financial rail, scoped to the SELECTED month. Each card: that month's
    // figure, its trend against the month before it, its all-time line (which does not move), and
    // the eight months ending at the selection.
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
    /** The SELECTED month's `loadedVolumeByMonth` row, found by its key. Absent when that month
     *  loaded nothing — the card then reads «Бу ой юк йўқ» rather than a zeroed figure. */
    val loadedThisMonth: LoadedVolume?,
    /** `"2026-09"` — the month the rail and the loaded tile are about, which is the month the
     *  operator picked in the chart and not necessarily the current one. */
    val monthKey: String,
    /** Whether [monthKey] is the month containing today: what decides «ушбу ой» from «{ой} ойи»
     *  in every scoped line, and the only thing the current month is special about. */
    val isCurrentMonth: Boolean,
    /** The selected month's own order count — what the chart's sub-line names when a past month
     *  is picked. (The rail reads the same figure through [booked]`.count`.) */
    val monthOrders: Int,
    // §2.6 — the five biggest payers, already ranked and already cut to five. All-time: they do
    // not follow the picker either.
    val topCustomers: List<TopCustomer>,
    // §2.3b — the twelve-month chart that IS the picker.
    /** Twelve months of bookings, oldest first, index-aligned with [chartCollected] and
     *  [chartMonthKeys]. */
    val chartBooked: List<Money>,
    val chartCollected: List<Money>,
    /** `YYYY-MM` per column. The screen turns these into the short Uzbek names under the columns —
     *  month names are the UI's business and the server's own labels are not always month names
     *  (a test fixture's are its keys). */
    val chartMonthKeys: List<String>,
    val selectedMonthIdx: Int,
    val currentMonthIdx: Int,
    /** Σ `ordersByMonth` — «N та буюртма · сўнгги 12 ой» while the current month is selected. */
    val yearOrders: Int,
    // §2.6b — the province league table. All-time by construction: the aggregation has no time
    // axis at all, so the month picker cannot reach it and the card's own sub-line says so.
    val ordersByRegion: List<RegionOrders>,
)

/**
 * §2.6's ranking: the biggest payers first, cut to [TOP_CUSTOMERS].
 *
 * Sorted here rather than drawn in the order the array happened to arrive — `RegionRanking`'s
 * array says in so many words that it is already ranked and this one does not, and a card whose
 * bars run the wrong way reads as a rendering bug. `sortedByDescending` is stable, so two clients
 * who have paid exactly the same keep the server's order between them.
 */
internal fun topCustomers(all: List<TopCustomer>, limit: Int = TOP_CUSTOMERS): List<TopCustomer> =
    all.sortedByDescending { it.totalCollected }.take(limit)

/**
 * The [HomeDashboard] a payload and a month selection make together (design §2.3b).
 *
 * Pure, so the selection can be re-applied to a fresh payload after a refresh without a second
 * network read, and so both halves — "what the server sent" and "which month is picked" — are
 * visible in one place. [monthScope] is the web's own arithmetic, ported; everything that does NOT
 * follow the picker is copied straight off [s].
 */
internal fun dashboard(s: HomeSummary, selectedIdx: Int): HomeDashboard {
    val scope = monthScope(s, selectedIdx)
    return HomeDashboard(
        receivables = s.receivables, receivableOrders = s.receivableOrders,
        paidOrders = s.paidOrders, partialOrders = s.partialOrders, awaitingOrders = s.awaitingOrders,
        booked = scope.booked, bookedAllTime = s.bookedAllTime,
        bookedSeries = scope.bookedSeries.map { it.amount },
        collected = scope.collected, collectedAllTime = s.collectedAllTime,
        collectedSeries = scope.collectedSeries.map { it.amount },
        aov = scope.aov, aovSeries = scope.aovSeries.map { it.amount },
        activeCustomers = s.activeCustomers,
        todayArea = s.todayArea,
        openDiscrepancies = s.openDiscrepancies,
        openDiscrepancyTotal = s.openDiscrepancyTotal,
        loadedThisMonth = scope.loaded,
        monthKey = scope.monthKey,
        isCurrentMonth = scope.isCurrent,
        monthOrders = scope.booked.count,
        topCustomers = topCustomers(s.topCustomers),
        chartBooked = s.bookedByMonth.map { it.booked },
        chartCollected = s.collectedByMonth.map { it.collected },
        chartMonthKeys = s.monthKeys,
        selectedMonthIdx = scope.idx,
        currentMonthIdx = clampToSeries(s, s.currentMonthIdx),
        yearOrders = s.ordersByMonth.sumOf { it.count },
        ordersByRegion = s.ordersByRegion,
    )
}

/** An index into the month series, clamped the way `dashboard/page.tsx:84-86` clamps it — a
 *  selection that survived a refresh which shortened the window must not index past its end. */
internal fun clampToSeries(s: HomeSummary, idx: Int): Int =
    idx.coerceIn(0, maxOf(s.bookedByMonth.size - 1, 0))

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val today: List<TodayDelivery> = emptyList(),
    /** The «Сўнгги буюртмалар» card: the most recently scheduled orders, newest first, already cut
     *  to the [RECENT_ROWS] the card draws. Empty without dashboard access, for the same reason
     *  [today] is. */
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

    /** The payload the screen is currently drawn from, kept so a month can be re-picked without
     *  asking the server again — the whole twelve-month series is already in hand. */
    private var summary: HomeSummary? = null

    /**
     * Which month the rail is scoped to, or `null` for "follow the current month".
     *
     * `null` rather than an eagerly-resolved index, for the reason `dashboard/page.tsx` keeps the
     * same distinction: a refresh that adds a month must move an operator who never picked one
     * onto the new current month, and must leave an operator who picked August on August.
     */
    private var selectedMonthIdx: Int? = null

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

    /**
     * §2.3b: the operator tapped a column of the twelve-month chart.
     *
     * Tapping the month that is already picked returns to the current one, so the chart is its own
     * way back and no extra control is needed. The index is clamped into the series first, which
     * makes "tap the selected one again" mean the same thing however the tap arrived.
     *
     * Nothing is fetched: the payload already carries all twelve months, and the figures are
     * recomputed from it by the same arithmetic the server used for the current month.
     */
    fun selectMonth(idx: Int) {
        val s = summary ?: return
        val wanted = clampToSeries(s, idx)
        val showing = selectedMonthIdx ?: clampToSeries(s, s.currentMonthIdx)
        selectedMonthIdx = if (wanted == showing) null else wanted
        _state.update { it.copy(dash = dashboard(s, selectedMonthIdx ?: s.currentMonthIdx)) }
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
                    summary = s
                    // A month the operator picked survives the refresh, re-clamped against the
                    // window that just arrived; one they never picked follows the current month.
                    val idx = selectedMonthIdx?.let { clampToSeries(s, it) }
                    selectedMonthIdx = idx
                    _state.update {
                        it.copy(
                            loading = false, error = null,
                            today = s.today, recent = s.recent.take(RECENT_ROWS),
                            dash = dashboard(s, idx ?: s.currentMonthIdx),
                        )
                    }
                },
                onFailure = { t ->
                    val e = t.toAppError()
                    // A permission withdrawn mid-session (or a client-side check that briefly
                    // raced the server) answers exactly like never having had it: silence, not a
                    // red banner — see the class doc.
                    if (e is AppError.Forbidden) {
                        // The payload is gone with the permission, and so is the month picked in
                        // it: `selectMonth` has nothing to recompute from and says so by doing
                        // nothing.
                        summary = null
                        selectedMonthIdx = null
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
