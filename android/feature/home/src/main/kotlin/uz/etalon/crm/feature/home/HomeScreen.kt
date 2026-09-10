package uz.etalon.crm.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.CountText
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.toneColor
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
                // First, as on every other list in this app. It used to sit BELOW the money
                // tiles, which meant a failed refresh left a stale receivables figure at the top
                // of the screen with the reason it was stale underneath it.
                val error = s.error
                if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
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
                s.tiles?.let { tiles -> item { HomeTilesSection(tiles) } }
                item { SectionLabel(stringResource(R.string.home_today_section)) }
                // "No orders today" and "cannot check today's orders" are different facts and
                // must never share a string: an empty column beside a withheld permission reads
                // as "nothing scheduled" when the truth is "not allowed to see". No error
                // affordance either way — a driver cannot act on either state.
                if (s.showNoAccessState) item { EmptyState(stringResource(R.string.home_today_no_access)) }
                else if (s.showEmptyState) item { EmptyState(stringResource(R.string.home_today_empty)) }
                items(s.today, key = { it.orderId }) { delivery ->
                    TodayDeliveryRow(delivery, onClick = { onOpenOrder(delivery.orderId) })
                }
            }
        }
    }
}

/**
 * Full-width, one per row — not a three-across grid. Three tiles side by side on a 411dp phone
 * leave roughly 90dp of text each, which fits neither a real receivables figure
 * (`formatMoney` on a nine-digit UZS total is fifteen characters) nor an area past four digits.
 * Full width comfortably fits both at [EtalonType.monoTitle], and every card gets the same
 * single-line label + single-line value shape, so the three no longer disagree on height the way
 * a wrapped "БУГУНГИ ЕТКАЗИШЛАР" against an unwrapped "ҚАРЗДОРЛИК" did in three narrow columns.
 */
@Composable
private fun HomeTilesSection(tiles: HomeTiles) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HomeTile(label = stringResource(R.string.home_tile_today)) {
            AreaText(tiles.todayArea, style = EtalonType.monoTitle, color = MaterialTheme.colorScheme.onSurface)
            CountText(tiles.todayCount)
        }
        HomeTile(label = stringResource(R.string.home_tile_discrepancies)) {
            MoneyHeroText(tiles.openDiscrepancyTotal, style = EtalonType.monoTitle)
            CountText(tiles.openDiscrepancies)
        }
        HomeTile(label = stringResource(R.string.home_tile_receivables)) {
            MoneyHeroText(tiles.receivables, style = EtalonType.monoTitle, color = LocalEtalonColors.current.danger)
            CountText(tiles.receivableOrders)
        }
    }
}

// Neither this tile nor a today's-delivery row carries a real status — the spec's capacity-tier
// stripe for the delivery row is not built yet — so both use the deliberate no-status colour
// (ClientsScreen and ClientDetailScreen's own "not a status" cards) rather than colorScheme.primary,
// which would imply a meaning neither card has.
@Composable
private fun HomeTile(label: String, content: @Composable () -> Unit) {
    StatusStripeCard(stripe = toneColor(ChipTone.NEUTRAL)) {
        SectionLabel(label)
        content()
    }
}

@Composable
private fun TodayDeliveryRow(delivery: TodayDelivery, onClick: () -> Unit) {
    StatusStripeCard(stripe = toneColor(ChipTone.NEUTRAL), onClick = onClick) {
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
