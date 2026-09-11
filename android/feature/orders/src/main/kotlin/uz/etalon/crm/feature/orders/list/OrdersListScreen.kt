package uz.etalon.crm.feature.orders.list

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.orderStatusLabel
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.feature.orders.R

private val STATUS_CHIPS = listOf(null, OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CANCELED)

@Composable
fun OrdersListRoute(onOpenOrder: (String) -> Unit, vm: HiltOrdersListViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    OrdersListScreen(s, vm::setQuery, vm::setStatus, vm::refresh, vm::loadMore, onOpenOrder)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(s: OrdersListUiState, onQuery: (String) -> Unit, onStatus: (OrderStatus?) -> Unit, onRefresh: () -> Unit, onLoadMore: () -> Unit, onOpen: (String) -> Unit) {
    val rows = s.groups.flatMap { it.rows }
    Scaffold(topBar = {
        Column {
            OutlinedTextField(s.query, onQuery, placeholder = { Text(stringResource(R.string.orders_search_hint)) }, leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp))
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(STATUS_CHIPS) { st ->
                    FilterChip(selected = s.status == st, onClick = { onStatus(st) }, label = { Text(if (st == null) stringResource(R.string.orders_all) else stringResource(orderStatusLabel(st))) })
                }
            }
        }
    }) { pad ->
        PullToRefreshBox(isRefreshing = s.isRefreshing, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            // The floating nav pill is drawn over this screen, so the last row needs
            // `EtalonSpace.underNav` to scroll clear of it. Clearance only — the list itself is
            // restyled in its own task.
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = EtalonSpace.underNav),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                if (s.error != null) item { ErrorBanner(s.error, onRetry = onRefresh) }
                if (rows.isEmpty() && !s.isRefreshing) item { EmptyState(stringResource(R.string.orders_empty)) }
                items(rows, key = { it.id }) { o -> OrderCard(o) { onOpen(o.id) } }
                if (s.hasMore) item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        TextButton(onClick = onLoadMore, enabled = !s.loadingMore) { Text(stringResource(R.string.paging_next)) }
                    }
                }
            }
        }
    }
}
