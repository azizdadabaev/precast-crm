package uz.etalon.crm.feature.calculator

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.designsystem.components.DarkButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.InverseButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatWeightKg
import java.math.BigDecimal

// ── §3.4 «SummarySheet», every size named ─────────────────────────
//
// «fixed bottom, margin 0/10/10, navy sheet radius 22, pad 14/16/12, gradient scrim above».
// The scrim and the fixed placement belong to `CalculatorScreen`, which owns the bottom of the
// window; everything from the navy fill inwards is here.

/** §3.4 SummarySheet: «margin 0/10/10» — 10 on each side. */
private val SHEET_MARGIN_H = 10.dp
/** §3.4 SummarySheet: «margin 0/10/10» — 10 below, so the sheet floats clear of the pill. */
private val SHEET_MARGIN_BOTTOM = 10.dp
/** §3.4 SummarySheet: «pad 14/16/12» — 16 on each side. */
private val SHEET_PAD_H = 16.dp
/** §3.4 SummarySheet: «pad 14/16/12» — 14 top. */
private val SHEET_PAD_TOP = 14.dp
/** §3.4 SummarySheet: «pad 14/16/12» — 12 bottom. */
private val SHEET_PAD_BOTTOM = 12.dp
/** §3.4 SummarySheet: «Action row (margin-top 12, gap 8)». */
private val ACTION_TOP = 12.dp
private val ACTION_GAP = 8.dp
/** The air between the figure and the material line — the two columns share one baseline band. */
private val CAPTION_GAP = 2.dp

/** §3.4 SummarySheet: the total, «26/800 tabular». `amountLg` is the scale's 30/800. */
private val TotalStyle = EtalonType.amountLg.copy(fontSize = 26.sp)
/** §3.4 SummarySheet: «`UZS` 12/600 70%» — `label` is exactly 12/600. */
private val TotalUnitStyle = EtalonType.label
/** That 70 %, applied to `onDark` rather than to `onDarkMuted` (which is already 72 %) — the unit
 *  is a quiet run of the same white the figure is set in, not a second muted colour. */
private const val UNIT_ALPHA = 0.7f
/** §3.4 SummarySheet: the right column is «11 ink3-on-dark, 1.5 line-height». */
private val MetaStyle = EtalonType.meta.copy(lineHeight = 1.5.em)

/**
 * The quote's bottom line, fixed above the room list (§3.4 «SummarySheet»): «Жами» over the grand
 * total, the material line on the right, and the four actions.
 *
 * The headline figure is [CalculatorUiState.orderTotals]' `totalPrice` — the order-PLACEMENT total
 * (delivery and other included) — NOT `totals.projTotal.total`. See `OrderTotals.kt`'s class doc
 * for why conflating the two is a defect.
 *
 * Takes [vm] directly, the way `TotalsSheet` did before it: this is a slot [CalculatorRoute] hands
 * to `CalculatorScreen`, which holds no ViewModel of its own. The three sheets it can open
 * ([SummarySettingsSheet], [PlaceOrderSheet] and the system share chooser) are hosted here for the
 * same reason — each needs the ViewModel, and none of them is part of the screen's own layout.
 *
 * Without `order.create` only «Юбориш» remains (§3.4's actions all commit something server-side;
 * showing a customer a price on a PNG does not — see [rememberShareQuote]).
 */
@Composable
fun SummarySheet(state: CalculatorUiState, vm: CalculatorViewModel, modifier: Modifier = Modifier) {
    var showSettings by remember { mutableStateOf(false) }
    var showPlaceSheet by remember { mutableStateOf(false) }
    val share = rememberShareQuote(state)

    // A placement that succeeded or was queued closes the sheet: `clearAll` has already emptied the
    // quote behind it, so leaving it open would show the next customer's blank form as if it were
    // still the order just committed.
    LaunchedEffect(state.placedOrderId, state.saveMessage) {
        if (state.placedOrderId != null || state.saveMessage == QUEUED_MESSAGE) showPlaceSheet = false
    }

    Column(
        modifier.fillMaxWidth()
            .padding(horizontal = SHEET_MARGIN_H)
            .padding(bottom = SHEET_MARGIN_BOTTOM)
            .clip(EtalonShapes.sheet)
            .background(EtalonColors.navy)
            .padding(start = SHEET_PAD_H, end = SHEET_PAD_H, top = SHEET_PAD_TOP, bottom = SHEET_PAD_BOTTOM),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.calc_summary_total),
                    style = EtalonType.tagPanel,
                    color = EtalonColors.onDarkMuted,
                    maxLines = 1,
                )
                SummaryTotal(state.orderTotals.totalPriceMoney())
            }
            MaterialLine(state)
        }

        share.error?.let { Box(Modifier.padding(top = ACTION_TOP)) { ErrorBanner(it) } }

        Row(
            Modifier.fillMaxWidth().padding(top = ACTION_TOP),
            horizontalArrangement = Arrangement.spacedBy(ACTION_GAP),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.canWrite) {
                val saveLabel = stringResource(R.string.calc_action_save)
                DarkButton(
                    onClick = vm::saveDraft,
                    modifier = Modifier.semantics { contentDescription = saveLabel },
                    enabled = !state.saving && !state.placing,
                    leadingIcon = EtalonIcons.Save,
                )
            }
            val shareLabel = stringResource(R.string.calc_action_share)
            DarkButton(
                onClick = share.onClick,
                modifier = Modifier.semantics { contentDescription = shareLabel },
                enabled = share.enabled,
                leadingIcon = EtalonIcons.Send,
            )
            if (state.canWrite) {
                val settingsLabel = stringResource(R.string.calc_action_settings)
                DarkButton(
                    onClick = { showSettings = true },
                    modifier = Modifier.semantics { contentDescription = settingsLabel },
                    leadingIcon = EtalonIcons.Ellipsis,
                )
                InverseButton(
                    text = stringResource(R.string.calc_action_place_order),
                    // The sheet renders `state.error` itself, and a save that failed minutes ago
                    // belongs to the quote, not to the placement only now starting.
                    onClick = { vm.dismissError(); showPlaceSheet = true },
                    modifier = Modifier.weight(1f),
                    enabled = !state.saving && !state.placing,
                )
            }
        }
    }

    if (showSettings) SummarySettingsSheet(state = state, vm = vm, onDismiss = { showSettings = false })
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
 * R7, and the ONE place in this app where the unit follows the figure: «13 542 460 UZS», two runs
 * in one row, 26/800 then 12/600 at 70 %, exactly as `3a-calculator.png` draws it. Everywhere else
 * — `MoneyHeroText`, every KPI and confirm sheet — D8's «UZS 13 542 460» leads with the unit.
 *
 * Two `Text`s are two announcements, so the row publishes the whole figure once and merges, the
 * way `MoneyHeroText` does.
 */
