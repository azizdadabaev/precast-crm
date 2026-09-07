package uz.etalon.crm.feature.clients.edit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.feature.clients.R

/** Which of the two linked catalogues the sheet is currently browsing, if either. */
private enum class RegionPick { VILOYAT, TUMAN }

private val ROW_MIN = 48.dp

/**
 * Adding a customer, or correcting one.
 *
 * [client] null means create. On success the sheet reports the id it was given and the host opens
 * that client — never a «қўшилди» toast, because `POST /api/clients` dedups on the normalised
 * phone and may have returned a client that already existed.
 *
 * The region picker REPLACES this sheet rather than stacking on it, the same way the payment
 * keypad does: a second bottom sheet over an open one is not a shape this app uses, and nothing
 * is lost by the swap because every field lives in the ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientEditSheet(
    client: ClientDetail?,
    isOffline: Boolean,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
    vm: HiltClientEditViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf<RegionPick?>(null) }

    // This ViewModel is scoped to the back-stack entry, not to the sheet, so it outlives a
    // dismissal — the form is blanked and reseeded every time the sheet opens.
    LaunchedEffect(client?.id) { if (client == null) vm.openCreate() else vm.openEdit(client) }
    LaunchedEffect(isOffline) { vm.setOffline(isOffline) }
    LaunchedEffect(s.savedId) { s.savedId?.let(onSaved) }

    val pick = picking
    if (pick != null) {
        RegionPickerSheet(
            titleRes = if (pick == RegionPick.VILOYAT) R.string.client_field_viloyat else R.string.client_field_tuman,
            options = when (pick) {
                RegionPick.VILOYAT -> VILOYATS.map { it.nameUz to it.name }
                RegionPick.TUMAN -> tumansOf(s.viloyat).map { it.nameUz to it.name }
            },
            onDismiss = { picking = null },
            onPick = { chosen ->
                if (pick == RegionPick.VILOYAT) vm.setViloyat(chosen) else vm.setTuman(chosen)
                picking = null
            },
        )
        return
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(if (s.isEditing) R.string.client_edit_title else R.string.client_create_title),
                style = MaterialTheme.typography.titleMedium,
            )
            s.error?.let { ErrorBanner(it) }
            // Both fields keep their stored value on a clear (a null is omitted from the PATCH
            // body), so say so before the operator empties one rather than only when the save
            // is refused.
            if (s.showKeepNotice) NoticeBanner(stringResource(R.string.client_keep_notice))

            OutlinedTextField(
                value = s.name, onValueChange = vm::setName,
                label = { Text(stringResource(R.string.client_field_name)) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            // The "+998 " is display-only: the field holds the nine local digits and the
            // ViewModel sends the twelve-digit form, exactly as the drivers sheet does.
            OutlinedTextField(
                value = s.phoneDigits,
                onValueChange = { vm.setPhoneDigits(it.filter { c -> c in '0'..'9' }.take(9)) },
                label = { Text(stringResource(R.string.client_field_phone)) },
                prefix = { Text("+998 ") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true, textStyle = EtalonType.monoBody,
                modifier = Modifier.fillMaxWidth(),
            )
            RegionField(R.string.client_field_viloyat, s.viloyat) { picking = RegionPick.VILOYAT }
            RegionField(R.string.client_field_tuman, s.tuman) { picking = RegionPick.TUMAN }
            OutlinedTextField(
                value = s.street, onValueChange = vm::setStreet,
                label = { Text(stringResource(R.string.client_field_street)) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = s.notes, onValueChange = vm::setNotes,
                label = { Text(stringResource(R.string.client_field_notes)) },
                modifier = Modifier.fillMaxWidth(),
            )
            // Guarded on the button as well as in the ViewModel: neither client route is
            // server-side idempotent, so a double tap must not become two writes.
            PrimaryButton(
                text = stringResource(R.string.client_action_save),
                onClick = vm::submit,
                enabled = s.canSave,
                loading = s.submitting,
            )
        }
    }
}

/**
 * One of the two linked catalogues, as a labelled button rather than a text field: the value is
 * never typed, 206 tumans need a search box rather than a dropdown, and a button is already the
 * design system's 48 dp thumb target.
 */
@Composable
private fun RegionField(labelRes: Int, value: String, onOpen: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SectionLabel(stringResource(labelRes))
        SecondaryButton(
            text = value.ifEmpty { stringResource(R.string.client_region_unset) },
            onClick = onOpen,
            leading = Icons.Default.ArrowDropDown,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RegionPickerSheet(
    titleRes: Int,
    /** Cyrillic name to Latin name — the Cyrillic is what gets stored, the Latin is searchable. */
    options: List<Pair<String, String>>,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val matches = remember(query, options) {
        val q = query.trim()
        if (q.isEmpty()) options
        else options.filter { (uz, latin) -> uz.contains(q, ignoreCase = true) || latin.contains(q, ignoreCase = true) }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(titleRes), style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.client_region_search)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            // Clearing is a real choice here — it is the address's region that is being unset,
            // not the whole address, so nothing the server would silently drop.
            SecondaryButton(stringResource(R.string.client_region_clear), onClick = { onPick("") })
            if (matches.isEmpty()) {
                Text(
                    stringResource(R.string.client_region_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                items(matches, key = { it.first }) { (uz, latin) ->
                    ListItem(
                        headlineContent = { Text(uz) },
                        supportingContent = { Text(latin, style = MaterialTheme.typography.bodySmall) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = ROW_MIN)
                            .clickable { onPick(uz) },
                    )
                }
            }
        }
    }
}
