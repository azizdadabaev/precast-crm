package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * One of a linked pair of catalogues (viloyat/tuman). §2 draws it as a [FormField] whose value
 * row carries a chevron: the value is never typed, 206 tumans need a search box rather than a
 * dropdown, and D7's 48 dp thumb target comes from [minimumInteractiveComponentSize].
 *
 * The field draws no divider — it is used on its own today, not yet inside a [FormCard], and a
 * hairline under a lone field is a rule to nowhere. Instead the value row wears §2's numeric-input
 * skin: h40, page ground, hairline, radius `md`. Standing alone it needs a frame of its own —
 * without one it is an 11 dp label over plain text with a small chevron, which on the calculator's
 * client bar and on `ClientEditScreen` sits between two bordered inputs and reads as static text
 * rather than as the control it is.
 *
 * [label] is a plain `String` rather than a `@StringRes Int` — a shared component must not name
 * another module's string resources. Moved out of `:feature:clients`' `ClientEditScreen.kt` in
 * Task 7 so the calculator's client bar can share the same picker.
 */
@Composable
fun RegionField(label: String, value: String, onOpen: () -> Unit) = FormField(label, divider = false) {
    Row(
        Modifier.fillMaxWidth()
            .minimumInteractiveComponentSize()
            .height(40.dp)
            .clip(EtalonShapes.md)
            .background(EtalonColors.page)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            value.ifEmpty { stringResource(R.string.ds_region_unset) },
            style = FormFieldValue,
            color = if (value.isEmpty()) EtalonColors.ink3 else EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        EtalonIcon(EtalonIcons.ChevronDown, null, size = 16.dp, tint = EtalonColors.ink3)
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
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SectionLabel(title)
            SearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = stringResource(R.string.ds_region_search),
                onClear = { query = "" },
            )
            // Clearing is a real choice here — it is the address's region that is being unset,
            // not the whole address, so nothing the server would silently drop.
            SecondaryButton(stringResource(R.string.ds_region_clear), onClick = { onPick("") })
            if (matches.isEmpty()) EmptyState(stringResource(R.string.ds_region_empty))
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                items(matches, key = { it.first }) { (uz, _) ->
                    Row(
                        Modifier.fillMaxWidth()
                            .heightIn(min = EtalonSpace.minTouch)
                            .clickable(role = Role.Button) { onPick(uz) }
                            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(uz, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
