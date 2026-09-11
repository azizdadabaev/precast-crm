package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.FormFieldValue
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatWeightKg
import java.math.BigDecimal

/** The sheet's own margins — §2's form sheet, the same 20/16 `OutboxSheet` uses. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg
/** The air between the title, the card and «Тозалаш». */
private val BLOCK_GAP = EtalonSpace.md
/** The air between two chips, and between a schedule row and the next. */
private val ROW_GAP = EtalonSpace.sm

/**
 * What used to sit in the expanded totals sheet and has nowhere else to go under design 3a
 * (ruling R5 / D10): the 5-vs-10 cm grid, «Барча хоналарни юқорилаштириш», the beam-and-block
 * schedule, the weight formula, and «Тозалаш» last.
 *
 * All five are working aids rather than parts of the quote: none of them is on the customer's
 * side of the screen, which is why the summary sheet shows a ⋯ instead. Discount, delivery and
 * other cost went the other way — onto the place-order sheet, where they are entered once, at the
 * moment they are agreed.
 *
 * «Тозалаш» keeps its existing semantics exactly: `clearAll` takes effect immediately, with no
 * second confirmation (see `CalculatorViewModel.clearAll`). It is placed last, and dismisses the
 * sheet with it — leaving the operator looking at the settings for a quote that no longer exists
 * is the one thing that would read as a failure.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummarySettingsSheet(state: CalculatorUiState, vm: CalculatorViewModel, onDismiss: () -> Unit) = ModalBottomSheet(
    onDismissRequest = onDismiss,
    containerColor = EtalonColors.surface,
    shape = EtalonShapes.sheetTop,
    dragHandle = null,
    // Straight to full height. At Material's half-screen partial anchor a beam schedule of any
    // length pushes «Тозалаш» off the bottom edge, and a destructive action that is drawn but
    // unreachable is worse than one that is not drawn at all.
    sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
) {
    Column(
        Modifier.fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
        verticalArrangement = Arrangement.spacedBy(BLOCK_GAP),
    ) {
        Text(stringResource(R.string.calc_settings_title), style = EtalonType.sectionTitle, color = EtalonColors.ink)

        FormCard {
            FormField(stringResource(R.string.calc_grid_label)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ROW_GAP)) {
                    EtalonFilterChip(
                        label = stringResource(R.string.calc_grid_10),
                        selected = state.grid == Grid.CM10,
                        onClick = { vm.setGrid(Grid.CM10) },
                    )
                    EtalonFilterChip(
                        label = stringResource(R.string.calc_grid_5),
                        selected = state.grid == Grid.CM5,
                        onClick = { vm.setGrid(Grid.CM5) },
                    )
                }
            }

            FormField(stringResource(R.string.calc_round_all_up)) {
                SecondaryButton(
                    text = stringResource(R.string.calc_round_all_up_action),
                    onClick = vm::roundAllWidthsUp,
                    enabled = state.rows.isNotEmpty(),
                    compact = true,
                )
            }

            FormField(stringResource(R.string.calc_production_list)) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ROW_GAP)) {
                    if (state.schedule.isEmpty()) {
                        Text(
                            stringResource(R.string.calc_schedule_empty),
                            style = EtalonType.body,
                            color = EtalonColors.ink3,
                        )
                    } else {
                        // `lengthKey` is already a two-decimal STRING from the engine layer (see
                        // its KDoc in `Totals.kt`) — only the decimal separator changes here, the
                        // digits are never re-derived.
                        state.schedule.forEach { line ->
                            ScheduleRow(
                                label = stringResource(R.string.calc_schedule_row, line.lengthKey.replace('.', ',')),
                                value = stringResource(
                                    R.string.calc_pieces,
                                    formatDecimal(BigDecimal.valueOf(line.beams.toLong()), 0),
                                ),
                            )
                        }
                        if (state.totals.blocks > 0) {
                            ScheduleRow(
                                label = stringResource(R.string.calc_total_blocks),
                                value = stringResource(
                                    R.string.calc_pieces,
                                    formatDecimal(BigDecimal.valueOf(state.totals.blocks.toLong()), 0),
                                ),
                            )
                        }
                    }
                }
            }

            FormField(stringResource(R.string.calc_total_weight), divider = false) {
                Text(
                    stringResource(
                        R.string.calc_weight_formula,
                        formatArea(BigDecimal.valueOf(state.totals.monolithArea)),
                        formatWeightKg(state.totalWeightKg),
                    ),
                    style = FormFieldValue,
                    color = EtalonColors.ink,
                )
            }
        }

        DangerButton(
            text = stringResource(R.string.calc_action_clear),
            onClick = { vm.clearAll(); onDismiss() },
            enabled = !state.saving && !state.placing,
        )
    }
}

/** One «Балка · 4,30 м — 12 дона» line: the length on the left, the count on the right. */
@Composable
private fun ScheduleRow(label: String, value: String) = Row(
    Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(label, style = EtalonType.body, color = EtalonColors.ink2)
    Text(value, style = EtalonType.rowTitle, color = EtalonColors.ink)
}
