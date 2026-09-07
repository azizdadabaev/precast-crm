package uz.etalon.crm.feature.clients.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StatusChip
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.orderStatusTone
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientOrderLine
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.format.formatScheduleDate
import uz.etalon.crm.feature.clients.R
import uz.etalon.crm.feature.clients.dial
import uz.etalon.crm.feature.clients.edit.ClientEditSheet

/** The minimum comfortable touch target, per spec §6 — the call button is the one control on
 *  this screen an operator uses while holding a phone in one hand. */
private val TOUCH = 48.dp

@Composable
fun ClientDetailRoute(
    clientId: String,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    vm: HiltClientDetailViewModel = hiltViewModel<HiltClientDetailViewModel, HiltClientDetailViewModel.Factory>(
        creationCallback = { it.create(clientId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ClientDetailScreen(s = s, onBack = onBack, onRefresh = vm::refresh, onOpenOrder = onOpenOrder)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientDetailScreen(
    s: ClientDetailUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val ctx = LocalContext.current
    val client = s.client
    var editing by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        client?.name.orEmpty(),
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.client_action_back))
                    }
                },
                actions = {
                    // Only once `client.edit` is known to be held, and only once there is a
                    // client to edit. Disabled offline: PATCH /api/clients/{id} is not
                    // `withIdempotency`-wrapped, so it may not be queued.
                    if (s.showEditAction && client != null) {
                        IconButton(onClick = { editing = true }, enabled = !s.isOffline) {
                            Icon(Icons.Default.Edit, stringResource(R.string.client_action_edit))
                        }
                    }
                },
            )
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
                if (client == null) return@LazyColumn

                item {
                    StatusStripeCard(stripe = toneColor(ChipTone.NEUTRAL)) {
                        Text(
                            client.name,
                            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                formatPhone(client.phone),
                                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(1f),
                            )
                            // ACTION_DIAL: it fills the number in and leaves the decision to the
                            // operator. ACTION_CALL would need CALL_PHONE and would ring a
                            // customer on a mis-tap.
                            IconButton(
                                onClick = { dial(ctx, client.phone) },
                                modifier = Modifier.size(TOUCH),
                            ) {
                                Icon(Icons.Default.Call, stringResource(R.string.client_action_call))
                            }
                        }
                        formatAddressLine(client.address)?.let { LabelledLine(R.string.client_address_label, it) }
                        client.notes?.takeIf { it.isNotBlank() }?.let { LabelledLine(R.string.client_notes_label, it) }
                    }
                }

                item { SectionLabel(stringResource(R.string.client_orders_section)) }
                if (s.showNoOrders) item { EmptyState(stringResource(R.string.client_no_orders)) }
                items(client.orders, key = { it.id }) { line ->
                    OrderLineCard(line) { onOpenOrder(line.id) }
                }
            }
        }
    }

    if (editing && client != null) {
        ClientEditSheet(
            client = client,
            isOffline = s.isOffline,
            onDismiss = { editing = false },
            onSaved = {
                editing = false
                // Re-read rather than patching the screen from what was sent: PATCH answers with
                // the stored row, and the server normalises the phone on the way in.
                onRefresh()
            },
        )
    }
}

@Composable
private fun LabelledLine(labelRes: Int, value: String) {
    Text(
        stringResource(labelRes),
        style = EtalonType.monoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 6.dp),
    )
    Text(value, style = MaterialTheme.typography.bodyMedium)
}

/**
 * One of the client's orders. The status stripe, chip and money all come from the design system —
 * this screen maps nothing itself, so an order reads the same here as it does in the orders list.
 */
@Composable
private fun OrderLineCard(line: ClientOrderLine, onClick: () -> Unit) {
    StatusStripeCard(stripe = toneColor(orderStatusTone(line.status)), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                line.orderNumber,
                style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                formatScheduleDate(line.scheduledAt),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            MoneyText(line.totalPrice, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold))
        }
        Row(Modifier.padding(top = 6.dp)) { StatusChip(line.status) }
    }
}
