package uz.etalon.crm.feature.orders.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.model.OrderFacets
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentFilter
import uz.etalon.crm.core.model.Resource
import java.time.LocalDate
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

data class OrdersListUiState(
    val query: String = "",
    val status: OrderStatus? = null,
    val payment: PaymentFilter? = null,
    val day: LocalDate? = null,
    val groups: List<MonthGroup> = emptyList(),
    val facets: OrderFacets? = null,
    val isRefreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val error: String? = null,
    val hasCache: Boolean = false,
)

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
open class OrdersListViewModel(private val source: OrdersSource) : ViewModel() {
    private val query = MutableStateFlow("")
    private val status = MutableStateFlow<OrderStatus?>(null)
    private val payment = MutableStateFlow<PaymentFilter?>(null)
    private val day = MutableStateFlow<LocalDate?>(null)
    /** How many pages are currently on screen; page 1..pages are collected and concatenated. */
    private val pages = MutableStateFlow(1)
    private val refreshing = MutableStateFlow(false)
    private val loadingMore = MutableStateFlow(false)

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

    private data class Filters(val q: String, val status: OrderStatus?, val payment: PaymentFilter?, val day: LocalDate?)
    private data class Busy(val refreshing: Boolean, val loadingMore: Boolean)
    private data class Counts(val facets: OrderFacets?, val total: Int?)

    val state: StateFlow<OrdersListUiState> = combine(
        combine(query, status, payment, day) { q, s, p, d -> Filters(q, s, p, d) },
        resource,
        combine(facetsFlow, filteredTotal) { f, t -> Counts(f, t) },
        pages,
        combine(refreshing, loadingMore) { r, m -> Busy(r, m) },
    ) { f, r, counts, n, busy ->
        val rows = r.dataOrNull.orEmpty()
        OrdersListUiState(
            query = f.q, status = f.status, payment = f.payment, day = f.day,
            groups = groupByMonth(rows), facets = counts.facets,
            isRefreshing = busy.refreshing || (r is Resource.Loading && r.cached == null),
            loadingMore = busy.loadingMore,
            // Before the first page lands there is no total, and the only signal left is "the last
            // page came back full". Never `facets.total` — see [filteredTotal].
            hasMore = counts.total?.let { rows.size < it } ?: (rows.size >= PAGE_SIZE * n),
            error = (r as? Resource.Error)?.error?.message,
            hasCache = r.dataOrNull != null,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, OrdersListUiState())

    fun setQuery(v: String) { query.value = v }
    fun setStatus(v: OrderStatus?) { status.value = v }
    fun setPayment(v: PaymentFilter?) { payment.value = v }
    fun setDay(v: LocalDate?) { day.value = v }

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

@HiltViewModel
class HiltOrdersListViewModel @Inject constructor(source: RepositoryOrdersSource) : OrdersListViewModel(source)
