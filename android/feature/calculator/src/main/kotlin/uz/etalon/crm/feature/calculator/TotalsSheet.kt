package uz.etalon.crm.feature.calculator

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.designsystem.components.AreaText
import uz.etalon.crm.core.designsystem.components.CountText
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPercent
import uz.etalon.crm.core.ui.format.formatWeightKg
import java.math.BigDecimal

/** Which of the totals sheet's four money fields the modal keypad is editing — the discount's two
 *  entries are mutually exclusive (only the field for [CalculatorUiState.discountMode] is ever
 *  shown), delivery and other are always both editable. */
private enum class TotalsKeypadField { DISCOUNT_PERCENT, DISCOUNT_AMOUNT, DELIVERY, OTHER }

/** Parses the modal keypad's comma-decimal text the same way `RoomExtras.kt`'s does: an empty or
 *  unparsable pad commits as `0.0` rather than leaving the field untouched. */
private fun parseKeypadValue(text: String): Double = text.replace(',', '.').toDoubleOrNull() ?: 0.0

/**
 * The persistent, draggable, never-dismissible totals sheet — hosted as `BottomSheetScaffold`'s
 * `sheetContent` in [CalculatorScreen] with `sheetPeekHeight = CALC_SHEET_PEEK_HEIGHT` (declared in
 * `CalculatorScreen.kt`, alongside the scaffold that consumes it). The collapsed peek (this
 * composable's first row) and the rest of the content below it are laid
 * out in one column; the scaffold's peek height is what visually clips the rest away until the
 * operator drags the sheet up — this composable renders unconditionally, it never branches on the
 * sheet's own state. This `Column`'s own top padding (`vertical = 12.dp`, below) and the peek
 * `Row`'s `heightIn(min = 48.dp)` are two of the three numbers `CALC_SHEET_PEEK_HEIGHT` budgets —
 * moving either without updating that constant clips the peek again (see its own KDoc).
 *
 * The headline number is [CalculatorUiState.orderTotals]' `totalPrice` — the order-PLACEMENT
 * total (`Order.totalPrice`, delivery and other included) — NOT `totals.projTotal.total`, which
 * never includes delivery/other. See `OrderTotals.kt`'s class doc.
 *
 * [actions] is the slot the next tasks (Save Project / Place Order) fill; empty today.
 */
