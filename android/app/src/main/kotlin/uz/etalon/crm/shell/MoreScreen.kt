package uz.etalon.crm.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.R
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import javax.inject.Inject

/** Uzbek label for a role; the enum constant itself is an English identifier and must not reach the UI. */
fun roleLabel(role: Role): Int = when (role) {
    Role.OWNER -> R.string.role_owner
    Role.ADMIN -> R.string.role_admin
    Role.SALES -> R.string.role_sales
    Role.INVENTORY -> R.string.role_inventory
    Role.DRIVER -> R.string.role_driver
    Role.ACCOUNTANT -> R.string.role_accountant
    Role.CUSTOM -> R.string.role_custom
    Role.UNKNOWN -> R.string.role_unknown
}

/**
 * Only the pending count is needed here. Signing out does NOT wipe the outbox — a queued upload
 * belongs to the operator who made it and waits for them to come back (`SessionRepository.signOut`)
 * — but they still need to know work is unsent before they hand the phone over, because a
 * *different* operator signing in on it is what destroys it (`login`'s ownership purge).
 *
 * The count excludes rows the server already rejected: those are not on their way anywhere, and
 * counting them would put this dialog in front of the operator on every sign-out from then on.
 */
@HiltViewModel
class MoreViewModel @Inject constructor(outbox: OutboxRepository) : ViewModel() {
    val pendingUploads: StateFlow<Int> = outbox.observePendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}

@Composable
fun MoreRoute(
    me: Me,
    onOpen: (Destination) -> Unit,
    onOpenDrivers: () -> Unit,
    onChangePin: () -> Unit,
    onSignOut: () -> Unit,
    vm: MoreViewModel = hiltViewModel(),
) {
    val pending by vm.pendingUploads.collectAsStateWithLifecycle()
    MoreScreen(me, pending, onOpen, onOpenDrivers, onChangePin, onSignOut)
}

@Composable
fun MoreScreen(
    me: Me,
    pendingUploads: Int,
    onOpen: (Destination) -> Unit,
    onOpenDrivers: () -> Unit,
    onChangePin: () -> Unit,
    onSignOut: () -> Unit,
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(me.name, style = MaterialTheme.typography.headlineMedium)
        SectionLabel(stringResource(roleLabel(me.role)))
        moreDestinationsFor(me).forEach { d ->
            OutlinedButton(onClick = { onOpen(d) }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(d.labelRes))
            }
        }
        if (me.can("driver.view")) {
            OutlinedButton(onClick = onOpenDrivers, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(R.string.more_drivers))
            }
        }
        OutlinedButton(onClick = onChangePin, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Text(stringResource(R.string.more_change_pin))
        }
        Spacer(Modifier.height(24.dp))
        TextButton(
            onClick = { if (pendingUploads > 0) confirmSignOut = true else onSignOut() },
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(stringResource(R.string.more_sign_out))
        }
    }
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text(stringResource(R.string.sign_out_pending_title)) },
            text = { Text(stringResource(R.string.sign_out_pending_message, pendingUploads)) },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; onSignOut() }) { Text(stringResource(R.string.more_sign_out)) }
            },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
fun ComingSoonScreen(labelRes: Int) {
    Column(Modifier.fillMaxSize()) {
        Text(
            stringResource(labelRes),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(24.dp),
        )
        EmptyState(stringResource(R.string.coming_soon))
    }
}

/** Shown for a back-stack key this user's permissions no longer register an entry for. */
@Composable
fun NoAccessScreen() {
    Column(Modifier.fillMaxSize()) { EmptyState(stringResource(R.string.no_access)) }
}
