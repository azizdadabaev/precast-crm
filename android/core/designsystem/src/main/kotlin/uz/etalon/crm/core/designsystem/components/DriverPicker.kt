package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import uz.etalon.crm.core.model.Driver

/**
 * "No driver" is a first-class row here, not an absence of selection: both dispatch endpoints
 * accept a null driverId outright, and on the record-payment sheet it is the unset state the
 * form's own validation then refuses for a driver-collected payment. Owns its ModalBottomSheet
 * exactly like NumericKeypadSheet does — the caller shows/hides it with an `if (showPicker)`
 * around the call site, and dismissing without tapping a row (back gesture, tap outside)
 * re-confirms whatever was already selected.
 *
 * §2's light [OrderRow] shape: a 36 dp [Avatar], the name, and `lavenderBg` under the selected
 * row. The radio button is gone, but the row keeps `Role.RadioButton` for TalkBack and carries a
 * check glyph, so the selection is never colour alone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverPicker(drivers: List<Driver>, selected: String?, onSelect: (String?) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = { onSelect(selected) },
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            DriverPickerRow(
                name = stringResource(R.string.driver_none),
                isSelected = selected == null,
                anonymous = true,
                onClick = { onSelect(null) },
            )
            drivers.forEach { d ->
                DriverPickerRow(name = d.name, isSelected = selected == d.id, onClick = { onSelect(d.id) })
            }
        }
    }
}

/** @param anonymous the «Ҳайдовчисиз» row: a person's avatar would put a stranger's initial on
 *  the absence of a driver, so it wears the lavender user circle instead. */
@Composable
private fun DriverPickerRow(name: String, isSelected: Boolean, onClick: () -> Unit, anonymous: Boolean = false) = Row(
    Modifier.fillMaxWidth()
        .heightIn(min = EtalonSpace.minTouch)
        .clip(EtalonShapes.lg)
        .background(if (isSelected) EtalonColors.lavenderBg else Color.Transparent)
        .selectable(selected = isSelected, role = Role.RadioButton, onClick = onClick)
        .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
    verticalAlignment = Alignment.CenterVertically,
) {
    if (anonymous) {
        Box(
            Modifier.size(36.dp).clip(EtalonShapes.pill).background(EtalonColors.lavender),
            contentAlignment = Alignment.Center,
        ) { EtalonIcon(EtalonIcons.User, null, size = 18.dp, tint = EtalonColors.indigo) }
    } else {
        Avatar(name, size = 36.dp)
    }
    Spacer(Modifier.width(EtalonSpace.rowGap))
    Text(
        name,
        style = EtalonType.rowTitle,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    if (isSelected) EtalonIcon(EtalonIcons.Check, null, size = 16.dp, tint = EtalonColors.indigo)
}