@Composable
fun TotalsSheet(state: CalculatorUiState, vm: CalculatorViewModel, actions: @Composable () -> Unit) {
    var keypadField by remember { mutableStateOf<TotalsKeypadField?>(null) }

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── Collapsed peek: grand total + total area ──
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MoneyText(state.orderTotals.totalPriceMoney(), style = EtalonType.monoTitle)
            AreaText(
                BigDecimal.valueOf(state.totals.monolithArea), style = EtalonType.monoTitle,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // ── Expanded: everything below the peek. Scrollable, but with no height cap of its own —
        // BottomSheetScaffold's own Expanded anchor already bounds the sheet at the screen height,
        // so this only kicks in if a very long beam schedule ever pushes past that. ──
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            LabelValueRow(stringResource(R.string.calc_rooms_subtotal)) {
                MoneyText(state.totals.projTotal.money().roomsSubtotal, style = EtalonType.monoBody)
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = state.discountMode == DiscountMode.PERCENT,
                        onClick = { vm.setDiscountMode(DiscountMode.PERCENT) },
                        label = { Text(stringResource(R.string.calc_discount_percent)) },
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    )
                    FilterChip(
                        selected = state.discountMode == DiscountMode.AMOUNT,
                        onClick = { vm.setDiscountMode(DiscountMode.AMOUNT) },
                        label = { Text(stringResource(R.string.calc_discount_amount)) },
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    )
                }
                when (state.discountMode) {
                    DiscountMode.PERCENT -> EditableValueRow(
                        label = stringResource(R.string.calc_discount_percent),
                        valueText = formatPercent(BigDecimal.valueOf(state.discountPercent)),
                        onClick = { keypadField = TotalsKeypadField.DISCOUNT_PERCENT },
                    )
                    DiscountMode.AMOUNT -> EditableValueRow(
                        label = stringResource(R.string.calc_discount_amount),
                        valueText = formatMoney(operatorAmountMoney(state.discountAmount)),
                        onClick = { keypadField = TotalsKeypadField.DISCOUNT_AMOUNT },
                    )
                }
            }

            EditableValueRow(
                label = stringResource(R.string.calc_delivery_cost),
                valueText = formatMoney(operatorAmountMoney(state.deliveryCost)),
                onClick = { keypadField = TotalsKeypadField.DELIVERY },
            )
            EditableValueRow(
                label = stringResource(R.string.calc_other_cost),
                valueText = formatMoney(operatorAmountMoney(state.otherCost)),
                onClick = { keypadField = TotalsKeypadField.OTHER },
            )

            LabelValueRow(stringResource(R.string.calc_total_weight)) {
                Text(
                    stringResource(
                        R.string.calc_weight_formula,
                        formatArea(BigDecimal.valueOf(state.totals.monolithArea)),
                        formatWeightKg(state.totalWeightKg),
                    ),
                    style = EtalonType.monoBody,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.calc_grid_label))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(
                        selected = state.grid == Grid.CM10, onClick = { vm.setGrid(Grid.CM10) },
                        label = { Text(stringResource(R.string.calc_grid_10)) }, modifier = Modifier.heightIn(min = 48.dp),
                    )
                    FilterChip(
                        selected = state.grid == Grid.CM5, onClick = { vm.setGrid(Grid.CM5) },
                        label = { Text(stringResource(R.string.calc_grid_5)) }, modifier = Modifier.heightIn(min = 48.dp),
                    )
                    TextButton(onClick = vm::roundAllWidthsUp, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.calc_round_all_up))
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(stringResource(R.string.calc_production_list))
                if (state.schedule.isEmpty()) {
                    EmptyState(stringResource(R.string.calc_schedule_empty))
                } else {
                    // beamLengthKey is already a two-decimal STRING from the engine layer (see its
                    // KDoc in `Totals.kt`) — only the decimal separator changes for display, the
                    // digits are never re-derived/re-formatted here.
                    state.schedule.forEach { line ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                stringResource(R.string.calc_schedule_row, line.lengthKey.replace('.', ',')),
                                style = EtalonType.monoBody,
                            )
                            // formatDecimal groups thousands the same way CountText's formatCount
                            // does for the total-blocks row below — a bare `%1$s` with the raw Int
                            // (the previous code) bypasses that grouping entirely.
                            Text(
                                stringResource(R.string.calc_pieces, formatDecimal(BigDecimal.valueOf(line.beams.toLong()), 0)),
                                style = EtalonType.monoBody,
                            )
                        }
                    }
                    if (state.totals.blocks > 0) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(stringResource(R.string.calc_total_blocks), style = MaterialTheme.typography.labelLarge)
                            CountText(state.totals.blocks, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }

            actions()
        }
    }

    keypadField?.let { field ->
        val spec = when (field) {
            TotalsKeypadField.DISCOUNT_PERCENT -> KeypadSpec(
                stringResource(R.string.calc_discount_percent),
                formatDecimal(BigDecimal.valueOf(state.discountPercent), 2),
                "%", allowDecimal = true,
            )
            TotalsKeypadField.DISCOUNT_AMOUNT -> KeypadSpec(
                stringResource(R.string.calc_discount_amount), state.discountAmount.toLong().toString(), "UZS", allowDecimal = false,
            )
            TotalsKeypadField.DELIVERY -> KeypadSpec(
                stringResource(R.string.calc_delivery_cost), state.deliveryCost.toLong().toString(), "UZS", allowDecimal = false,
            )
            TotalsKeypadField.OTHER -> KeypadSpec(
                stringResource(R.string.calc_other_cost), state.otherCost.toLong().toString(), "UZS", allowDecimal = false,
            )
        }
        NumericKeypadSheet(
            title = spec.title,
            initial = spec.initial,
            suffix = spec.suffix,
            allowDecimal = spec.allowDecimal,
            onConfirm = { text ->
                val value = parseKeypadValue(text)
                when (field) {
                    TotalsKeypadField.DISCOUNT_PERCENT -> vm.setDiscountPercent(value)
                    TotalsKeypadField.DISCOUNT_AMOUNT -> vm.setDiscountAmount(value)
                    TotalsKeypadField.DELIVERY -> vm.setDeliveryCost(value)
                    TotalsKeypadField.OTHER -> vm.setOtherCost(value)
                }
                keypadField = null
            },
            onDismiss = { keypadField = null },
        )
    }
}

/** What [NumericKeypadSheet] needs for one [TotalsKeypadField] — a plain holder so the `when`
 *  above builds one value per branch instead of three separate `val`s each. */
private data class KeypadSpec(val title: String, val initial: String, val suffix: String, val allowDecimal: Boolean)

/** A read-only label/value row — the same shape as `RoomExtras.kt`'s `ReadOnlyRow`, duplicated
 *  locally per this module's existing per-file convention for these small row helpers. */
@Composable
private fun LabelValueRow(label: String, value: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        value()
    }
}

/** A tappable label/value row that opens the modal keypad — the same shape as `RoomExtras.kt`'s
 *  `EditableValueRow`, duplicated locally per this module's existing per-file convention. No
 *  horizontal padding — unlike `RoomExtras.kt`'s copy, this row sits beside [LabelValueRow]'s
 *  (rooms subtotal, total weight), which has none either; the label/value text must start and end
 *  flush with them; only the touch target keeps its own vertical breathing room. */
