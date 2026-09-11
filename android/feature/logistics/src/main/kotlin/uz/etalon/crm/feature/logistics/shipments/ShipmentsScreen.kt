package uz.etalon.crm.feature.logistics.shipments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.OutboxBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.ShipmentStatusChip
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.shipmentStatusTone
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.R

@Composable
fun ShipmentsRoute(
    orderId: String, onLoadShipment: (String) -> Unit, onDispatch: (String) -> Unit, onBack: () -> Unit,
    vm: ShipmentsViewModel = hiltViewModel<ShipmentsViewModel, ShipmentsViewModel.Factory>(creationCallback = { it.create(orderId) }),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ShipmentsScreen(
        s, onLoadShipment, onDispatch, onBack, vm::addShipment, vm::deleteShipment, vm::deliverShipment, vm::refresh,
        onRetryUpload = vm::retryUpload, onCancelUpload = vm::cancelUpload,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShipmentsScreen(
    s: ShipmentsUiState,
    onLoadShipment: (String) -> Unit,
    onDispatch: (String) -> Unit,
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onDelete: (String) -> Unit,
    onDeliver: (String) -> Unit,
    onRefresh: () -> Unit,
    onRetryUpload: (String) -> Unit = {},
    onCancelUpload: (String) -> Unit = {},
) {
    val shipments = s.shipments
    val actionsDisabled = s.busy || s.isOffline
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.shipments_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
        bottomBar = {
            // The bar clears the shell's floating nav pill itself, in every navigation mode.
            StickyActionBar {
                PrimaryButton(
                    text = stringResource(R.string.action_add_shipment), onClick = onAdd,
                    enabled = s.canAddShipment, loading = s.busy,
                )
            }
        },
    ) { pad ->
        PullToRefreshBox(isRefreshing = s.isLoading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // The way out of a rejected load, on the screen the operator is standing on. It
                // used to live only on the order-detail cockpit, so a truck reached from here was
                // a dead end: its card said "sending" forever and neither retry nor cancel was in
                // reach.
                val failed = s.firstFailedUpload
                if (s.pendingUploads.isNotEmpty()) item {
                    OutboxBanner(
                        pending = s.unfinishedUploads,
                        failedMessage = failed?.let { it.error ?: stringResource(R.string.logistics_upload_failed) },
                        onRetry = { failed?.let { onRetryUpload(it.id) } },
                        onCancel = { failed?.let { onCancelUpload(it.id) } },
                    )
                }
                val resourceError = s.resourceError
                if (resourceError != null) item { ErrorBanner(resourceError, onRetry = onRefresh) }
                val actionError = s.actionError
                if (actionError != null) item { ErrorBanner(actionError) }
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.shipments_empty)) }
                items(shipments, key = { it.id }) { sh ->
                    ShipmentCard(
                        sh, actionsDisabled = actionsDisabled,
                        unsentLoad = s.hasUnsentLoad(sh.id), failedLoad = s.hasFailedLoad(sh.id),
                        onLoad = { onLoadShipment(sh.id) }, onDispatch = { onDispatch(sh.id) },
                        onDeliver = { onDeliver(sh.id) }, onDelete = { onDelete(sh.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ShipmentCard(
    sh: ShipmentLine, actionsDisabled: Boolean, unsentLoad: Boolean, failedLoad: Boolean,
    onLoad: () -> Unit, onDispatch: () -> Unit, onDeliver: () -> Unit, onDelete: () -> Unit,
) {
    StatusStripeCard(stripe = toneColor(shipmentStatusTone(sh.status))) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.logistics_shipment_n, sh.number), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            ShipmentStatusChip(sh.status)
        }
        if (sh.driverName != null || sh.truckIdentifier != null) {
            Text(
                listOfNotNull(sh.driverName, sh.truckIdentifier).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val beamCount = sh.loadedBeams.values.sum()
        if (beamCount > 0 || (sh.loadedBlocks ?: 0) > 0) {
            Text(
                stringResource(R.string.loaded_summary, beamCount, sh.loadedBlocks ?: 0),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(8.dp))
        // Loading and dispatching only navigate to another screen (loading is itself queue-safe
        // offline, per the module's rule); delete and deliver hit the network directly, so those
        // two — and only those two — are gated on [actionsDisabled].
        //
        // [unsentLoad] gates loading on top of that, for a different reason: the server has not
        // seen the load yet, so the truck still reads PENDING here. Loading again would queue a
        // second row with its own idempotency key, which the server accepts and then refuses
        // ("Shipment is already LOADED"). Delete goes with it — it would strand the queued photo.
        //
        // [failedLoad] is the same block with a different story. A row the server has already
        // rejected is not on its way anywhere, so labelling it «Юборилмоқда…» — while the banner
        // above reads «Юборилмади» — told the operator to keep waiting for something that had
        // stopped. The banner is where the retry and the cancel are.
        when (sh.status) {
            ShipmentStatus.PENDING -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(
                    text = stringResource(
                        when {
                            failedLoad -> R.string.logistics_upload_failed_short
                            unsentLoad -> R.string.logistics_upload_sending
                            else -> R.string.action_load_shipment
                        }
                    ),
                    onClick = onLoad, enabled = !unsentLoad, modifier = Modifier.weight(1f),
                )
                DangerButton(stringResource(R.string.action_delete_shipment), onClick = onDelete, enabled = !actionsDisabled && !unsentLoad, modifier = Modifier.weight(1f))
            }
            ShipmentStatus.LOADED -> PrimaryButton(stringResource(R.string.action_dispatch_shipment), onClick = onDispatch)
            ShipmentStatus.DISPATCHED -> SecondaryButton(stringResource(R.string.action_deliver_shipment), onClick = onDeliver, enabled = !actionsDisabled)
            ShipmentStatus.DELIVERED, ShipmentStatus.UNKNOWN -> {}
        }
    }
}
