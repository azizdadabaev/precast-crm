package uz.etalon.crm.feature.payments.record

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DriverPicker
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.payments.R
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
) {
    var showKeypad by remember { mutableStateOf(false) }
    var showDriverPicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var removeCandidate by remember { mutableStateOf<Int?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    // The top bar's arrow is not the only way out: a swipe from the screen edge is how most
    // operators leave a screen, and once the payment row exists it must ask about the captured
    // receipts there too — otherwise the swipe silently drops them and reads as if nothing was
    // recorded at all. Disabled before the row exists, so the plain back still pops the stack.
    BackHandler(enabled = s.paymentId != null) { confirmLeave = true }
    val ext = LocalEtalonColors.current
    // A local file path is a Uri with no scheme, which Coil resolves as a file — the same
    // rendering path the queued photos on the order screen take once they have a server URL.
    val receiptRefs = s.receipts.map { PhotoRef(id = null, url = it.file.absolutePath) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.record_payment_title)) },
                navigationIcon = {
                    // The arrow is reachable exactly when an error banner is showing, which is
                    // when an operator is most likely to try again — so once the payment exists
                    // it asks rather than silently dropping the captured receipts.
                    IconButton(onClick = { if (s.paymentId != null) confirmLeave = true else onLeave() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        bottomBar = {
            // Which of the two outcomes this will be is decided by the recorder's own
            // permissions server-side. It sits here, not at the foot of the scrolling column,
            // because that is where it is off-screen at the one moment it matters: the tap.
            Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
                Text(
                    stringResource(if (s.canAutoConfirm) R.string.record_will_auto_confirm else R.string.record_will_be_pending),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (s.canAutoConfirm) ext.success else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                )
                StickyActionBar {
                    // Once the payment row exists the only thing left is the receipts, and the
                    // primary action changes meaning: it retries the upload, it never re-records.
                    if (s.paymentId != null) {
                        SecondaryButton(
                            stringResource(R.string.action_finish_without_receipts),
                            onClick = onFinishWithoutReceipts,
                            modifier = Modifier.weight(1f),
                        )
                        PrimaryButton(
                            text = stringResource(R.string.action_retry_receipts), onClick = onSubmit,
                            enabled = !s.submitting, loading = s.submitting, modifier = Modifier.weight(1f),
                        )
                    } else {
                        // Enabled whenever a tap can produce an answer — the same shape both
                        // sheets in this module use. Binding it to the validator instead greyed
                        // the button out and took every message the validator produces with it:
                        // an over-long note or a missing driver left a dead button and nothing
                        // on screen saying why. `submit()` writes the reason into the banner.
                        PrimaryButton(
                            text = stringResource(R.string.action_record_payment), onClick = onSubmit,
                            enabled = !s.submitting && s.canRecord, loading = s.submitting,
                        )
                    }
                }
            }
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (s.isOffline) {
                ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRetryLoad)
            } else {
                s.loadErrorMessage?.let { ErrorBanner(it, onRetry = onRetryLoad) }
            }
            if (!s.canRecord) ErrorBanner(stringResource(R.string.no_record_permission))
            s.error?.let { ErrorBanner(it) }

            s.order?.let { o ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("${o.summary.orderNumber} · ${o.summary.client.name}", style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.record_remaining, formatMoney(o.remaining)),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.record_cap, formatMoney(s.cap)),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // Only worth explaining when the two figures actually differ — which is
                    // exactly when an operator would otherwise be surprised by the refusal.
                    if (s.cap < o.remaining) {
                        Text(
                            stringResource(R.string.record_cap_explained),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Column(
                Modifier.fillMaxWidth().clickable { showKeypad = true },
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                SectionLabel(stringResource(R.string.record_amount_label))
                MoneyText(s.amount, style = EtalonType.monoDisplay)
                if (!s.overCap.isZero) {
                    Text(
                        stringResource(R.string.record_over_cap, formatMoney(s.overCap)),
                        style = MaterialTheme.typography.bodyMedium, color = ext.danger,
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChoiceChip(
                    label = "${stringResource(R.string.record_quick_full)} · ${formatMoney(s.cap)}",
                    selected = s.amountDigits == s.fullAmountDigits,
                    onClick = { onSetAmountDigits(s.fullAmountDigits) },
                )
                ChoiceChip(
                    label = stringResource(R.string.record_quick_half),
                    selected = s.amountDigits == s.halfAmountDigits,
                    onClick = { onSetAmountDigits(s.halfAmountDigits) },
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.record_method_label))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    METHODS.forEach { (method, label) ->
                        ChoiceChip(stringResource(label), s.method == method) { onSetMethod(method) }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.record_source_label))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SOURCES.forEach { (source, label) ->
                        ChoiceChip(stringResource(label), s.source == source) { onSetSource(source) }
                    }
                }
            }

            // Only the driver-collected source has a driver, and there it is required — both
            // mirror PaymentRecordSchema's refinements.
            if (s.driverApplies) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionLabel(stringResource(R.string.record_driver_label))
                    SecondaryButton(
                        text = s.drivers.find { it.id == s.driverId }?.name
                            ?: stringResource(DesignSystemR.string.driver_none),
                        onClick = { showDriverPicker = true },
                        leading = Icons.Filled.Person,
                    )
                }
            }
            // Bank/online has no physical hand-over, so the switch is not merely disabled there.
            if (s.handOverApplies) {
                Row(
                    Modifier.fillMaxWidth().height(48.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.record_hand_over))
                    Switch(checked = s.handOverNow, onCheckedChange = onSetHandOverNow)
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.record_paid_on_label))
                SecondaryButton(
                    text = s.paidOn?.let { formatDate(it.atStartOfDay(ZoneOffset.UTC).toInstant()) }
                        ?: stringResource(R.string.record_paid_on_today),
                    onClick = { showDatePicker = true },
                )
            }

            OutlinedTextField(
                value = s.notes, onValueChange = onSetNotes,
                label = { Text(stringResource(R.string.record_notes_label)) },
                modifier = Modifier.fillMaxWidth(),
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.record_receipts_label))
                PhotoStrip(
                    photos = receiptRefs,
                    onOpen = { lightboxAt = it },
                    onAdd = onCaptureReceipt,
                    onLongPress = { removeCandidate = it },
                )
                Text(
                    stringResource(R.string.record_receipt_hint),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

        }
    }

    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.record_amount_label),
            initial = s.amountDigits,
            suffix = "UZS",
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
                }) { Text(stringResource(R.string.record_paid_on_done)) }
            },
            dismissButton = {
                TextButton(onClick = { onSetPaidOn(null); showDatePicker = false }) {
                    Text(stringResource(R.string.record_paid_on_use_today))
                }
            },
        ) { DatePicker(pickerState) }
    }
    lightboxAt?.let { at -> Lightbox(receiptRefs, at, onDismiss = { lightboxAt = null }) }
    removeCandidate?.let { index ->
        AlertDialog(
            onDismissRequest = { removeCandidate = null },
            title = { Text(stringResource(R.string.remove_receipt_title)) },
            text = { Text(stringResource(R.string.remove_receipt_message)) },
            confirmButton = {
                TextButton(onClick = { onRemoveReceipt(index); removeCandidate = null }) {
                    Text(stringResource(R.string.action_remove))
                }
            },
            dismissButton = {
                TextButton(onClick = { removeCandidate = null }) { Text(stringResource(DesignSystemR.string.action_cancel)) }
            },
        )
    }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(stringResource(R.string.leave_recorded_title)) },
            text = { Text(stringResource(R.string.leave_recorded_message)) },
            confirmButton = {
                TextButton(onClick = { confirmLeave = false; onLeave() }) {
                    Text(stringResource(R.string.action_leave))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLeave = false }) { Text(stringResource(DesignSystemR.string.action_cancel)) }
            },
        )
    }
}

/** 48 dp, not the 32 dp a bare FilterChip measures: these are thumb targets on a truck bed. */
@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) =
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) }, modifier = Modifier.height(48.dp))

private const val MILLIS_PER_DAY = 86_400_000L

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
