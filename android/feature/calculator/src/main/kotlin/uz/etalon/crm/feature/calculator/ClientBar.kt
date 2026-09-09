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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
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

/** «·» between segments of the collapsed client row — layout punctuation, not translatable
 *  content, so it's a literal here rather than a string resource, the same way
 *  `formatAddressLine`'s own separator is (`core/ui/format/Formatters.kt`). */
private const val SEGMENT_SEPARATOR = " · "

/**
 * Who the quote is for, expanded: phone-first client lookup. Typing digits searches existing
 * clients by phone; a match fills the name and address, a miss simply starts a new customer.
 * Once a phone and a name are both present `CalculatorViewModel` collapses the bar and
 * [ClientBarCollapsed] takes over.
 *
 * Rendered by `CalculatorScreen.kt` as an ordinary scrolling `LazyColumn` item, never pinned —
 * at five fields tall, a sticky copy of this would cover the whole room list underneath the
 * docked keypad, which is exactly the bug this split (see [ClientBarCollapsed]'s KDoc) exists to
 * avoid.
 *
 * Takes [vm] directly rather than a bundle of callbacks, the same way `TotalsSheet` does: this is
 * a slot [CalculatorRoute] hands to `CalculatorScreen` (`clientBarExpanded` there), not something
 * `CalculatorScreen` itself holds a `CalculatorViewModel` reference to build.
 */
@Composable
fun ClientBarExpanded(state: CalculatorUiState, vm: CalculatorViewModel) {
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
        // fillMaxWidth() here is the FULL LazyColumn width — `CalculatorScreen.kt`'s
        // `contentPadding` carries no horizontal inset (each item insets itself instead) so this
        // background paints edge to edge under the system bars' side, matching [ClientBarCollapsed]
        // and leaving no gutter a room card could ever show through while scrolling underneath.
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
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

/**
 * Who the quote is for, collapsed to one line — «{name} · {phone}» in the ordinary text color
 * (who this is), then «{address}» muted (where it goes): the same identity-vs-address grouping an
 * operator's eye already makes reading a client card, done here with color instead of a second
 * separator string. An address that has not been typed simply drops out, rather than leaving a
 * bare separator behind.
 *
 * This is the ONLY part of the client bar `CalculatorScreen.kt` renders as its `LazyColumn`
 * `stickyHeader` — see [ClientBarExpanded]'s own KDoc for why the five-field form must not be:
 * pinned, this one-line row costs the room list almost nothing for the rest of the session, which
 * is the whole point of collapsing it in the first place. The pencil re-expands it.
 */
@Composable
fun ClientBarCollapsed(state: CalculatorUiState, onReopen: () -> Unit) {
    val address = formatAddressLine(composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street))
    val identity = listOfNotNull(
        state.clientName.takeIf { it.isNotBlank() },
        formatPhone(state.clientPhoneDigits),
    ).joinToString(SEGMENT_SEPARATOR)
    val line = buildAnnotatedString {
        append(identity)
        if (address != null) {
            append(SEGMENT_SEPARATOR)
            withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant)) { append(address) }
        }
    }
    Row(
        // See [ClientBarExpanded]'s matching comment: fillMaxWidth() is the full LazyColumn width,
        // so this background — the one that's actually pinned above scrolling rooms — spans edge
        // to edge with no gutter, and the 16dp content padding below lines the text up with
        // `RoomCard`'s own edge (`CalculatorScreen.kt` gives `RoomCard` the same 16dp explicitly,
        // now that `contentPadding` no longer supplies it for free).
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            line,
            style = EtalonType.monoBody,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onReopen) {
            Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.calc_client_edit))
        }
    }
}
