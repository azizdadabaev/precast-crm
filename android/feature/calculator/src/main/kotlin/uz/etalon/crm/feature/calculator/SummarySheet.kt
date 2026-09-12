package uz.etalon.crm.feature.calculator

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
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

/**
 * Under this much room INSIDE the sheet, the hero stops sharing a row with the material line and
 * takes the whole width, with «Жами» and the material line stacked above it.
 *
 * The sheet's inner width is the window less 52 dp ([SHEET_MARGIN_H] twice, [SHEET_PAD_H] twice):
 * 359 dp on the 411 dp phone §3.4 is drawn for, 308 dp on a 360 dp one. At 308 the material line
 * measures first (it carries no weight) and the 26 sp figure is left with less than it needs, so
 * «13 542 460» ellipsised and «UZS» — measured after it, into nothing at all — vanished from the
 * screen. The customer's PNG hits the same wall at its fixed 360 dp and already stacks for it
 * (`QuoteImage.QuoteTotal`); this is that arrangement, on the same grounds, applied only where
 * §3.4's own cannot fit.
 *
 * 330 dp sits between the two: §3.4's side-by-side row is what every phone from roughly 382 dp up
 * still shows, and `calculator_light` — recorded at 411 dp — is untouched.
 */
private val HERO_STACK_BELOW = 330.dp

/**
 * R7's hero figure, and the ONE definition of it: «13 542 460 UZS», 26/800 tabular then 12/600 at
 * 70 %, with the unit AFTER the number — the single place in this app that orders them that way
 * (everywhere else — `MoneyHeroText`, every KPI and confirm sheet — D8's «UZS 13 542 460» leads
 * with the unit). `amountLg` is the scale's 30/800; `label` is exactly 12/600.
 *
 * `internal`, and shared with `QuoteImage.kt`, because the PNG the customer is sent draws the very
 * same figure: two copies of these three numbers is two places for the card and the screen to
 * drift apart. Both call sites are the same hero, not two that happen to look alike.
 */
internal val HeroFigureStyle = EtalonType.amountLg.copy(fontSize = 26.sp)

/** @see HeroFigureStyle */
internal val HeroUnitStyle = EtalonType.label

/** That 70 %, applied to `onDark` rather than to `onDarkMuted` (which is already 72 %) — the unit
 *  is a quiet run of the same white the figure is set in, not a second muted colour.
 *  @see HeroFigureStyle */
