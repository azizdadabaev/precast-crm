package uz.etalon.crm.feature.logistics.delivery

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.ConfirmGate
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.PhotoReviewCard
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.feature.logistics.RESULT_DWELL_MS
import uz.etalon.crm.feature.logistics.ResultTileGrid
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * `imagePrep` is not a parameter here, exactly like every logistics screen in this slice (see
 * [uz.etalon.crm.feature.logistics.loadtruck.LoadTruckRoute]): the route gets it from
 * [HiltDeliveryProofViewModel]'s own Hilt-injected `imagePrep` property instead of standing up
 * an `@EntryPoint` just to reach the graph.
 */
@Composable
fun DeliveryProofRoute(
    orderId: String,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltDeliveryProofViewModel = hiltViewModel<HiltDeliveryProofViewModel, HiltDeliveryProofViewModel.Factory>(
        creationCallback = { it.create(orderId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    // Ruling R5: the cash that was queued is shown, not flashed, before the route pops.
    LaunchedEffect(s.done) {
        if (s.done) {
            delay(RESULT_DWELL_MS)
            onDone()
        }
    }

    // Camera first: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(
            imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel,
            title = stringResource(R.string.delivery_proof_title),
        )
        return
    }

    DeliveryProofScreen(
        s = s,
        onBack = onCancel,
        onRetake = vm::retake,
        onSetAmountDigits = vm::setAmountDigits,
        onSetNoCashCollected = vm::setNoCashCollected,
        onSetNote = vm::setNote,
        onSetDriverReturned = vm::setDriverReturned,
        onSubmit = vm::submit,
    )
}

/**
 * §5.2's row for the delivery-proof screen, and ruling R4's money: the cash the driver is holding
 * is the hero on its own white card and the card IS the keypad's tap target — the same idiom
 * `RecordPaymentScreen` and the approve sheet use, so the figure on the one screen where a driver
 * counts notes in front of a customer is written exactly as it is everywhere else.
 *
 * The two switches and the note stack in one [FormCard]; the photo he just took reviews below it;
 * and the sticky «Етказилди» opens the navy [ConfirmSheet] gate rather than writing straight away.
 *
 * @param barVisible whether the sticky bar is drawn at all (ruling R13). It steps aside for the
 *   keyboard: the app draws edge to edge, the root's [imePadding] is what shortens the screen, and
 *   a bottom-aligned bar would otherwise land on top of «Изоҳ» while it is being typed. Defaulted
 *   from the window and passed in only by the tests — Robolectric reports the ime inset as absent
 *   whatever is focused.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeliveryProofScreen(
    s: DeliveryProofUiState,
    onBack: () -> Unit,
    onRetake: () -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSetNoCashCollected: (Boolean) -> Unit,
    onSetNote: (String) -> Unit,
    onSetDriverReturned: (Boolean) -> Unit,
    onSubmit: () -> Unit,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    var showKeypad by remember { mutableStateOf(false) }
    var gateOpen by remember { mutableStateOf(false) }
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }
    val photo = s.photo
    val settling = s.submitting || s.done

    // `imePadding` on the root, not on the column: the bar is bottom-aligned inside this box
    // rather than laid out under the column, so padding the column alone would leave the bar
    // behind the keyboard.
    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize()) {
            LogisticsHeader(
                title = stringResource(R.string.delivery_proof_title),
                meta = s.order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
                onBack = onBack,
            )
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EtalonSpace.cardMargin)
                    .padding(top = EtalonSpace.sm, bottom = maxOf(barHeight, LocalNavPillInset.current)),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                s.error?.let { ErrorBanner(it) }

                // The figure IS the control. Dimmed and inert while «Нақд олинмади» is on: the
                // amount is forced to zero then, and a keypad over a figure the switch owns would
                // only produce a contradiction the validator refuses.
                Column(
                    Modifier.fillMaxWidth()
                        .clip(EtalonShapes.xl)
                        .background(EtalonColors.surface)
                        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
                        .clickable(enabled = !s.noCashCollected, role = Role.Button) { showKeypad = true }
                        .alpha(if (s.noCashCollected) DIMMED else 1f)
                        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
                    verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
                ) {
                    Text(
                        stringResource(R.string.delivery_cash_label),
                        style = EtalonType.labelSm, color = EtalonColors.ink2,
                    )
                    MoneyHeroText(s.amount, style = EtalonType.amountLg)
                    Text(
                        stringResource(R.string.delivery_expected, formatMoney(s.expected)),
                        style = EtalonType.meta, color = EtalonColors.ink2,
                    )
                    // Both lines are suppressed while «Нақд олинмади» is on: the amount is forced
                    // to zero there, so a shortfall of the full expected sum sitting next to a
                    // switch saying nothing was collected is a contradiction, not a warning.
                    if (!s.noCashCollected && !s.shortfall.isZero) {
                        Text(
                            stringResource(R.string.delivery_shortfall, formatMoney(s.shortfall)),
                            style = EtalonType.label, color = EtalonColors.red,
                        )
                    }
                    // The fat-finger direction: an extra digit collects too much, not too little.
                    // Informational, like the shortfall line above it — never blocks submission.
                    if (!s.noCashCollected && !s.overCollected.isZero) {
                        Text(
                            stringResource(R.string.delivery_overcollected, formatMoney(s.overCollected)),
                            style = EtalonType.label, color = EtalonColors.red,
                        )
                    }
                }

                FormCard {
                    FormField(stringResource(R.string.delivery_no_cash)) {
                        TokenSwitch(s.noCashCollected, onSetNoCashCollected)
                    }
                    FormField(stringResource(R.string.delivery_driver_returned)) {
                        TokenSwitch(s.driverReturned, onSetDriverReturned)
                    }
                    // Always offered, not only under the switch: a partial collection is worth a
                    // sentence too, and the field disappearing under the operator's thumb the
                    // moment he turns the switch back off was how the note used to be lost.
                    // Required — and said so — only where the validator requires it.
                    FormField(
                        stringResource(
                            if (s.noCashCollected) R.string.delivery_no_cash_note else R.string.logistics_note_label,
                        ),
                        divider = false,
                    ) {
                        EtalonTextField(
                            value = s.note,
                            onValueChange = onSetNote,
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = false,
                            maxLines = NOTE_MAX_LINES,
                        )
                    }
                }

                if (photo != null) PhotoReviewCard(photo, onRetake)
            }
        }

        // Always composed so the box measures zero while the bar is away — that zero is what
        // «the keyboard does not have to fight the bar for the last field» means in layout terms.
        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            if (barVisible) {
                StickyActionBar {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                        if (settling) {
                            ResultTileGrid(
                                listOf(
                                    stringResource(R.string.delivery_cash_label) to formatMoney(s.amount),
                                    stringResource(R.string.logistics_tile_expected) to formatMoney(s.expected),
                                    stringResource(R.string.logistics_tile_photo) to "1",
                                    stringResource(R.string.logistics_tile_state) to
                                        stringResource(R.string.logistics_tile_queued),
                                ),
                            )
                        }
                        // The gate is a CONFIRMATION, so it only opens on a submit the ViewModel
                        // would accept. A tap it would refuse goes straight to `submit()`, which
                        // writes the Uzbek reason into the banner above — never to a navy panel
                        // the driver agrees to in front of the customer for nothing.
                        // `DeliveryProofGateTest` pins both directions.
                        PrimaryButton(
                            text = stringResource(R.string.action_mark_delivered),
                            onClick = { if (canSubmit(s)) gateOpen = true else onSubmit() },
                            loading = s.submitting,
                        )
                    }
                }
            }
        }
    }

    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.delivery_cash_label),
            initial = s.amountDigits.ifEmpty { s.expected.roundedWhole().toPlainString() },
            suffix = MONEY_SUFFIX,
            // Cash physically has no kopeks: whole UZS only, so the number this screen shows is
            // always exactly the number that goes on the wire — no comma-to-dot conversion to trust.
            allowDecimal = false,
            onConfirm = { onSetAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
    }

    // In a `Dialog` of its own, the way the approve sheet's and the record-payment gate are: a
    // full-screen scrim composed into the column above would be laid out INSIDE the scroll.
    if (gateOpen) {
        ConfirmGate(onDismiss = { gateOpen = false }) {
            ConfirmSheet(
                caption = stringResource(R.string.action_mark_delivered),
                amount = s.amount,
                meta = s.order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
                tiles = {
                    ConfirmTile(
                        stringResource(R.string.logistics_tile_expected),
                        formatMoney(s.expected),
                        Modifier.weight(1f),
                    )
                    // The second tile is the discrepancy, whichever way it runs; with none there
                    // is nothing to agree to beyond the figure already in the hero.
                    if (!s.shortfall.isZero) {
                        ConfirmTile(
                            stringResource(R.string.logistics_tile_shortfall),
                            formatMoney(s.shortfall),
                            Modifier.weight(1f),
                        )
                    } else if (!s.overCollected.isZero) {
                        ConfirmTile(
                            stringResource(R.string.logistics_tile_over),
                            formatMoney(s.overCollected),
                            Modifier.weight(1f),
                        )
                    }
                },
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.logistics_action_confirm),
                onDismiss = { gateOpen = false },
                // The gate closes and the screen behind it carries the outcome — the spinner while
                // the enqueue is in flight, the reason if it fails.
                onConfirm = { gateOpen = false; onSubmit() },
            )
        }
    }
}

/**
 * Exactly what [DeliveryProofViewModel.submit] checks before it queues anything: a photo, and cash
 * the route would accept. Read by the gate so it can never open on a submit that will be refused.
 */
internal fun canSubmit(s: DeliveryProofUiState): Boolean =
    s.photo != null &&
        !s.submitting &&
        validateDeliveryCash(
            DeliveryCash(
                amount = s.amount,
                noCashCollected = s.noCashCollected,
                note = s.note,
                driverReturned = s.driverReturned,
            ),
        ) == null

/** §2's switch in the system's palette — the same one the record-payment form's hand-over field
 *  carries, held at D7's 48 dp inside its [FormField] row. */
@Composable
private fun TokenSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
    verticalAlignment = Alignment.CenterVertically,
) {
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        colors = SwitchDefaults.colors(
            checkedThumbColor = EtalonColors.onDark,
            checkedTrackColor = EtalonColors.indigo,
            checkedBorderColor = EtalonColors.indigo,
            uncheckedThumbColor = EtalonColors.ink3,
            uncheckedTrackColor = EtalonColors.page,
            uncheckedBorderColor = EtalonColors.surfaceBorder,
        ),
    )
}

/** The keypad's own unit label. The figures themselves carry it through `MoneyHeroText`. */
private const val MONEY_SUFFIX = "UZS"

/** How far the hero card recedes while «Нақд олинмади» owns the amount. */
private const val DIMMED = 0.4f

/** «Сабабини ёзинг» is a sentence, not a word: three lines before it scrolls. */
private const val NOTE_MAX_LINES = 3