@Composable
private fun SummaryTotal(total: Money) {
    val figure = formatMoney(total)
    Row(
        Modifier.semantics(mergeDescendants = true) { contentDescription = "$figure $MONEY_UNIT" },
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(figure, style = TotalStyle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            MONEY_UNIT,
            style = TotalUnitStyle,
            color = EtalonColors.onDark.copy(alpha = UNIT_ALPHA),
            maxLines = 1,
            modifier = Modifier.padding(start = CAPTION_GAP),
        )
    }
}

/**
 * The right column: «**81,98 м²** · 31 балка · 656 ғишт» over «~14 757 кг» (§3.4).
 *
 * The area leads the line in `onDark` at 700 while the counts stay muted — it is the figure an
 * operator reads back to the customer, and the one the order is billed on. The counts are grouped
 * but carry no «та»: the noun after each one already says what is being counted, so `formatCount`
 * (which appends «та») would read «31 та балка».
 */
@Composable
private fun MaterialLine(state: CalculatorUiState) {
    val area = formatArea(BigDecimal.valueOf(state.totals.monolithArea))
    val line = stringResource(
        R.string.calc_summary_line,
        area,
        formatDecimal(BigDecimal.valueOf(state.totals.beams.toLong()), 0),
        formatDecimal(BigDecimal.valueOf(state.totals.blocks.toLong()), 0),
    )
    Column(horizontalAlignment = Alignment.End) {
        Text(
            buildAnnotatedString {
                // `calc_summary_line` opens with the area (`%1$s · …`), so the emphasised run is
                // its first `area.length` characters — asserted by SummarySheetScreenshotTest's
                // own reading of the same string rather than trusted blind.
                if (line.startsWith(area)) {
                    withStyle(SpanStyle(color = EtalonColors.onDark, fontWeight = FontWeight.W700)) { append(area) }
                    append(line.removePrefix(area))
                } else {
                    append(line)
                }
            },
            style = MetaStyle,
            color = EtalonColors.onDarkMuted,
            textAlign = TextAlign.End,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            stringResource(R.string.calc_summary_weight, formatWeightKg(state.totalWeightKg)),
            style = MetaStyle,
            color = EtalonColors.onDarkMuted,
            textAlign = TextAlign.End,
            maxLines = 1,
        )
    }
}

/** What [rememberShareQuote] hands the sheet: the tap, whether it is still working, and the one
 *  Uzbek sentence to show if the capture failed. */
internal data class ShareQuote(val onClick: () -> Unit, val enabled: Boolean, val error: String?)

/**
 * «Юбориш» — captures [QuoteCard] to a PNG and opens the system share sheet.
 *
 * A `remember*` rather than a button: §3.4 draws this action as one of the summary sheet's navy
 * icon pills, so the capture plumbing has to live apart from whatever draws it. [QuoteCard] is
 * composed here, unconditionally, through [ZeroSizeCapture] — the layer must already hold a fresh
 * frame the moment the operator taps.
 *
 * Enabled once at least one room has priced (an empty quote has nothing to hand over); NOT gated
 * on `order.create` — showing a customer a price on a PNG is not writing an order, so it stays
 * usable to a quote-only operator, the one action on this sheet that does.
 */
@Composable
internal fun rememberShareQuote(state: CalculatorUiState): ShareQuote {
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

    return ShareQuote(
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
        error = shareError,
    )
}
