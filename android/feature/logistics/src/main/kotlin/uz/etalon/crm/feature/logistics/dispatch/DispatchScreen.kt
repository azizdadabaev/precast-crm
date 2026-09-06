package uz.etalon.crm.feature.logistics.dispatch

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.feature.logistics.drivers.DriverPicker

/**
 * `shipmentId == null` dispatches the whole order (LogisticsRepository.createDispatch); a
 * non-null id dispatches one truck of a split shipment (dispatchShipment). Both are online-only
 * — see DispatchViewModel's isOffline, derived the same way ShipmentsUiState derives its own.
 */
@Composable
fun DispatchRoute(
    orderId: String, shipmentId: String?, onDone: () -> Unit, onCancel: () -> Unit,
    vm: HiltDispatchViewModel = hiltViewModel<HiltDispatchViewModel, HiltDispatchViewModel.Factory>(
        creationCallback = { it.create(orderId, shipmentId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }
    DispatchScreen(
        s = s, isShipment = shipmentId != null, onCancel = onCancel,
        onSetDriverId = vm::setDriverId, onSetTruck = vm::setTruck,
        onSetWillCollectCash = vm::setWillCollectCash, onSetAmountDigits = vm::setAmountDigits,
        onSubmit = vm::submit, onRetryDrivers = vm::refreshDrivers,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DispatchScreen(
    s: DispatchUiState,
    isShipment: Boolean,
    onCancel: () -> Unit,
    onSetDriverId: (String?) -> Unit,
    onSetTruck: (String) -> Unit,
    onSetWillCollectCash: (Boolean) -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSubmit: () -> Unit,
    onRetryDrivers: () -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }
    var showKeypad by remember { mutableStateOf(false) }
    // The whole-order route always requires an amount; the per-shipment route only collects one
    // when the driver-will-collect-cash switch is on — see HiltDispatchViewModel's DispatchUseCase.
    val amountApplies = !isShipment || s.willCollectCash
    // Mirrors DispatchViewModel.submit()'s own guard: a whole-order dispatch with nothing typed
    // must never reach the server, since a mis-submit there can't be undone from the app.
    val canSubmit = !s.isOffline && (isShipment || !s.amount.isZero)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.dispatch_title)) },
                navigationIcon = { IconButton(onClick = onCancel) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
        bottomBar = {
            StickyActionBar {
                PrimaryButton(
                    text = stringResource(R.string.action_dispatch), onClick = onSubmit,
                    enabled = canSubmit, loading = s.submitting,
                )
            }
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // The active-driver fetch's own outcome — any failure, not only offline — with a retry,
            // so a 403/500/decode error is never silently swallowed and offline is never a dead end.
            val driversError = s.driversErrorMessage
            if (driversError != null) ErrorBanner(driversError, onRetry = onRetryDrivers)
            if (s.isOffline) ErrorBanner(stringResource(R.string.offline_action_blocked))
            val error = s.error
            if (error != null) ErrorBanner(error)

            val selectedDriverName = s.drivers.find { it.id == s.driverId }?.name ?: stringResource(R.string.driver_none)
            SecondaryButton(text = selectedDriverName, onClick = { showPicker = true }, leading = Icons.Filled.Person)

            OutlinedTextField(
                value = s.truck, onValueChange = onSetTruck,
                label = { Text(stringResource(R.string.dispatch_truck)) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            if (isShipment) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.dispatch_will_collect_cash))
                    Switch(checked = s.willCollectCash, onCheckedChange = onSetWillCollectCash)
                }
            }

            Column(
                Modifier.fillMaxWidth()
                    .clickable(enabled = amountApplies) { showKeypad = true }
                    .alpha(if (amountApplies) 1f else 0.4f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    stringResource(R.string.dispatch_expected), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                MoneyText(s.amount, style = EtalonType.monoDisplay)
            }
        }
    }

    if (showPicker) {
        DriverPicker(drivers = s.drivers, selected = s.driverId, onSelect = { onSetDriverId(it); showPicker = false })
    }
    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.dispatch_expected),
            initial = s.amountDigits,
            suffix = "UZS",
            allowDecimal = false,
            onConfirm = { onSetAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
    }
}
