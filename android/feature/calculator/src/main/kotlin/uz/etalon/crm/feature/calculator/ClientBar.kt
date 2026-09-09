package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.RegionField
import uz.etalon.crm.core.designsystem.components.RegionPickerSheet
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.VILOYATS
import uz.etalon.crm.core.ui.regions.composeAddress
import uz.etalon.crm.core.ui.regions.tumansOf

/** Which of the two linked catalogues the bar is currently browsing, if either — the same shape
 *  `ClientEditSheet`'s own `RegionPick` uses. */
private enum class ClientRegionPick { VILOYAT, TUMAN }

/**
 * Who the quote is for — the calculator's own phone-first client lookup, docked as a
 * `stickyHeader` above the room list (`CalculatorScreen.kt`). Typing digits searches existing
 * clients by phone; a match fills the name and address, a miss simply starts a new customer.
 * Once a phone and a name are both present the bar collapses to one line so it costs almost
 * nothing for the rest of the session — the pencil on that line reopens it.
 *
 * Takes [vm] directly rather than a bundle of callbacks, the same way `TotalsSheet` does: this is
 * a slot [CalculatorRoute] hands to `CalculatorScreen` (`clientBar` there), not something
 * `CalculatorScreen` itself holds a `CalculatorViewModel` reference to build.
 */
@Composable
fun ClientBar(state: CalculatorUiState, vm: CalculatorViewModel) {
    var picking by remember { mutableStateOf<ClientRegionPick?>(null) }

    val pick = picking
    if (pick != null) {
        RegionPickerSheet(
            title = stringResource(if (pick == ClientRegionPick.VILOYAT) R.string.calc_client_viloyat else R.string.calc_client_tuman),
            options = when (pick) {
                ClientRegionPick.VILOYAT -> VILOYATS.map { it.nameUz to it.name }
                ClientRegionPick.TUMAN -> tumansOf(state.clientAddress.viloyat).map { it.nameUz to it.name }
            },
            onDismiss = { picking = null },
            onPick = { chosen ->
                if (pick == ClientRegionPick.VILOYAT) vm.setClientViloyat(chosen) else vm.setClientTuman(chosen)
                picking = null
            },
        )
    }

    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.clientBarCollapsed) {
            CollapsedClientRow(state, onReopen = vm::reopenClientBar)
        } else {
            state.clientLookupError?.let { ErrorBanner(it, onRetry = vm::retryClientLookup) }
            OutlinedTextField(
                value = state.clientPhoneDigits,
                onValueChange = { vm.setClientPhoneDigits(it.filter { c -> c in '0'..'9' }.take(9)) },
                label = { Text(stringResource(R.string.calc_client_phone)) },
                prefix = { Text("+998 ") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true, textStyle = EtalonType.monoBody,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.clientName, onValueChange = vm::setClientName,
                label = { Text(stringResource(R.string.calc_client_name)) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            RegionField(stringResource(R.string.calc_client_viloyat), state.clientAddress.viloyat) { picking = ClientRegionPick.VILOYAT }
            RegionField(stringResource(R.string.calc_client_tuman), state.clientAddress.tuman) { picking = ClientRegionPick.TUMAN }
            OutlinedTextField(
                value = state.clientAddress.street, onValueChange = vm::setClientStreet,
                label = { Text(stringResource(R.string.calc_client_street)) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** «{name} · {phone} · {address}» — an address that has not been typed simply drops out, rather
 *  than leaving a bare separator behind. */
@Composable
private fun CollapsedClientRow(state: CalculatorUiState, onReopen: () -> Unit) {
    val address = formatAddressLine(composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street))
    val parts = listOfNotNull(
        state.clientName.takeIf { it.isNotBlank() },
        formatPhone(state.clientPhoneDigits),
        address,
    )
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            parts.joinToString(stringResource(R.string.calc_client_bar_separator)),
            style = EtalonType.monoBody,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onReopen) {
            Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.calc_client_edit))
        }
    }
}
