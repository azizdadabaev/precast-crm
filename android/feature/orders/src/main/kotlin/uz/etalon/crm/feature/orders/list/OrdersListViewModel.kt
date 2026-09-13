package uz.etalon.crm.feature.orders.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.CapacityRepository
import uz.etalon.crm.core.data.ExportRepository
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.datastore.OrdersPrefs
import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderFacets
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OrdersView
import uz.etalon.crm.core.model.PaymentFilter
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.core.ui.format.TASHKENT
import java.io.File
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth
import javax.inject.Inject

/** Rows fetched per page; the list appends a page at a time as the user scrolls. */
private const val PAGE_SIZE = 50

/** Test seam over OrdersRepository. */
interface OrdersSource {
    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>>
    suspend fun refreshList(filter: OrdersFilter)
    fun facets(filter: OrdersFilter): Flow<OrderFacets?>
    /** The count for the filter as asked, chip and segment included — see [OrdersRepository.total]. */
    fun total(filter: OrdersFilter): Flow<Int?>
}
class RepositoryOrdersSource @Inject constructor(private val repo: OrdersRepository) : OrdersSource {
    override fun list(filter: OrdersFilter) = repo.list(filter)
    override suspend fun refreshList(filter: OrdersFilter) = repo.refreshList(filter)
    override fun facets(filter: OrdersFilter) = repo.facets(filter)
    override fun total(filter: OrdersFilter) = repo.total(filter)
}

/** Test seam over [CapacityRepository] — the Жадвал view's month grid. */
interface CapacitySource {
    fun observe(month: YearMonth): Flow<Resource<CapacityMonth>>
    suspend fun refresh(month: YearMonth): Result<Unit>
}
class RepositoryCapacitySource @Inject constructor(private val repo: CapacityRepository) : CapacitySource {
    override fun observe(month: YearMonth) = repo.observe(month)
    override suspend fun refresh(month: YearMonth) = repo.refresh(month)
}
/** What a ViewModel built for a list-only test gets: a grid that never arrives, and so never
 *  fetches. [OrdersListUiState.capacity] stays null until the calendar is shown in any case. */
internal object NoCapacity : CapacitySource {
    override fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = flowOf(Resource.Loading(null))
    override suspend fun refresh(month: YearMonth) = Result.success(Unit)
}

/** Test seam over [ExportRepository] — the owner's Excel backup (§5). */
fun interface ExportSource {
    suspend fun downloadBackup(): Result<File>
}
class RepositoryExportSource @Inject constructor(private val repo: ExportRepository) : ExportSource {
    override suspend fun downloadBackup() = repo.downloadBackup()
}

/** Test seam over [OrdersPrefs] — the persisted Рўйхат/Жадвал switch (R11). */
interface OrdersViewStore {
    val view: Flow<OrdersView>
    suspend fun set(v: OrdersView)
}
class PrefsOrdersViewStore @Inject constructor(private val prefs: OrdersPrefs) : OrdersViewStore {
    override val view = prefs.ordersView
    override suspend fun set(v: OrdersView) = prefs.setOrdersView(v)
}
/** A store with no disk behind it, so a test that cares only about the list can build the
 *  ViewModel from a fake [OrdersSource] alone. */
internal class MemoryOrdersViewStore(initial: OrdersView = OrdersView.LIST) : OrdersViewStore {
    private val state = MutableStateFlow(initial)
    override val view: Flow<OrdersView> = state
    override suspend fun set(v: OrdersView) { state.value = v }
}

