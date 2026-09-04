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
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.feature.orders.R

private val STATUS_CHIPS = listOf(null, OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CANCELED)

@Composable
fun OrdersListRoute(onOpenOrder: (String) -> Unit, vm: HiltOrdersListViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    OrdersListScreen(s, vm::setQuery, vm::setStatus, vm::refresh, vm::nextPage, vm::previousPage, onOpenOrder)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(s: OrdersListUiState, onQuery: (String) -> Unit, onStatus: (OrderStatus?) -> Unit, onRefresh: () -> Unit, onNext: () -> Unit, onPrev: () -> Unit, onOpen: (String) -> Unit) {
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
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
                if (s.error != null) item { ErrorBanner(s.error, onRetry = onRefresh) }
                if (s.items.isEmpty() && !s.isRefreshing) item { EmptyState(stringResource(R.string.orders_empty)) }
                items(s.items, key = { it.id }) { o -> OrderCard(o) { onOpen(o.id) } }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = onPrev, enabled = s.page > 1) { Text(stringResource(R.string.paging_prev)) }
                        Text(s.page.toString(), style = MaterialTheme.typography.labelMedium)
                        TextButton(onClick = onNext, enabled = s.items.size >= 20) { Text(stringResource(R.string.paging_next)) }
                    }
                }
            }
        }
    }
}
