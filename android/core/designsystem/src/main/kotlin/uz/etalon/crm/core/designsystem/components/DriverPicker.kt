package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.model.Driver

/**
 * "No driver" is a first-class row here, not an absence of selection: both dispatch endpoints
 * accept a null driverId outright, and on the record-payment sheet it is the unset state the
 * form's own validation then refuses for a driver-collected payment. Owns its ModalBottomSheet
 * exactly like NumericKeypadSheet does — the caller shows/hides it with an `if (showPicker)`
 * around the call site, and dismissing without tapping a row (back gesture, tap outside)
 * re-confirms whatever was already selected.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverPicker(drivers: List<Driver>, selected: String?, onSelect: (String?) -> Unit) {
    ModalBottomSheet(onDismissRequest = { onSelect(selected) }) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            DriverPickerRow(name = stringResource(R.string.driver_none), isSelected = selected == null, onClick = { onSelect(null) })
            drivers.forEach { d ->
                DriverPickerRow(name = d.name, isSelected = selected == d.id, onClick = { onSelect(d.id) })
            }
        }
    }
}

@Composable
private fun DriverPickerRow(name: String, isSelected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = isSelected, onClick = onClick)
        Spacer(Modifier.width(4.dp))
        Text(name, style = MaterialTheme.typography.bodyLarge)
    }
}
