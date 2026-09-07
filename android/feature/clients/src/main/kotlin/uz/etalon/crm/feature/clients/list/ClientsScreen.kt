package uz.etalon.crm.feature.clients.list

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.feature.clients.R
import uz.etalon.crm.feature.clients.dial
import uz.etalon.crm.feature.clients.edit.ClientEditSheet

/**
 * Finding a customer, by the number they called from or by their name.
 *
 * A top-level destination like `OrdersListRoute` and `ConfirmQueueRoute`, so it carries no back
 * arrow: the navigation bar already says «Мижозлар». The search field takes the top bar's slot.
 */
@Composable
fun ClientsRoute(
    onOpenClient: (String) -> Unit,
    vm: HiltClientsViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ClientsScreen(
        s = s,
        onQuery = vm::setQuery,
        onRefresh = vm::refresh,
        onOpenClient = onOpenClient,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientsScreen(
    s: ClientsUiState,
    onQuery: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenClient: (String) -> Unit,
) {
    var adding by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            OutlinedTextField(
                value = s.query,
                onValueChange = onQuery,
                placeholder = { Text(stringResource(R.string.clients_search_hint)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
        bottomBar = {
            // Offered only once `client.create` is known to be held: a button that appears and
            // then vanishes is worse than one that arrives a frame late. Disabled while offline
            // because POST /api/clients is not `withIdempotency`-wrapped and may not be queued.
            if (s.showAddAction) {
                StickyActionBar {
                    PrimaryButton(
                        text = stringResource(R.string.clients_action_add),
                        onClick = { adding = true },
                        enabled = !s.isOffline,
                    )
                }
            }
        },
    ) { pad ->
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val error = s.error
                if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                // Never beside an error banner and never while loading: an empty client list
                // there reads as "not in the CRM" when the truth is "couldn't check".
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.clients_empty)) }
                items(s.items, key = { it.id }) { c -> ClientCard(c) { onOpenClient(c.id) } }
                // Only one bounded page is fetched (CLIENTS_PAGE_SIZE), so the end of this list
                // is not necessarily the end of the customers. Said at the bottom, which is
                // exactly where an operator who has not found their customer would otherwise
                // conclude that customer is not in the CRM.
                if (s.showTruncatedNotice) {
                    item { NoticeBanner(stringResource(R.string.clients_truncated, s.total, s.items.size)) }
                }
            }
        }
    }

    if (adding) {
        ClientEditSheet(
            client = null,
            isOffline = s.isOffline,
            onDismiss = { adding = false },
            onSaved = { id ->
                adding = false
                // No «қўшилди»: POST /api/clients dedups on the normalised phone and may have
                // answered with a client that already existed, ignoring the name and address
                // just submitted. Opening that client is the honest confirmation — it shows
                // what is actually stored. The list behind it is stale either way.
                onRefresh()
                onOpenClient(id)
            },
        )
    }
}

/**
 * One customer. The phone is the identity, so it is set in the mono face and is the one thing on
 * the row that is tappable in its own right; the rest of the card opens the client.
 *
 * Two rows may legitimately carry the same name — the same customer name belongs to two
 * different businesses often enough — which is exactly why the phone is on the row.
 */
@Composable
private fun ClientCard(c: ClientSummary, onClick: () -> Unit) {
    val ctx = LocalContext.current
    StatusStripeCard(stripe = toneColor(ChipTone.NEUTRAL), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                c.name,
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.client_order_count, c.orderCount),
                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Only the number is annotated, so the link consumes its own taps and the rest of the
        // card still opens the client — the shape OrderCard established.
        Text(
            buildAnnotatedString {
                withLink(
                    LinkAnnotation.Clickable(
                        tag = "phone",
                        styles = TextLinkStyles(SpanStyle(color = MaterialTheme.colorScheme.primary)),
                    ) { dial(ctx, c.phone) },
                ) { append(formatPhone(c.phone)) }
            },
            style = EtalonType.monoBody,
        )
        formatAddressLine(c.address)?.let {
            Text(
                it, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
