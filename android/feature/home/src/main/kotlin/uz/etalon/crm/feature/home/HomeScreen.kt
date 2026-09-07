package uz.etalon.crm.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.AreaText
import uz.etalon.crm.core.designsystem.components.CountText
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * A top-level bottom-bar destination (Destination.HOME), so — like `OrdersListRoute` and
 * `ConfirmQueueRoute` — it carries no back arrow.
 */
@Composable
fun HomeRoute(
    onOpenOrder: (String) -> Unit,
    vm: HiltHomeViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    HomeScreen(s = s, onRefresh = vm::refresh, onOpenOrder = onOpenOrder)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    s: HomeUiState,
    onRefresh: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    Scaffold { pad ->
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text(
                        if (s.pendingUploads > 0) {
                            pluralStringResource(DesignSystemR.plurals.outbox_pending, s.pendingUploads, s.pendingUploads)
                        } else {
                            stringResource(R.string.home_outbox_clear)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                s.tiles?.let { tiles -> item { HomeTilesRow(tiles) } }
                val error = s.error
                if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                item { SectionLabel(stringResource(R.string.home_today_section)) }
                // Never beside an error banner and never while loading: an empty column there
                // would read as "nothing scheduled" when the truth could be "couldn't check".
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.home_today_empty)) }
                items(s.today, key = { it.orderId }) { delivery ->
                    TodayDeliveryRow(delivery, onClick = { onOpenOrder(delivery.orderId) })
                }
            }
        }
    }
}

@Composable
private fun HomeTilesRow(tiles: HomeTiles) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        HomeTile(
            label = stringResource(R.string.home_tile_today),
            modifier = Modifier.weight(1f),
        ) {
            AreaText(tiles.todayArea, style = EtalonType.monoTitle, color = MaterialTheme.colorScheme.onSurface)
            CountText(tiles.todayCount)
        }
        HomeTile(
            label = stringResource(R.string.home_tile_discrepancies),
            modifier = Modifier.weight(1f),
        ) {
            MoneyText(tiles.openDiscrepancyTotal, style = EtalonType.monoTitle)
            CountText(tiles.openDiscrepancies)
        }
        HomeTile(
            label = stringResource(R.string.home_tile_receivables),
            modifier = Modifier.weight(1f),
        ) {
            MoneyText(tiles.receivables, style = EtalonType.monoTitle, color = LocalEtalonColors.current.danger)
            CountText(tiles.receivableOrders)
        }
    }
}

@Composable
private fun HomeTile(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    StatusStripeCard(stripe = MaterialTheme.colorScheme.primary, modifier = modifier) {
        SectionLabel(label)
        content()
    }
}

@Composable
private fun TodayDeliveryRow(delivery: TodayDelivery, onClick: () -> Unit) {
    StatusStripeCard(stripe = MaterialTheme.colorScheme.primary, onClick = onClick) {
        Text(
            delivery.orderNumber, style = MaterialTheme.typography.titleMedium,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            delivery.clientName, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        AreaText(delivery.area, modifier = Modifier.padding(top = 4.dp))
    }
}
