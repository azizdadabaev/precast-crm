package uz.etalon.crm.feature.payments.record

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ConfirmGate
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.DriverPicker
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.FormFieldValue
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.feature.payments.queue.paymentMethodLabel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * `imagePrep` is not a parameter here, exactly like every logistics screen in Phase 1b: the route
 * gets it from [HiltRecordPaymentViewModel]'s own Hilt-injected `imagePrep` property instead of
 * standing up an `@EntryPoint` just to reach the graph.
 */
@Composable
fun RecordPaymentRoute(
    orderId: String,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltRecordPaymentViewModel = hiltViewModel<HiltRecordPaymentViewModel, HiltRecordPaymentViewModel.Factory>(
        creationCallback = { it.create(orderId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }

    var capturing by remember { mutableStateOf(false) }
    if (capturing) {
        PhotoCapture(
            imagePrep = vm.imagePrep,
            onPhoto = { vm.addReceipt(it); capturing = false },
            onCancel = { capturing = false },
        )
        return
    }

    RecordPaymentScreen(
        s = s,
        // Leaving once the row exists is not a cancel: the payment is recorded either way, and
        // the only thing still at stake is the receipts. The screen asks before calling this;
        // routing it through `finishWithoutReceipts` means the caller is told the payment
        // landed, instead of a plain back that reads as if nothing happened.
        onLeave = if (s.paymentId != null) vm::finishWithoutReceipts else onCancel,
        onSetAmountDigits = vm::setAmountDigits,
        onSetMethod = vm::setMethod,
        onSetSource = vm::setSource,
        onSetHandOverNow = vm::setHandOverNow,
        onSetDriverId = vm::setDriverId,
        onSetNotes = vm::setNotes,
        onSetPaidOn = vm::setPaidOn,
        onCaptureReceipt = { capturing = true },
        onRemoveReceipt = vm::removeReceipt,
        onSubmit = vm::submit,
        onFinishWithoutReceipts = vm::finishWithoutReceipts,
        onRetryLoad = vm::retryLoad,
    )
}

/**
 * §5.2's row for this screen: the figure in `amountLg` on its own white card, the method and the
 * source as `EtalonFilterChip`s, the receipts as a `PhotoStrip`, everything else stacked in one
 * [FormCard] — and the navy [ConfirmSheet] as the summary the operator agrees to before the money
 * is written (R3).
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the root is
 * a plain `Box`: it pads the status bar itself, the sticky bar is bottom-aligned inside it, and the
 * scrolling column reserves exactly what the bar covers — measured, not assumed, because the
 * auto-confirm note above the button grows a line at font scale 1,3.
 *
 * @param barVisible whether the sticky bar is drawn at all (ruling R13). It steps aside for the
 *   keyboard, as order detail's does: the app draws edge to edge, the root's [imePadding] is what
 *   shortens the screen, and a bottom-aligned bar would otherwise land on top of «Изоҳ» while it is
 *   being typed. Defaulted from the window and passed in only by the tests — Robolectric reports
 *   the ime inset as absent whatever is focused.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecordPaymentScreen(
    s: RecordPaymentUiState,
    onLeave: () -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSetMethod: (PaymentMethod) -> Unit,
    onSetSource: (PaymentSource) -> Unit,
    onSetHandOverNow: (Boolean) -> Unit,
    onSetDriverId: (String?) -> Unit,
    onSetNotes: (String) -> Unit,
    onSetPaidOn: (LocalDate?) -> Unit,
    onCaptureReceipt: () -> Unit,
    onRemoveReceipt: (Int) -> Unit,
    onSubmit: () -> Unit,
    onFinishWithoutReceipts: () -> Unit,
    onRetryLoad: () -> Unit,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    var showKeypad by remember { mutableStateOf(false) }
    var showDriverPicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var removeCandidate by remember { mutableStateOf<Int?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    var gateOpen by remember { mutableStateOf(false) }
    // What the bar actually covers, read back from its own layout: the scrim, the note, the button
    // and the nav-pill band the bar adds beneath itself. A constant would be wrong the moment the
    // note wraps or the two-button row replaces the single one.
    var barHeightPx by remember { mutableIntStateOf(0) }
    // The top bar's arrow is not the only way out: a swipe from the screen edge is how most
    // operators leave a screen, and once the payment row exists it must ask about the captured
    // receipts there too — otherwise the swipe silently drops them and reads as if nothing was
    // recorded at all. Disabled before the row exists, so the plain back still pops the stack.
    BackHandler(enabled = s.paymentId != null) { confirmLeave = true }
    val leave = { if (s.paymentId != null) confirmLeave = true else onLeave() }
    // A local file path is a Uri with no scheme, which Coil resolves as a file — the same
    // rendering path the queued photos on the order screen take once they have a server URL.
    val receiptRefs = s.receipts.map { PhotoRef(id = null, url = it.file.absolutePath) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }

    // `imePadding` on the root, not on the column: the bar is bottom-aligned inside this box rather
    // than laid out under the column, so padding the column alone would leave the bar behind the
    // keyboard. The whole screen shortens, and the focused field is scrolled into what is left.
    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
                horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                EtalonIconButton(
                    icon = EtalonIcons.ArrowLeft,
                    contentDescription = stringResource(DesignSystemR.string.ds_cd_back),
                    onClick = leave,
                    shape = EtalonShapes.md,
                )
                Text(
                    stringResource(R.string.record_payment_title),
                    style = EtalonType.headline,
                    color = EtalonColors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EtalonSpace.cardMargin)
                    .padding(top = EtalonSpace.sm, bottom = maxOf(barHeight, LocalNavPillInset.current)),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                if (s.isOffline) {
                    ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRetryLoad)
                } else {
                    s.loadErrorMessage?.let { ErrorBanner(it, onRetry = onRetryLoad) }
                }
                if (s.showNoRecordPermission) NoticeBanner(stringResource(R.string.no_record_permission))
                s.error?.let { ErrorBanner(it) }

                s.order?.let { o ->
                    Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
                        Text(
                            "${formatOrderNo(o.summary.orderNumber)} · ${o.summary.client.name}",
                            style = EtalonType.rowTitle,
                            color = EtalonColors.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            stringResource(R.string.record_remaining, formatMoney(o.remaining)),
                            style = EtalonType.meta, color = EtalonColors.ink2,
                        )
                        Text(
                            stringResource(R.string.record_cap, formatMoney(s.cap)),
                            style = EtalonType.meta, color = EtalonColors.ink2,
                        )
                        // Only worth explaining when the two figures actually differ — which is
                        // exactly when an operator would otherwise be surprised by the refusal.
                        if (s.cap < o.remaining) {
                            Text(
                                stringResource(R.string.record_cap_explained),
                                style = EtalonType.meta, color = EtalonColors.ink2,
                            )
                        }
                    }
                }

                // The figure IS the control: the card is the keypad's tap target, the same idiom
                // the approve sheet's hero uses one screen over.
                Column(
                    Modifier.fillMaxWidth()
                        .clip(EtalonShapes.xl)
                        .background(EtalonColors.surface)
                        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
                        .clickable(role = Role.Button) { showKeypad = true }
                        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
                    verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
                ) {
                    Text(
                        stringResource(R.string.record_amount_label),
                        style = EtalonType.labelSm, color = EtalonColors.ink2,
                    )
                    MoneyHeroText(s.amount, style = EtalonType.amountLg)
                    if (!s.overCap.isZero) {
                        Text(
                            stringResource(R.string.record_over_cap, formatMoney(s.overCap)),
                            style = EtalonType.label, color = EtalonColors.red,
                        )
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                    EtalonFilterChip(
                        label = "${stringResource(R.string.record_quick_full)} · ${formatMoney(s.cap)}",
                        selected = s.amountDigits == s.fullAmountDigits,
                        onClick = { onSetAmountDigits(s.fullAmountDigits) },
                    )
                    EtalonFilterChip(
                        label = stringResource(R.string.record_quick_half),
                        selected = s.amountDigits == s.halfAmountDigits,
                        onClick = { onSetAmountDigits(s.halfAmountDigits) },
                    )
                }

                FormCard {
                    FormField(stringResource(R.string.record_method_label)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                            METHODS.forEach { (method, label) ->
                                EtalonFilterChip(
                                    label = stringResource(label),
                                    selected = s.method == method,
                                    onClick = { onSetMethod(method) },
                                )
                            }
                        }
                    }
                    FormField(stringResource(R.string.record_source_label)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                            // «Ҳайдовчидан» is withheld without driver.view: the picker behind it
                            // can never be filled for that operator, so the chip would only lead to
                            // a validator asking for a driver they cannot choose.
                            SOURCES.filter { s.canSeeDrivers || it.first != PaymentSource.FROM_DRIVER_AT_DELIVERY }
                                .forEach { (source, label) ->
                                    EtalonFilterChip(
                                        label = stringResource(label),
                                        selected = s.source == source,
                                        onClick = { onSetSource(source) },
                                    )
                                }
                        }
                    }
                    // Only the driver-collected source has a driver, and there it is required —
                    // both mirror PaymentRecordSchema's refinements.
                    if (s.driverApplies) {
                        FormField(stringResource(R.string.record_driver_label)) {
                            PickerRow(
                                value = s.drivers.find { it.id == s.driverId }?.name,
                                placeholder = stringResource(DesignSystemR.string.driver_none),
                                onClick = { showDriverPicker = true },
                            )
                        }
                    }
                    // Bank/online has no physical hand-over, so the switch is not merely disabled.
                    if (s.handOverApplies) {
                        FormField(stringResource(R.string.record_hand_over)) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Switch(
                                    checked = s.handOverNow,
                                    onCheckedChange = onSetHandOverNow,
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
                        }
                    }
                    FormField(stringResource(R.string.record_paid_on_label)) {
                        PickerRow(
                            // Unset means «Бугун» — the day the server assumes when `paidOn` is
                            // absent — so it is the value, not a placeholder for a missing one.
                            value = s.paidOn?.let { formatDate(it.atStartOfDay(ZoneOffset.UTC).toInstant()) }
                                ?: stringResource(R.string.record_paid_on_today),
                            placeholder = null,
                            onClick = { showDatePicker = true },
                        )
                    }
                    FormField(stringResource(R.string.record_notes_label)) {
                        EtalonTextField(
                            value = s.notes,
                            onValueChange = onSetNotes,
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = false,
                            maxLines = 3,
                        )
                    }
                    FormField(stringResource(R.string.record_receipts_label), divider = false) {
                        Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                            PhotoStrip(
                                photos = receiptRefs,
                                onOpen = { lightboxAt = it },
                                onAdd = onCaptureReceipt,
                                onLongPress = { removeCandidate = it },
                            )
                            Text(
                                stringResource(R.string.record_receipt_hint),
                                style = EtalonType.meta, color = EtalonColors.ink2,
                            )
                        }
                    }
                }
            }
        }

        // Always composed so the box measures zero while the bar is away — that zero is what
        // «the keyboard does not have to fight the bar for the last field» means in layout terms.
        Box(
            Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height },
        ) {
            if (barVisible) {
                StickyActionBar {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
                        // Which of the two outcomes this will be is decided by the recorder's own
                        // permissions server-side. It sits in the bar, not at the foot of the
                        // scrolling column, because that is where it is off-screen at the one
                        // moment it matters: the tap.
                        Text(
                            stringResource(
                                if (s.canAutoConfirm) R.string.record_will_auto_confirm else R.string.record_will_be_pending,
                            ),
                            style = EtalonType.meta,
                            color = if (s.canAutoConfirm) EtalonColors.green else EtalonColors.ink2,
                            maxLines = NOTE_LINES,
                            overflow = TextOverflow.Ellipsis,
                        )
                        // Once the payment row exists the only thing left is the receipts, and the
                        // primary action changes meaning: it retries the upload, it never
                        // re-records — so it does not go through the summary gate either.
                        if (s.paymentId != null) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                                SecondaryButton(
                                    stringResource(R.string.action_finish_without_receipts),
                                    onClick = onFinishWithoutReceipts,
                                    modifier = Modifier.weight(1f),
                                )
                                PrimaryButton(
                                    text = stringResource(R.string.action_retry_receipts), onClick = onSubmit,
                                    modifier = Modifier.weight(1f), loading = s.submitting,
                                )
                            }
                        } else {
                            // Enabled on the PERMISSION alone. Binding it to the validator as well
                            // greyed the button out and took every message the validator produces
                            // with it: an over-long note or a missing driver left a dead button and
                            // nothing on screen saying why. A tap the validator would refuse goes
                            // straight to `submit()`, which writes the Uzbek reason into the banner
                            // above; only a tap that would actually go through opens the gate.
                            //
                            // `isOffline` is part of that question, not a separate one: `submit()`
                            // refuses on it BEFORE it validates, and a cached order sitting beside a
                            // failed fetch is a state this screen is built to be in — so a form the
                            // validator is perfectly happy with can still be unsendable. Opening the
                            // gate there asked the operator to confirm on the navy panel in front of
                            // the customer and then recorded nothing. `RecordGateTest` pins it.
                            PrimaryButton(
                                text = stringResource(R.string.action_record_payment),
                                onClick = {
                                    if (!s.isOffline && validateRecord(s) == null) gateOpen = true else onSubmit()
                                },
                                enabled = s.canRecord, loading = s.submitting,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.record_amount_label),
            initial = s.amountDigits,
            suffix = MONEY_SUFFIX,
            // Cash has no kopeks, and formatMoney rounds to whole: allowing decimals would let
            // the figure on screen differ from the one recorded, on the one screen where they
            // must be the same number.
            allowDecimal = false,
            onConfirm = { onSetAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
    }
    if (showDriverPicker) {
        DriverPicker(
            drivers = s.drivers, selected = s.driverId,
            onSelect = { onSetDriverId(it); showDriverPicker = false },
        )
    }
    if (showDatePicker) {
        // The picker is the only way to set a date, so bounding it here means an out-of-range
        // value cannot even be produced; validateRecord still refuses one, for a restored state.
        val bounds = remember(s.today) {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val d = LocalDate.ofEpochDay(utcTimeMillis.floorDiv(MILLIS_PER_DAY))
                    return !d.isAfter(s.today) && !d.isBefore(s.today.minusDays(MAX_BACKDATE_DAYS))
                }
            }
        }
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = s.paidOn?.toEpochDay()?.times(MILLIS_PER_DAY),
            selectableDates = bounds,
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { onSetPaidOn(LocalDate.ofEpochDay(it.floorDiv(MILLIS_PER_DAY))) }
                    showDatePicker = false
                }) {
                    Text(
                        stringResource(R.string.record_paid_on_done),
                        style = EtalonType.sectionTitle, color = EtalonColors.indigo,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { onSetPaidOn(null); showDatePicker = false }) {
                    Text(
                        stringResource(R.string.record_paid_on_use_today),
                        style = EtalonType.sectionTitle, color = EtalonColors.ink2,
                    )
                }
            },
            colors = DatePickerDefaults.colors(containerColor = EtalonColors.surface),
        ) {
            DatePicker(
                state = pickerState,
                // Ruling R12: both slots are given, as the calculator's date dialog gives them —
                // M3's own defaults are the ENGLISH «Select date» / «Selected date», and this UI
                // is Uzbek.
                title = {
                    Text(
                        stringResource(R.string.record_paid_on_label),
                        style = EtalonType.sectionTitle, color = EtalonColors.ink2,
                        modifier = Modifier.padding(start = EtalonSpace.xl, top = EtalonSpace.lg),
                    )
                },
                headline = {
                    val picked = pickerState.selectedDateMillis?.let { formatDate(Instant.ofEpochMilli(it)) }
                    Text(
                        picked ?: stringResource(R.string.record_paid_on_today),
                        style = EtalonType.headline,
                        color = if (picked != null) EtalonColors.ink else EtalonColors.ink3,
                        modifier = Modifier.padding(start = EtalonSpace.xl, bottom = EtalonSpace.md),
                    )
                },
                showModeToggle = false,
                colors = DatePickerDefaults.colors(
                    containerColor = EtalonColors.surface,
                    selectedDayContainerColor = EtalonColors.indigo,
                    todayDateBorderColor = EtalonColors.indigo,
                ),
            )
        }
    }
    lightboxAt?.let { at -> Lightbox(receiptRefs, at, onDismiss = { lightboxAt = null }) }
    removeCandidate?.let { index ->
        TokenAlert(
            title = stringResource(R.string.remove_receipt_title),
            message = stringResource(R.string.remove_receipt_message),
            confirmText = stringResource(R.string.action_remove),
            danger = true,
            onConfirm = { onRemoveReceipt(index); removeCandidate = null },
            onDismiss = { removeCandidate = null },
        )
    }
    if (confirmLeave) {
        TokenAlert(
            title = stringResource(R.string.leave_recorded_title),
            message = stringResource(R.string.leave_recorded_message),
            confirmText = stringResource(R.string.action_leave),
            onConfirm = { confirmLeave = false; onLeave() },
            onDismiss = { confirmLeave = false },
        )
    }

    // R3's summary gate. In a `Dialog` of its own, the way the approve sheet's gate is: a
    // full-screen scrim composed inside the column above would be laid out INSIDE the scroll.
    if (gateOpen) {
        ConfirmGate(onDismiss = { gateOpen = false }) {
            ConfirmSheet(
                caption = stringResource(R.string.record_summary_caption),
                amount = s.amount,
                meta = s.order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
                tiles = {
                    ConfirmTile(
                        stringResource(R.string.record_method_label),
                        stringResource(paymentMethodLabel(s.method)),
                        Modifier.weight(1f),
                    )
                    ConfirmTile(
                        stringResource(R.string.record_source_label),
                        // Read off the offers the form actually made rather than a second
                        // exhaustive table: `UNKNOWN` is never offered and has no wording, and a
                        // dash says so honestly instead of naming a source nobody chose.
                        SOURCES.firstOrNull { it.first == s.source }?.let { stringResource(it.second) } ?: UNKNOWN,
                        Modifier.weight(1f),
                    )
                },
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.action_record_payment),
                onDismiss = { gateOpen = false },
                // The gate closes and the screen behind it carries the outcome — the spinner while
                // the call is in flight, the reason if it fails. A refused record must land where
                // the fields that caused the refusal still are. That ordering is also why no
                // `confirmEnabled` is passed: the gate is never composed while a call is in flight,
                // so a guard on `submitting` here could only ever read true.
                onConfirm = { gateOpen = false; onSubmit() },
            )
        }
    }
}

/**
 * A [FormCard] value that opens a picker: the value at [FormFieldValue] with §3.4's 10 dp chevron
 * after it, held at D7's 48 dp. [placeholder] is drawn in ink3 when there is no value yet; a field
 * whose empty state IS a value (the payment date's «Бугун») passes null and its own wording.
 */
@Composable
private fun PickerRow(value: String?, placeholder: String?, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch).clickable(role = Role.Button, onClick = onClick),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(
        value ?: placeholder.orEmpty(),
        style = FormFieldValue,
        color = if (value != null) EtalonColors.ink else EtalonColors.ink3,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    EtalonIcon(EtalonIcons.ChevronDown, null, size = CHEVRON, tint = EtalonColors.ink3)
}

/**
 * The two plain questions this screen asks — dropping a captured receipt, leaving a recorded
 * payment. An [AlertDialog] rather than [ConfirmSheet], for the reason the sign-out warning gives:
 * that component is a money hero plus two figure tiles and has no shape for a question with no
 * amount in it. Dressed in the same tokens so it does not read as a stock one.
 */
@Composable
private fun TokenAlert(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    danger: Boolean = false,
) = AlertDialog(
    onDismissRequest = onDismiss,
    containerColor = EtalonColors.surface,
    shape = EtalonShapes.xl,
    title = { Text(title, style = EtalonType.titleSm, color = EtalonColors.ink) },
    text = { Text(message, style = EtalonType.body, color = EtalonColors.ink2) },
    confirmButton = {
        // The destructive one gets the red pill, as the sign-out warning's does; leaving a
        // recorded payment is not destructive and keeps the indigo.
        if (danger) {
            DangerButton(confirmText, onConfirm, compact = true)
        } else {
            PrimaryButton(confirmText, onConfirm, compact = true)
        }
    },
    dismissButton = {
        SecondaryButton(stringResource(DesignSystemR.string.ds_action_cancel), onDismiss, compact = true)
    },
)

/** `DatePickerState` speaks UTC epoch millis, `LocalDate` speaks days. */
private const val MILLIS_PER_DAY = 86_400_000L

/** The keypad's own unit label. The figures themselves carry it through `MoneyHeroText`. */
private const val MONEY_SUFFIX = "UZS"

/** Stands where a name is missing, the same dash the approve sheet uses. */
private const val UNKNOWN = "—"

/** «Тўлов эга тасдиғини кутади.» fits one line at 1,0 and wraps to two at 1,3; the bar measures
 *  itself either way, so this only stops a future reword from pushing the button off screen. */
private const val NOTE_LINES = 2

/** §3.4's chevron, the same 10 dp the calculator's date row carries. */
private val CHEVRON = EtalonSpace.rowGap

/** The methods in the order a form offers them — deliberately not the queue's `paymentMethodLabel`
 *  lookup, which is a `when` the compiler keeps exhaustive for rendering a stored value. */
private val METHODS = listOf(
    PaymentMethod.CASH to R.string.method_cash,
    PaymentMethod.BANK_TRANSFER to R.string.method_bank,
    PaymentMethod.CLICK to R.string.method_click,
    PaymentMethod.PAYME to R.string.method_payme,
    PaymentMethod.OTHER to R.string.method_other,
)

private val SOURCES = listOf(
    PaymentSource.IN_OFFICE_CASH to R.string.source_office_cash,
    PaymentSource.BANK_OR_ONLINE to R.string.source_bank_online,
    PaymentSource.FROM_DRIVER_AT_DELIVERY to R.string.source_from_driver,
)
