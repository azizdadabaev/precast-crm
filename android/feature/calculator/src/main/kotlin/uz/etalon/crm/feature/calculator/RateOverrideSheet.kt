package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatMoney

/**
 * The one control in the calculator that changes what a customer is charged: replaces the
 * engine's auto-picked m² rate with one of the five [M2_OVERRIDE_TIERS] catalogue prices —
 * catalogue-only, because the server's Zod validator checks `m2PriceOverrideValue` against that
 * exact static list (never the live, owner-editable bootstrap pricing a session could be
 * carrying — see [M2_OVERRIDE_TIERS]'s own KDoc). The operator picks a row; nothing here is a
 * free-typed number.
 *
 * The reason is mandatory on this client (see [CalculatorViewModel.applyRateOverride]'s KDoc):
 * [onApply] only fires once both a tier and a non-blank reason are in place.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RateOverrideSheet(
    row: SlabRow,
    onDismiss: () -> Unit,
    onApply: (Double, String) -> Unit,
    onClear: () -> Unit,
) {
    val auto = autoPickedRate(row)
    var selected by remember(row.id) { mutableStateOf(row.m2PriceOverrideValue) }
    var reason by remember(row.id) { mutableStateOf(row.m2PriceReason.orEmpty()) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionLabel(stringResource(R.string.calc_rate_override_title))

            Column {
                M2_OVERRIDE_TIERS.forEach { tier ->
                    TierRow(
                        price = tier.price,
                        isAuto = tier.price == auto,
                        selected = selected == tier.price,
                        onClick = { selected = tier.price },
                    )
                }
            }

            OutlinedTextField(
                value = reason,
                onValueChange = { if (it.length <= MAX_REASON) reason = it },
                label = { Text(stringResource(R.string.calc_rate_reason)) },
                supportingText = {
                    Text(
                        if (reason.isBlank()) stringResource(R.string.calc_rate_reason_required)
                        else stringResource(R.string.calc_rate_reason_counter, reason.length, MAX_REASON),
                    )
                },
                isError = reason.isBlank(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            PrimaryButton(
                text = stringResource(R.string.calc_rate_apply),
                enabled = selected != null && reason.isNotBlank(),
                onClick = { onApply(selected!!, reason) },
            )
            if (row.m2PriceOverride) {
                SecondaryButton(text = stringResource(R.string.calc_rate_clear), onClick = onClear)
            }
        }
    }
}

/** One catalogue price, selectable like a radio option — the operator picks a row, never types
 *  a number. [isAuto] marks the tier the engine would have picked on its own, so the override is
 *  a visible decision against a known baseline rather than a silent one. */
@Composable
private fun TierRow(price: Double, isAuto: Boolean, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = selected, onClick = null)
            MoneyText(price.asTierMoney(), style = EtalonType.monoBody)
        }
        if (isAuto) {
            Text(
                stringResource(R.string.calc_rate_auto, formatMoney(price.asTierMoney())),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