internal const val HERO_UNIT_ALPHA = 0.7f
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
 *
 * @param barVisible whether the navy bar itself is drawn. It steps aside for the keyboard: the bar
 *   is fixed over the room list rather than laid out under it, so the list's `imePadding` cannot
 *   lift it, and a bar sitting BEHIND the keyboard covers the very room being typed into while
 *   showing a total the keystroke has already changed. The card's own footer carries that room's
 *   subtotal meanwhile. Only the bar goes: the three modals below stay composed, or focusing the
 *   place-order sheet's notes field would dismiss the sheet it was typed into.
 *
 *   Defaulted from the window and passed in only by the tests — Robolectric reports the ime inset
 *   as absent whatever is focused, so this is the only way the rule can be asserted at all.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SummarySheet(
    state: CalculatorUiState,
    vm: CalculatorViewModel,
    modifier: Modifier = Modifier,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    var showSettings by remember { mutableStateOf(false) }
    var showPlaceSheet by remember { mutableStateOf(false) }
    val share = rememberShareQuote(state)

    // A placement that succeeded or was queued closes the sheet: `clearAll` has already emptied the
    // quote behind it, so leaving it open would show the next customer's blank form as if it were
    // still the order just committed.
    LaunchedEffect(state.placedOrderId, state.saveMessage) {
        if (state.placedOrderId != null || state.saveMessage == QUEUED_MESSAGE) showPlaceSheet = false
    }

    AnimatedVisibility(
        visible = barVisible,
        modifier = modifier,
        enter = slideInVertically { it } + fadeIn(),
        exit = slideOutVertically { it } + fadeOut(),
    ) {
        Column(
            Modifier.fillMaxWidth()
                .padding(horizontal = SHEET_MARGIN_H)
                .padding(bottom = SHEET_MARGIN_BOTTOM)
                .clip(EtalonShapes.sheet)
                .background(EtalonColors.navy)
                .padding(start = SHEET_PAD_H, end = SHEET_PAD_H, top = SHEET_PAD_TOP, bottom = SHEET_PAD_BOTTOM),
        ) {
            // The hero and the material line share a row only while there is room for both — see
            // [HERO_STACK_BELOW]. `BoxWithConstraints` measures the sheet's own inner width rather
            // than asking the window how wide the phone is: it is this box the figure has to fit.
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val stacked = maxWidth < HERO_STACK_BELOW
                val caption: @Composable () -> Unit = {
                    Text(
                        stringResource(R.string.calc_summary_total),
                        style = EtalonType.tagPanel,
                        color = EtalonColors.onDarkMuted,
                        maxLines = 1,
                    )
                }
                if (stacked) {
                    Column(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                            caption()
                            MaterialLine(state, Modifier.weight(1f).padding(start = ACTION_GAP))
                        }
                        SummaryTotal(state.orderTotals.totalPriceMoney())
                    }
                } else {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                        Column(Modifier.weight(1f)) {
                            caption()
                            SummaryTotal(state.orderTotals.totalPriceMoney())
                        }
                        MaterialLine(state)
                    }
                }
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
                        enabled = !state.placing,
                        // A save in flight is «working», not «unavailable»: the pill keeps its
                        // navy2 fill and swaps the save glyph for the spinner, the way the primary
                        // button has always done. `enabled` is left to the OTHER blocker.
                        loading = state.saving,
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
                        // The sheet renders `state.error` itself, and a save that failed minutes
                        // ago belongs to the quote, not to the placement only now starting.
                        onClick = { vm.dismissError(); showPlaceSheet = true },
                        modifier = Modifier.weight(1f),
                        enabled = !state.saving && !state.placing,
                    )
                }
            }
        }
    }

    if (showSettings) SummarySettingsSheet(state = state, vm = vm, onDismiss = { showSettings = false })
    if (showPlaceSheet) {
        PlaceOrderSheet(
            state = state,
            // D10's three money fields are edited on that sheet and live on the ViewModel, so it
            // takes the ViewModel the way the ⋯ settings sheet beside it already does.
            vm = vm,
            onDismiss = { showPlaceSheet = false },
            onPlace = vm::placeOrder,
            onQueue = vm::queuePlaceOrder,
        )
    }
}

/**
 * The quote's grand total as `3a-calculator.png` draws it — [HeroFigureStyle] carries the rule and
 * the reasoning, and `QuoteImage`'s own total is the same hero on the customer's copy.
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
        Text(figure, style = HeroFigureStyle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            MONEY_UNIT,
            style = HeroUnitStyle,
            color = EtalonColors.onDark.copy(alpha = HERO_UNIT_ALPHA),
            maxLines = 1,
            modifier = Modifier.padding(start = CAPTION_GAP),
        )
    }
}

/**
 * The right column: «**81,99 м²** · 31 балка · 656 ғишт» over «~14 757 кг» (§3.4, whose own example
 * rounds the area down a hundredth — these are the three §7 fixtures as the engine prices them).
 *
 * The area leads the line in `onDark` at 700 while the counts stay muted — it is the figure an
 * operator reads back to the customer. It is the MONOLITH area, the slab actually poured, and NOT
 * the area the order is billed on: billing counts whole tiles at N × PITCH, so each room is billed
 * for a little more than it is poured (see `RoomLine.billedArea`, and `ORDER_KG_PER_M2` for the
 * weight that hangs off the same monolith figure). The counts are grouped but carry no «та»: the
 * noun after each one already says what is being counted, so `formatCount` (which appends «та»)
 * would read «31 та балка».
 */
@Composable
private fun MaterialLine(state: CalculatorUiState, modifier: Modifier = Modifier) {
    val area = formatArea(BigDecimal.valueOf(state.totals.monolithArea))
    val line = stringResource(
        R.string.calc_summary_line,
        area,
        formatDecimal(BigDecimal.valueOf(state.totals.beams.toLong()), 0),
        formatDecimal(BigDecimal.valueOf(state.totals.blocks.toLong()), 0),
    )
    Column(modifier, horizontalAlignment = Alignment.End) {
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