/**
 * The navy sheet under the grid (§4.5) for the selected day: that day's bucket from the cached
 * month, its tier, and the day's own orders — the SAME filtered list call Рўйхат makes (R6), so
 * the two views can never disagree about which orders fall on the day.
 *
 * @param hasLoad **ruling R18** — whether the factory's load for this day is actually KNOWN.
 *   False whenever the month behind the day has not landed (offline, in flight, failed) or the day
 *   lies outside the loaded grid (R14: the planner paged away and the sheet followed). While it is
 *   false, [capacity], [tier] and [heavy] carry nothing the server said and **must not be drawn**:
 *   the sheet answers «—» instead. The old behaviour read
 *   `CapacityThresholds.DEFAULT` off the client and told an offline planner «0,00 м² · мавжуд ·
 *   Сиғим бўш — 600 м²» about a day the app had never been told anything about.
 * @param orderCount the «N буюртма» of the right-hand column, and [blockCount] the «N ғишт»
 *   beside it. Not always [CapacityDay.totalOrders]: with any of `q`/`status`/`payment` on, the
 *   money line below them is Σ of the FILTERED rows, so the count has to come from the same set or
 *   the sheet reads «5 буюртма» over the total of the two that matched. Unfiltered, and only with
 *   [hasLoad], they are the server's own day — which counts orders beyond the page the sheet
 *   loaded.
 * @param heavy the server's top threshold, which the sheet's bar is drawn as a fraction of.
 * @param moneyTotal Σ of the loaded orders' `totalPrice`; [Money], never a float.
 */
data class DaySheetState(
    val day: LocalDate,
    val capacity: CapacityDay,
    val tier: CapacityTier,
    val heavy: BigDecimal,
    val orders: Resource<List<OrderSummary>>,
    val orderCount: Int,
    val blockCount: Int,
    val moneyTotal: Money,
    val hasLoad: Boolean,
)

