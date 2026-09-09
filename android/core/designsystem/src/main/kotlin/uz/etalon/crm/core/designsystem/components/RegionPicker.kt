package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R

private val ROW_MIN = 48.dp

/**
 * One of a linked pair of catalogues (viloyat/tuman), as a labelled button rather than a text
 * field: the value is never typed, 206 tumans need a search box rather than a dropdown, and a
 * button is already the design system's 48 dp thumb target.
 *
 * [label] is a plain `String` rather than a `@StringRes Int` — a shared component must not name
 * another module's string resources. Moved out of `:feature:clients`' `ClientEditScreen.kt` in
 * Task 7 so the calculator's client bar can share the same picker.
 */
@Composable
fun RegionField(label: String, value: String, onOpen: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SectionLabel(label)
        SecondaryButton(
            text = value.ifEmpty { stringResource(R.string.ds_region_unset) },
            onClick = onOpen,
            leading = Icons.Default.ArrowDropDown,
        )
    }
}

/**
 * The search sheet [RegionField] opens. [options] is Cyrillic name to Latin name — the Cyrillic
 * is what gets stored and shown, the Latin is a search key only (matched below, never displayed —
 * the web's `AddressInput` does the same).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegionPickerSheet(
    title: String,
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
            Text(title, style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.ds_region_search)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            // Clearing is a real choice here — it is the address's region that is being unset,
            // not the whole address, so nothing the server would silently drop.
            SecondaryButton(stringResource(R.string.ds_region_clear), onClick = { onPick("") })
            if (matches.isEmpty()) {
                Text(
                    stringResource(R.string.ds_region_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                items(matches, key = { it.first }) { (uz, _) ->
                    ListItem(
                        headlineContent = { Text(uz) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = ROW_MIN)
                            .clickable { onPick(uz) },
                    )
                }
            }
        }
    }
}
