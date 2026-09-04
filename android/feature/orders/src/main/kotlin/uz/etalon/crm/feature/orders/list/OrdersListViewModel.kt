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
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.Resource
import javax.inject.Inject

/** Test seam over OrdersRepository. */
interface OrdersSource {
    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>>
    suspend fun refreshList(filter: OrdersFilter)
}
class RepositoryOrdersSource @Inject constructor(private val repo: OrdersRepository) : OrdersSource {
    override fun list(filter: OrdersFilter) = repo.list(filter)
    override suspend fun refreshList(filter: OrdersFilter) = repo.refreshList(filter)
}

data class OrdersListUiState(
    val query: String = "", val status: OrderStatus? = null, val page: Int = 1,
    val items: List<OrderSummary> = emptyList(), val isRefreshing: Boolean = false, val error: String? = null, val hasCache: Boolean = false,
)

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
open class OrdersListViewModel(private val source: OrdersSource) : ViewModel() {
    private val query = MutableStateFlow("")
    private val status = MutableStateFlow<OrderStatus?>(null)
    private val page = MutableStateFlow(1)
    private val refreshing = MutableStateFlow(false)

    private val filter: Flow<OrdersFilter> = combine(query.debounce(300), status, page) { q, s, p -> OrdersFilter(q = q.ifBlank { null }, status = s, page = p) }
        .distinctUntilChanged()
        .onEach { f -> viewModelScope.launch { refreshing.value = true; source.refreshList(f); refreshing.value = false } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, OrdersFilter())

    private val resource: Flow<Resource<List<OrderSummary>>> = filter.flatMapLatest { f ->
        // The cache can be emptied under a live collector — sign-out wipes Room *and* the
        // repository's in-memory outcomes — and the filter has not changed, so nothing else would
        // ever trigger a fetch and the list would spin forever. Re-arm one refresh each time a
        // settled flow falls back to "no data at all"; `settled` gates it so the very first
        // Loading(null) (which the filter's own eager refresh already covers) is not double-fetched.
        var settled = false
        source.list(f).onEach { r ->
            if (r is Resource.Loading && r.cached == null) {
                if (settled) { settled = false; refresh() }
            } else settled = true
        }
    }

    val state: StateFlow<OrdersListUiState> = combine(query, status, page, resource, refreshing) { q, s, p, r, busy ->
        OrdersListUiState(
            query = q, status = s, page = p, items = r.dataOrNull.orEmpty(), isRefreshing = busy || (r is Resource.Loading && r.cached == null),
            error = (r as? Resource.Error)?.error?.message, hasCache = r.dataOrNull != null,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, OrdersListUiState())

    fun setQuery(v: String) { query.value = v; page.value = 1 }
    fun setStatus(v: OrderStatus?) { status.value = v; page.value = 1 }
    fun refresh() { viewModelScope.launch { refreshing.value = true; source.refreshList(filter.first()); refreshing.value = false } }
    fun nextPage() { page.value += 1 }
    fun previousPage() { if (page.value > 1) page.value -= 1 }
}

@HiltViewModel
class HiltOrdersListViewModel @Inject constructor(source: RepositoryOrdersSource) : OrdersListViewModel(source)