data class OrdersListUiState(
    val query: String = "",
    val status: OrderStatus? = null,
    val payment: PaymentFilter? = null,
    val day: LocalDate? = null,
    val groups: List<MonthGroup> = emptyList(),
    val facets: OrderFacets? = null,
    val isRefreshing: Boolean = false,
    /**
     * Жадвал's own pull-to-refresh state. [isRefreshing] is the LIST's — it is true whenever the
     * orders resource has no cache yet, which on the calendar means the spinner turned for a page
     * of rows the planner is not looking at while the month behind the grid loaded in silence.
     * This one is [refreshCalendar]'s and nothing else's: a month arriving for the first time is
     * the card's own skeleton to announce, and a spinner on top of it would say the same thing
     * twice.
     */
    val isCalendarRefreshing: Boolean = false,
    /**
     * **M6** — a pull-to-refresh that failed over a month already on screen. The cached figures
     * stay exactly where they are (they are the last thing the server did say) and the screen puts
     * «Янгилаб бўлмади» with a retry above them; without this the pull simply stopped and the
     * planner was left reading stale numbers as if they were fresh. A flag, not a message, for the
     * same reason [exportFailed] is one.
     *
     * Never set for a month with nothing cached: there the card is already showing the failure the
     * capacity resource itself carries, and two banners would say it twice.
     */
    val calendarRefreshFailed: Boolean = false,
    val loadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val error: String? = null,
    val hasCache: Boolean = false,
    /** Рўйхат or Жадвал — one screen, one ViewModel (R1); [day] is shared by both. */
    val view: OrdersView = OrdersView.LIST,
    val cursorMonth: YearMonth = YearMonth.now(TASHKENT),
    /** null until the calendar view has been shown once: a planner who never opens Жадвал never
     *  costs a capacity fetch. */
    val capacity: Resource<CapacityMonth>? = null,
    val daySheet: DaySheetState? = null,
    val exporting: Boolean = false,
    /** The downloaded workbook, for the screen to hand the share sheet; cleared by `consumeExport`. */
    val exportFile: File? = null,
    /** The export failed. A flag, not a message: the wording is `orders_export_failed` in the
     *  module's own strings, where every other user-facing sentence in this feature lives. */
    val exportFailed: Boolean = false,
    /** From the route (`order.exportBackup`) — without it the header draws no export button. */
    val canExport: Boolean = false,
)

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
open class OrdersListViewModel(
    private val source: OrdersSource,
    private val capacitySource: CapacitySource = NoCapacity,
    private val exports: ExportSource = ExportSource { Result.failure(UnsupportedOperationException()) },
    private val viewStore: OrdersViewStore = MemoryOrdersViewStore(),
    private val canExport: Boolean = false,
) : ViewModel() {
    private val query = MutableStateFlow("")
    private val status = MutableStateFlow<OrderStatus?>(null)
    private val payment = MutableStateFlow<PaymentFilter?>(null)
    private val day = MutableStateFlow<LocalDate?>(null)
    /** How many pages are currently on screen; page 1..pages are collected and concatenated. */
    private val pages = MutableStateFlow(1)
    private val refreshing = MutableStateFlow(false)
    /** Жадвал's own pull-to-refresh, kept apart from [refreshing] — see
     *  [OrdersListUiState.isCalendarRefreshing]. */
    private val calendarRefreshing = MutableStateFlow(false)
    /** See [OrdersListUiState.calendarRefreshFailed]. */
    private val calendarRefreshFailed = MutableStateFlow(false)
    private val loadingMore = MutableStateFlow(false)

    private val view = MutableStateFlow(OrdersView.LIST)
    private val cursorMonth = MutableStateFlow(YearMonth.now(TASHKENT))
    /** Latched by the first [setView] to Жадвал (or by a restored CALENDAR): before it the grid is
     *  never observed, so a LIST-only session makes no capacity call at all. */
    private val calendarShown = MutableStateFlow(false)
    /** Bumped by [refreshCalendar]. `CapacityRepository.observe` is a cold flow that reads its
     *  cache once, so a forced fetch only reaches the screen if the flow is collected again. */
    private val capacityTick = MutableStateFlow(0)
    private val exporting = MutableStateFlow(false)
    private val exportFile = MutableStateFlow<File?>(null)
    private val exportFailed = MutableStateFlow(false)

    /** Set by [setView] or by the restore in `init`, whichever runs first — a persisted view must
     *  not land on top of a switch the user has already flipped while the read was in flight. */
    private var viewDecided = false

    init {
        viewModelScope.launch {
            val restored = viewStore.view.first()
            if (!viewDecided) {
                viewDecided = true
                view.value = restored
                if (restored == OrdersView.CALENDAR) enterCalendar()
            }
        }
    }

    /** The filter without a page — every filter change drops back to a single page. */
    private val base: StateFlow<OrdersFilter> =
        combine(query.debounce(300), status, payment, day) { q, s, p, d ->
            OrdersFilter(q = q.ifBlank { null }, status = s, payment = p, day = d, sort = "desc", pageSize = PAGE_SIZE)
        }
            .distinctUntilChanged()
            .onEach { f -> pages.value = 1; refreshPage(f, 1) }
            .stateIn(viewModelScope, SharingStarted.Eagerly, OrdersFilter(sort = "desc", pageSize = PAGE_SIZE))

    private val resource: Flow<Resource<List<OrderSummary>>> = base.flatMapLatest { f ->
        pages.flatMapLatest { n -> combine((1..n).map { p -> pageFlow(f, p) }) { arr -> mergePages(arr.toList()) } }
    }

    private val facetsFlow: Flow<OrderFacets?> = base.flatMapLatest { source.facets(it) }

    /**
     * The server's count for the filter as asked — the ONLY figure paging may stop at.
     *
     * [OrderFacets.total] counts the `q`/`day` filter with `status` and `payment` deliberately
     * ignored (that is what lets an unselected chip still show its count), so with a chip or a
     * segment on it is larger than the filtered list can ever grow: `rows.size` never reaches it,
     * the near-end effect asks for page after page, and each one adds a `pageFlow` that never
     * settles. Live, that ran to `page=49` on a «Қабул» filter holding two orders.
     *
     * A StateFlow, not just a `combine` input, because [loadMore] reads it synchronously to cap
     * the page counter.
     */
    private val filteredTotal: StateFlow<Int?> =
        base.flatMapLatest { source.total(it) }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** The cursor month's grid, once the calendar has been shown. Shared (`stateIn`) because both
     *  the grid and the day sheet read it: two independent collections of a cold repository flow
     *  would be two fetches of the same month. */
    private val capacityFlow: StateFlow<Resource<CapacityMonth>?> =
        combine(calendarShown, cursorMonth, capacityTick) { shown, m, tick -> if (shown) MonthKey(m, tick) else null }
            .distinctUntilChanged()
            .flatMapLatest { k -> if (k == null) flowOf<Resource<CapacityMonth>?>(null) else capacitySource.observe(k.month) }
            .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /**
     * The day sheet's list call (R6): the shared `q`/`status`/`payment` exactly as Рўйхат has them,
     * plus the selected day, oldest first (§4.5 reads the day forward). Null whenever there is no
     * day or the calendar is not on screen — a day filter set in Рўйхат alone costs nothing extra.
     *
     * [PAGE_SIZE], not the filter's own default of 20, so a busy day's sheet cannot show fewer
     * orders than Рўйхат filtered to the same day shows — which is the whole point of R6.
     */
    private val dayFilter: StateFlow<OrdersFilter?> = combine(base, view) { f, v ->
        val d = f.day
        if (v == OrdersView.CALENDAR && d != null)
            OrdersFilter(q = f.q, status = f.status, payment = f.payment, day = d, sort = "asc", pageSize = PAGE_SIZE)
        else null
    }
        .distinctUntilChanged()
        .onEach { f -> if (f != null) viewModelScope.launch { source.refreshList(f) } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val daySheetFlow: Flow<DaySheetState?> = combine(
        dayFilter.flatMapLatest { f -> if (f == null) flowOf<Resource<List<OrderSummary>>?>(null) else source.list(f) },
        capacityFlow,
        dayFilter,
    ) { orders, cap, f ->
        val d = f?.day
        if (d == null) null else {
            val month = cap?.dataOrNull
            // R18: the load is the SERVER's figure or it is nothing. `CapacityMonth.range` is the
            // grid the fetch actually covered, so a day the planner kept while paging two months
            // away (R14) is as unknown as a day whose month never arrived.
            val hasLoad = month != null && d in month.range
            val thresholds = month?.thresholds ?: CapacityThresholds.DEFAULT
            val bucket = month?.day(d) ?: CapacityDay(d, BigDecimal.ZERO, 0, 0)
            val rows = orders?.dataOrNull.orEmpty()
            // I1: the right-hand column has to describe ONE set. The money line is always Σ of the
            // loaded rows, so with a filter on — or with no month behind the day at all — the
            // count and the ғишт come from those same rows.
            val ownRows = !hasLoad || f.q != null || f.status != null || f.payment != null
            DaySheetState(
                day = d,
                capacity = bucket,
                tier = tierFor(bucket.totalArea, thresholds),
                heavy = thresholds.heavy,
                orders = orders ?: Resource.Loading(null),
                orderCount = if (ownRows) rows.size else bucket.totalOrders,
                blockCount = if (ownRows) rows.sumOf { it.totalBlocks } else bucket.totalBlocks,
                moneyTotal = rows.fold(Money.ZERO) { acc, o -> acc + o.totalPrice },
                hasLoad = hasLoad,
            )
        }
    }

    private data class MonthKey(val month: YearMonth, val tick: Int)
    private data class Filters(val q: String, val status: OrderStatus?, val payment: PaymentFilter?, val day: LocalDate?)
    private data class Busy(val refreshing: Boolean, val calendarRefreshing: Boolean, val calendarRefreshFailed: Boolean, val loadingMore: Boolean)
    private data class Counts(val facets: OrderFacets?, val total: Int?)
    private data class Calendar(val view: OrdersView, val month: YearMonth, val capacity: Resource<CapacityMonth>?, val daySheet: DaySheetState?)
    private data class Export(val exporting: Boolean, val file: File?, val failed: Boolean)
    private data class Screen(val pages: Int, val calendar: Calendar, val export: Export)

    val state: StateFlow<OrdersListUiState> = combine(
        combine(query, status, payment, day) { q, s, p, d -> Filters(q, s, p, d) },
        resource,
        combine(facetsFlow, filteredTotal) { f, t -> Counts(f, t) },
        combine(
            pages,
            combine(view, cursorMonth, capacityFlow, daySheetFlow) { v, m, c, s -> Calendar(v, m, c, s) },
            combine(exporting, exportFile, exportFailed) { busy, file, failed -> Export(busy, file, failed) },
        ) { n, calendar, export -> Screen(n, calendar, export) },
        combine(refreshing, calendarRefreshing, calendarRefreshFailed, loadingMore) { r, c, cf, m -> Busy(r, c, cf, m) },
    ) { f, r, counts, screen, busy ->
        val rows = r.dataOrNull.orEmpty()
        OrdersListUiState(
            query = f.q, status = f.status, payment = f.payment, day = f.day,
            groups = groupByMonth(rows), facets = counts.facets,
            isRefreshing = busy.refreshing || (r is Resource.Loading && r.cached == null),
            isCalendarRefreshing = busy.calendarRefreshing,
            calendarRefreshFailed = busy.calendarRefreshFailed,
            loadingMore = busy.loadingMore,
            // Before the first page lands there is no total, and the only signal left is "the last
            // page came back full". Never `facets.total` — see [filteredTotal].
            hasMore = counts.total?.let { rows.size < it } ?: (rows.size >= PAGE_SIZE * screen.pages),
            error = (r as? Resource.Error)?.error?.message,
            hasCache = r.dataOrNull != null,
            view = screen.calendar.view,
            cursorMonth = screen.calendar.month,
            capacity = screen.calendar.capacity,
            daySheet = screen.calendar.daySheet,
            exporting = screen.export.exporting,
            exportFile = screen.export.file,
            exportFailed = screen.export.failed,
            canExport = canExport,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, OrdersListUiState(canExport = canExport))

    fun setQuery(v: String) { query.value = v }
    fun setStatus(v: OrderStatus?) { status.value = v }
    fun setPayment(v: PaymentFilter?) { payment.value = v }
    fun setDay(v: LocalDate?) { day.value = v }

    /**
     * Рўйхат ⇄ Жадвал, persisted (R11). The first time Жадвал is shown it latches the grid on and,
     * only then and only if nothing is selected yet, selects today (§4.4) — a day the planner
     * already chose is never overridden, and re-entry restores that same shared [day].
     */
    fun setView(v: OrdersView) {
        viewDecided = true
        view.value = v
        if (v == OrdersView.CALENDAR) enterCalendar()
        viewModelScope.launch { viewStore.set(v) }
    }

    private fun enterCalendar() {
        val first = !calendarShown.value
        calendarShown.value = true
        if (!first || day.value != null) return
        val today = LocalDate.now(TASHKENT)
        if (YearMonth.from(today) == cursorMonth.value) day.value = today
    }

    /** ‹ / ›. The selection is kept even when it leaves the shown month (R7) — the chip in Рўйхат
     *  still carries it; the grid simply does not draw it. */
    fun prevMonth() { cursorMonth.value = cursorMonth.value.minusMonths(1); calendarRefreshFailed.value = false }
    fun nextMonth() { cursorMonth.value = cursorMonth.value.plusMonths(1); calendarRefreshFailed.value = false }

    /** Tapping a day cell, or the chip's × with null — the SAME [day] Рўйхат filters by. */
    fun selectDay(d: LocalDate?) { setDay(d) }

    /**
     * Pull-to-refresh in Жадвал: the month grid, and the open day's orders with it.
     *
     * **M6** — the forced fetch's answer is not discarded. Over a month whose figures are already
     * on screen a failure raises [OrdersListUiState.calendarRefreshFailed] and leaves those figures
     * where they are; over a month with nothing cached the failure is left to `observe`, which
     * reports it as the capacity resource's own [Resource.Error] — the card and its banner already
     * say it, and re-collecting the flow would only pay a second round trip to hear it again.
     */
    fun refreshCalendar() {
        viewModelScope.launch {
            calendarRefreshing.value = true
            calendarRefreshFailed.value = false
            val cached = capacityFlow.value?.dataOrNull != null
            val failed = capacitySource.refresh(cursorMonth.value).isFailure
            if (!failed || cached) capacityTick.value += 1
            calendarRefreshFailed.value = failed && cached
            dayFilter.value?.let { source.refreshList(it) }
            calendarRefreshing.value = false
        }
    }

    /** §5. Single-flight: the route is not idempotent (the server builds a fresh workbook each
     *  time), so a second tap while one download is in flight is dropped rather than queued. */
    fun exportBackup() {
        if (exporting.value) return
        exporting.value = true
        exportFailed.value = false
        viewModelScope.launch {
            exports.downloadBackup()
                .onSuccess { exportFile.value = it }
                .onFailure { exportFailed.value = true }
            exporting.value = false
        }
    }

    /** Called once the screen has handed the file to the share sheet. */
    fun consumeExport() { exportFile.value = null }
    fun dismissExportError() { exportFailed.value = false }

    /** Pull-to-refresh: re-fetches every page currently on screen, oldest first. */
    fun refresh() {
        viewModelScope.launch {
            refreshing.value = true
            val f = base.value
            for (p in 1..pages.value) source.refreshList(f.copy(page = p))
            refreshing.value = false
        }
    }

    fun loadMore() {
        if (loadingMore.value || !state.value.hasMore) return
        val next = pages.value + 1
        // A second guard on the page counter itself, not just on `hasMore`: the screen's near-end
        // effect can fire against a state snapshot taken before the last page landed, and a page
        // past the last one would come back empty forever. `ceil(total / PAGE_SIZE)` is the last
        // page there is, written as multiplication so no rounding can be off by one.
        val total = filteredTotal.value
        if (total != null && (next - 1) * PAGE_SIZE >= total) return
        pages.value = next
        viewModelScope.launch {
            loadingMore.value = true
            source.refreshList(base.value.copy(page = next))
            loadingMore.value = false
        }
    }

    private fun refreshPage(f: OrdersFilter, page: Int) {
        viewModelScope.launch {
            refreshing.value = true
            source.refreshList(f.copy(page = page))
            refreshing.value = false
        }
    }

    private fun pageFlow(f: OrdersFilter, page: Int): Flow<Resource<List<OrderSummary>>> {
        // The cache can be emptied under a live collector — sign-out wipes Room *and* the
        // repository's in-memory outcomes — and the filter has not changed, so nothing else would
        // ever trigger a fetch and the list would spin forever. Re-arm one refresh each time a
        // settled flow falls back to "no data at all"; `settled` gates it so the very first
        // Loading(null) (which the filter's own eager refresh already covers) is not double-fetched.
        var settled = false
        return source.list(f.copy(page = page)).onEach { r ->
            if (r is Resource.Loading && r.cached == null) {
                if (settled) { settled = false; refreshPage(f, page) }
            } else settled = true
        }
    }

    /** Concatenates the pages on screen into one list: an error on any page wins (with whatever
     *  rows the other pages did give), otherwise the merge is Success only once every page has
     *  rows of its own — a page still in flight keeps the whole list Loading over its cache. */
    private fun mergePages(parts: List<Resource<List<OrderSummary>>>): Resource<List<OrderSummary>> {
        val rows = parts.flatMap { it.dataOrNull.orEmpty() }
        for (p in parts) if (p is Resource.Error) return Resource.Error(rows, p.error)
        return if (parts.all { it is Resource.Success || it.dataOrNull != null }) Resource.Success(rows)
        else Resource.Loading(rows.takeIf { it.isNotEmpty() })
    }
}

/**
 * `canExport` is assisted rather than injected: whether the export button exists is the route's
 * call (`me.can("order.exportBackup")`), decided from the session the nav host already holds —
 * exactly as «+ Янги» is gated there — not a permission the ViewModel re-reads for itself.
 */
@HiltViewModel(assistedFactory = HiltOrdersListViewModel.Factory::class)
class HiltOrdersListViewModel @AssistedInject constructor(
    source: RepositoryOrdersSource,
    capacitySource: RepositoryCapacitySource,
    exports: RepositoryExportSource,
    viewStore: PrefsOrdersViewStore,
    @Assisted canExport: Boolean,
) : OrdersListViewModel(source, capacitySource, exports, viewStore, canExport) {
    @AssistedFactory
    interface Factory {
        fun create(canExport: Boolean): HiltOrdersListViewModel
    }
}
