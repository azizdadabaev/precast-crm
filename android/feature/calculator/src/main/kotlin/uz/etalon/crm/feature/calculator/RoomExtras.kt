package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMeters
import uz.etalon.crm.core.ui.format.formatMoney

/** Which of the two comma-decimal fields the modal keypad is editing. Таяниш/Корр. are rare,
 *  one-off edits standing in front of a customer — a modal sheet is right here, unlike the
 *  docked ЭНИ/БЎЙИ walk [CalculatorViewModel.openKeypad] drives on the collapsed card. */
private enum class ExtrasKeypadField { BEARING, CORRECTION }

/**
 * [autoPickedRate] and every [uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS] price are always a
 * whole-UZS figure straight out of the engine's tier tables — never a fraction of a tiyin — so
 * routing it through [Money.parse] (the same public conversion the rest of the app uses for a
 * server decimal string) is exact. `:core:calc`'s own `moneyOf` does the equivalent job but is
 * `internal` to that module on purpose (see its KDoc); this is the boundary-respecting way to
 * render one of its raw `Double`s as [Money] from a feature module.
 */
internal fun Double.asTierMoney(): Money = Money.parse(toLong().toString())

/** Parses the keypad's comma-decimal text the same way [CalculatorViewModel.commitKeypad] does:
 *  an empty or unparsable pad commits as `0.0` rather than leaving the field untouched. */
private fun parseKeypadValue(text: String): Double = text.replace(',', '.').toDoubleOrNull() ?: 0.0

/**
 * «Қўшимча»: the seven remaining engine inputs, split from the engine's own read-only working-out
 * underneath them — never mixed, per the design. [vm] is called directly rather than threaded back
 * up through a wall of callbacks: this panel alone needs nine of them, and only one room's panel
 * is ever open at a time.
 */
@Composable
fun RoomExtras(row: SlabRow, vm: CalculatorViewModel) {
    val r = row.result
    var keypadField by remember(row.id) { mutableStateOf<ExtrasKeypadField?>(null) }
    var showRateSheet by remember(row.id) { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // ── Editable: what the operator may change ────────────────────
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SectionLabel(stringResource(R.string.calc_extras))
            EditableValueRow(
                label = stringResource(R.string.calc_field_bearing),
                valueText = formatMeters(row.bearing),
                onClick = { keypadField = ExtrasKeypadField.BEARING },
            )
            EditableValueRow(
                label = stringResource(R.string.calc_field_correction),
                valueText = formatMeters(row.correction),
                onClick = { keypadField = ExtrasKeypadField.CORRECTION },
            )
            CountStepper(
                label = stringResource(R.string.calc_field_extra_beams),
                value = row.extraBeams,
                onChange = { vm.setExtraBeams(row.id, it) },
            )
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(stringResource(R.string.calc_field_start_beam), style = MaterialTheme.typography.bodyMedium)
                Switch(checked = row.forceStartBeam, onCheckedChange = { vm.setForceStartBeam(row.id, it) })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PatternChip(
                    stringResource(R.string.calc_pattern_auto), row.patternOverride == null,
                    { vm.setPattern(row.id, null) }, Modifier.weight(1f),
                )
                PatternChip(
                    stringResource(R.string.calc_pattern_gb), row.patternOverride == Pattern.GB,
                    { vm.setPattern(row.id, Pattern.GB) }, Modifier.weight(1f),
                )
                PatternChip(
                    stringResource(R.string.calc_pattern_bgb), row.patternOverride == Pattern.BGB,
                    { vm.setPattern(row.id, Pattern.BGB) }, Modifier.weight(1f),
                )
                PatternChip(
                    stringResource(R.string.calc_pattern_gbg), row.patternOverride == Pattern.GBG,
                    { vm.setPattern(row.id, Pattern.GBG) }, Modifier.weight(1f),
                )
            }
            if (r != null) {
                Column(
                    Modifier.fillMaxWidth()
                        .clip(MaterialTheme.shapes.small)
                        .clickable { showRateSheet = true }
                        .heightIn(min = 48.dp)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(stringResource(R.string.calc_rate), style = MaterialTheme.typography.bodyMedium)
                        MoneyText(r.money().m2Price, style = EtalonType.monoBody)
                    }
                    if (row.m2PriceOverride) {
                        Text(
                            stringResource(R.string.calc_rate_auto, formatMoney(autoPickedRate(row).asTierMoney())),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // ── Read-only: the engine showing its working ─────────────────
        Column(
            Modifier.fillMaxWidth()
                .clip(MaterialTheme.shapes.medium)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            SectionLabel(stringResource(R.string.calc_working_out))
            if (r != null) {
                ReadOnlyRow(stringResource(R.string.calc_out_monolith_length), formatMeters(r.monolithLength))
                ReadOnlyRow(stringResource(R.string.calc_out_beam_length), formatMeters(r.beamLength))
                ReadOnlyRow(stringResource(R.string.calc_out_pitches), formatCount(r.pitches))
                ReadOnlyRow(stringResource(R.string.calc_out_block_rows), formatCount(r.blockRows))
                ReadOnlyRow(stringResource(R.string.calc_out_blocks_per_row), formatCount(r.blocksPerRow))
            } else {
                Text("—", style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    keypadField?.let { field ->
        val (title, current) = when (field) {
            ExtrasKeypadField.BEARING -> stringResource(R.string.calc_field_bearing) to row.bearing
            ExtrasKeypadField.CORRECTION -> stringResource(R.string.calc_field_correction) to row.correction
        }
        NumericKeypadSheet(
            title = title,
            initial = formatMeters(current).removeSuffix(" м"),
            suffix = "м",
            allowDecimal = true,
            onConfirm = { text ->
                val value = parseKeypadValue(text)
                when (field) {
                    ExtrasKeypadField.BEARING -> vm.setBearing(row.id, value)
                    ExtrasKeypadField.CORRECTION -> vm.setCorrection(row.id, value)
                }
                keypadField = null
            },
            onDismiss = { keypadField = null },
        )
    }

    if (showRateSheet) {
        RateOverrideSheet(
            row = row,
            onDismiss = { showRateSheet = false },
            onApply = { price, reason -> vm.applyRateOverride(row.id, price, reason); showRateSheet = false },
            onClear = { vm.clearRateOverride(row.id); showRateSheet = false },
        )
    }
}

@Composable
private fun PatternChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) }, modifier = modifier.heightIn(min = 48.dp))
}

/** A tappable Таяниш/Корр. row — the same shape as `RoomCard`'s `DimensionField`, just a single
 *  line rather than a two-line box, since these are rare edits, not the screen's main target. */
@Composable
private fun EditableValueRow(label: String, valueText: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(valueText, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** One line of the engine's working-out — no touch handling at all, per the design: this group
 *  answers "why that much?", it is not something to tap. */
@Composable
private fun ReadOnlyRow(label: String, valueText: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(valueText, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