@Composable
private fun EditableValueRow(label: String, valueText: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(valueText, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** How long a save confirmation stays on screen before it dismisses itself — long enough to read
 *  in front of a customer, short enough not to sit there through the operator's next action. */
private const val SAVE_MESSAGE_AUTO_DISMISS_MS = 2500L

/**
 * «Юбориш», «Буюртма бериш», «Лойиҳани сақлаш» and «Тозалаш», filling [TotalsSheet]'s own
 * `actions` slot — see that composable's KDoc for why the slot exists.
 *
 * [ShareQuoteButton] renders first and is the ONE action here not behind `!state.canWrite` —
 * showing a customer a price on a PNG is not writing an order, so it stays usable to a
 * quote-only operator the same way the rest of the calculator does. Everything below it — the
 * rejected-orders record, «Буюртма бериш», «Тозалаш», «Лойиҳани сақлаш» — commits or persists
 * something server-side and stays gated.
 *
 * «Буюртма бериш» is the primary of the gated group and the other two are secondary: this is the
 * action that commits the deal, and the quote-side actions are what lead up to it. It opens
 * [PlaceOrderSheet] rather than submitting on the spot — a delivery date is required, and it is
 * not on this screen.
 *
 * [state.rejectedOrders] renders ABOVE the gated group and is not part of this quote: it is the
 * record of a DIFFERENT one the server refused after it was queued, by which time the calculator
 * had been cleared. There is nowhere else in the app such an order could surface — it never
 * became an order, so no order screen lists it — so this is where the operator finds out.
 */
@Composable
fun CalculatorActions(state: CalculatorUiState, vm: CalculatorViewModel) {
    ShareQuoteButton(state)
    if (!state.canWrite) return
    var showPlaceSheet by remember { mutableStateOf(false) }

    LaunchedEffect(state.saveMessage) {
        if (state.saveMessage != null) {
            delay(SAVE_MESSAGE_AUTO_DISMISS_MS)
            vm.dismissSaveMessage()
        }
    }
    // A placement that succeeded or was queued closes the sheet: `clearAll` has already emptied
    // the quote behind it, so leaving it open would show the next customer's blank form as if it
    // were still the order just committed.
    LaunchedEffect(state.placedOrderId, state.saveMessage) {
        if (state.placedOrderId != null || state.saveMessage == QUEUED_MESSAGE) showPlaceSheet = false
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.rejectedOrders.forEach { rejected ->
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ErrorBanner(
                    stringResource(R.string.calc_rejected_row, rejected.clientName, rejected.message),
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    onClick = { vm.discardRejectedOrder(rejected.id) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.calc_rejected_dismiss)) }
            }
        }
        state.error?.let { ErrorBanner(it) }
        state.saveMessage?.let { NoticeBanner(it) }
        PrimaryButton(
            text = stringResource(R.string.calc_action_place_order),
            onClick = { showPlaceSheet = true },
            enabled = !state.saving && !state.placing,
            loading = state.placing,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SecondaryButton(
                text = stringResource(R.string.calc_action_clear), onClick = vm::clearAll,
                enabled = !state.saving && !state.placing, modifier = Modifier.weight(1f),
            )
            SecondaryButton(
                text = stringResource(R.string.calc_action_save), onClick = vm::saveDraft,
                enabled = !state.placing, loading = state.saving, modifier = Modifier.weight(1f),
            )
        }
    }

    if (showPlaceSheet) {
        PlaceOrderSheet(
            state = state,
            onDismiss = { showPlaceSheet = false },
            onPlace = vm::placeOrder,
            onQueue = vm::queuePlaceOrder,
        )
    }
}

/**
 * «Юбориш» — captures [QuoteCard] to a PNG and opens the system share sheet. Enabled once at
 * least one room has priced (an empty quote has nothing to hand over); NOT gated on
 * `state.canWrite` — see [CalculatorActions]'s own KDoc for why.
 *
 * [QuoteCard] is composed unconditionally through [ZeroSizeCapture], every recomposition, not
 * only while this sheet is dragged open — `BottomSheetScaffold` composes the WHOLE sheet content
 * regardless of the collapsed/expanded anchor (see [TotalsSheet]'s own KDoc), so the layer already
 * holds a fresh frame the moment the operator taps, whichever anchor the sheet is sitting at.
 */
@Composable
internal fun ShareQuoteButton(state: CalculatorUiState) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val layer = rememberGraphicsLayer()
    var sharing by remember { mutableStateOf(false) }
    var shareError by remember { mutableStateOf<String?>(null) }
    val subject = stringResource(R.string.calc_quote_share_subject)
    val failure = stringResource(R.string.calc_share_failed)

    ZeroSizeCapture {
        Box(Modifier.drawWithContent { layer.record { this@drawWithContent.drawContent() } }) {
            QuoteCard(state)
        }
    }

    shareError?.let { ErrorBanner(it) }
    SecondaryButton(
        text = stringResource(R.string.calc_action_share),
        onClick = {
            sharing = true
            shareError = null
            scope.launch {
                // A full cache partition is enough to make writeQuotePng throw, and this launch
                // has no parent to catch it: uncaught, it takes the process down and leaves the
                // button spinning forever on the way. `finally` is what puts the spinner down —
                // both on that failure and on the ordinary cancellation of leaving the screen.
                try {
                    val uri = writeQuotePng(context, layer.toImageBitmap())
                    context.startActivity(Intent.createChooser(shareQuoteIntent(uri, subject), null))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    shareError = failure
                } finally {
                    sharing = false
                }
            }
        },
        enabled = state.rows.any { it.result != null } && !sharing,
        loading = sharing,
        leading = Icons.Filled.Share,
    )
}
