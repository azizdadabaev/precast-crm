package uz.etalon.crm.feature.logistics.drivers

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.*
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.DriverStatusChip
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.driverActiveTone
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.feature.logistics.R

@Composable
fun DriversRoute(onBack: () -> Unit, vm: HiltDriversViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val canManage by vm.canManage.collectAsStateWithLifecycle()
    DriversScreen(
        s = s, canManage = canManage, onBack = onBack, onRefresh = vm::refresh,
        onSetActiveOnly = vm::setActiveOnly, onCreate = vm::create, onSetActive = vm::setActive,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriversScreen(
    s: DriversUiState,
    canManage: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onSetActiveOnly: (Boolean) -> Unit,
    onCreate: (name: String, phone: String, notes: String?) -> Unit,
    onSetActive: (id: String, active: Boolean) -> Unit,
) {
    var showAdd by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.drivers_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
        bottomBar = {
            if (canManage) {
                // Lifted clear of the shell's floating nav pill, which is drawn over this screen.
                Box(Modifier.padding(bottom = EtalonSpace.underNav)) {
                    StickyActionBar {
                        PrimaryButton(stringResource(R.string.action_add_driver), onClick = { showAdd = true }, enabled = !s.loading && !s.isOffline)
                    }
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
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.drivers_active_only))
                        Switch(checked = s.activeOnly, onCheckedChange = onSetActiveOnly)
                    }
                }
                val error = s.error
                if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.drivers_empty)) }
                items(s.drivers, key = { it.id }) { d ->
                    DriverCard(d, canManage = canManage, actionsDisabled = s.loading || s.isOffline, onSetActive = { active -> onSetActive(d.id, active) })
                }
            }
        }
    }

    if (showAdd) {
        AddDriverSheet(
            submitting = s.loading,
            onDismiss = { showAdd = false },
            onCreate = { name, phone, notes -> onCreate(name, phone, notes); showAdd = false },
        )
    }
}

@Composable
private fun DriverCard(d: Driver, canManage: Boolean, actionsDisabled: Boolean, onSetActive: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    StatusStripeCard(stripe = toneColor(driverActiveTone(d.active))) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(d.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            DriverStatusChip(d.active)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(formatPhone(d.phone), style = EtalonType.monoBody, color = MaterialTheme.colorScheme.primary)
            IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+${d.phone}"))) }) {
                Icon(Icons.Default.Call, contentDescription = stringResource(R.string.driver_phone))
            }
        }
        Text(
            stringResource(R.string.driver_active_dispatches, d.activeDispatchCount),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(R.string.driver_discrepancies_30d, d.discrepancyCount30d),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (canManage) {
            if (d.active) {
                DangerButton(stringResource(R.string.action_deactivate_driver), onClick = { onSetActive(false) }, enabled = !actionsDisabled)
            } else {
                SecondaryButton(stringResource(R.string.action_activate_driver), onClick = { onSetActive(true) }, enabled = !actionsDisabled)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddDriverSheet(submitting: Boolean, onDismiss: () -> Unit, onCreate: (name: String, phone: String, notes: String?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var phoneDigits by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text(stringResource(R.string.driver_name)) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = phoneDigits, onValueChange = { phoneDigits = it.filter(Char::isDigit).take(9) },
                label = { Text(stringResource(R.string.driver_phone)) },
                prefix = { Text("+998 ") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = notes, onValueChange = { notes = it },
                label = { Text(stringResource(R.string.driver_notes)) },
                modifier = Modifier.fillMaxWidth(),
            )
            PrimaryButton(
                stringResource(R.string.action_add_driver),
                onClick = { onCreate(name, "998$phoneDigits", notes.ifBlank { null }) },
                enabled = !submitting, loading = submitting,
            )
        }
    }
}
