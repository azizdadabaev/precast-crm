package uz.etalon.crm.feature.logistics.shipments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.Chip
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

private fun shipmentStatusTone(s: ShipmentStatus): ChipTone = when (s) {
    ShipmentStatus.PENDING -> ChipTone.NEUTRAL
    ShipmentStatus.LOADED -> ChipTone.WARNING
    ShipmentStatus.DISPATCHED -> ChipTone.GOLD
    ShipmentStatus.DELIVERED -> ChipTone.SUCCESS
    ShipmentStatus.UNKNOWN -> ChipTone.NEUTRAL
}

private fun shipmentStatusLabel(s: ShipmentStatus): Int = when (s) {
    ShipmentStatus.PENDING -> R.string.shipment_status_pending
    ShipmentStatus.LOADED -> DesignSystemR.string.status_loaded
    ShipmentStatus.DISPATCHED -> DesignSystemR.string.status_dispatched
    ShipmentStatus.DELIVERED -> DesignSystemR.string.status_delivered
    ShipmentStatus.UNKNOWN -> DesignSystemR.string.status_unknown
}

@Composable
fun ShipmentsRoute(
    orderId: String, onLoadShipment: (String) -> Unit, onDispatch: (String) -> Unit, onBack: () -> Unit,
    vm: ShipmentsViewModel = hiltViewModel<ShipmentsViewModel, ShipmentsViewModel.Factory>(creationCallback = { it.create(orderId) }),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ShipmentsScreen(s, onLoadShipment, onDispatch, onBack, vm::addShipment, vm::deleteShipment, vm::deliverShipment)
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
) {
    val shipments = s.order?.shipments.orEmpty()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.shipments_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
        bottomBar = {
            StickyActionBar {
                PrimaryButton(
                    text = stringResource(R.string.action_add_shipment), onClick = onAdd,
                    enabled = s.canAddShipment, loading = s.busy,
                )
            }
        },
    ) { pad ->
        LazyColumn(
            modifier = Modifier.padding(pad).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val actionError = s.actionError
            if (actionError != null) item { ErrorBanner(actionError) }
            if (shipments.isEmpty()) item { EmptyState(stringResource(R.string.shipments_empty)) }
            items(shipments, key = { it.id }) { sh ->
                ShipmentCard(sh, busy = s.busy, onLoad = { onLoadShipment(sh.id) }, onDispatch = { onDispatch(sh.id) }, onDeliver = { onDeliver(sh.id) }, onDelete = { onDelete(sh.id) })
            }
        }
    }
}

@Composable
private fun ShipmentCard(
    sh: ShipmentLine, busy: Boolean,
    onLoad: () -> Unit, onDispatch: () -> Unit, onDeliver: () -> Unit, onDelete: () -> Unit,
) {
    StatusStripeCard(stripe = toneColor(shipmentStatusTone(sh.status))) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.shipment_n, sh.number), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Chip(shipmentStatusTone(sh.status), stringResource(shipmentStatusLabel(sh.status)))
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
        when (sh.status) {
            ShipmentStatus.PENDING -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(stringResource(R.string.action_load_shipment), onClick = onLoad, modifier = Modifier.weight(1f))
                DangerButton(stringResource(R.string.action_delete_shipment), onClick = onDelete, enabled = !busy, modifier = Modifier.weight(1f))
            }
            ShipmentStatus.LOADED -> PrimaryButton(stringResource(R.string.action_dispatch_shipment), onClick = onDispatch)
            ShipmentStatus.DISPATCHED -> SecondaryButton(stringResource(R.string.action_deliver_shipment), onClick = onDeliver, enabled = !busy)
            ShipmentStatus.DELIVERED, ShipmentStatus.UNKNOWN -> {}
        }
    }
}
