package uz.etalon.crm.feature.payments.queue

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

private val DISCREPANCY_OPTIONS = listOf(
    Triple(DiscrepancyAction.TRACK, R.string.discrepancy_action_track, R.string.discrepancy_action_track_hint),
    Triple(DiscrepancyAction.DISCOUNT, R.string.discrepancy_action_discount, R.string.discrepancy_action_discount_hint),
    Triple(DiscrepancyAction.WRITEOFF, R.string.discrepancy_action_writeoff, R.string.discrepancy_action_writeoff_hint),
)

/**
 * The one gate in front of both irreversible decisions. Everything it collects mirrors what
 * `POST /api/payments/{id}/confirm` and `/reject` will actually read.
 *
 * The keypad and the lightbox REPLACE this sheet rather than stacking on top of it: both are
 * their own window, and a second bottom sheet over an open one is not a shape this app uses
 * anywhere. Nothing is lost by the swap — every field lives in the ViewModel, not here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmSheet(
    sheet: ConfirmSheetState,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSetAdjustmentNote: (String) -> Unit,
    onSetAction: (DiscrepancyAction?) -> Unit,
    onSetNote: (String) -> Unit,
    onSetRejectReason: (String) -> Unit,
    onSubmitApprove: () -> Unit,
    onSubmitReject: () -> Unit,
) {
    var showKeypad by remember { mutableStateOf(false) }
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    // The payment's own receipts AND the order's unlinked ones — bot-forwarded proof that arrived
    // before this row existed. The web's confirm dialog shows both in one strip; showing only the
    // first gives an owner less evidence on the phone than they would have at the desk.
    val receipts = sheet.item.allReceiptUrls.map { PhotoRef(id = null, url = it) }

    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.record_amount_label),
            initial = sheet.amountDigits,
            suffix = "UZS",
            // UZS cash has no kopeks, and formatMoney rounds to whole: a decimal here would let
            // the figure on screen differ from the one confirmed.
            allowDecimal = false,
            onConfirm = { onSetAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
        return
    }
    val at = lightboxAt
    if (at != null) {
        Lightbox(receipts, at, onDismiss = { lightboxAt = null })
        return
    }

    val ext = LocalEtalonColors.current
    val rejecting = sheet.mode == ConfirmMode.REJECT

    // A swipe, a scrim tap and a back press are the same decision the Cancel button is, so they
    // are held shut for the same reason: dismissing mid-flight drops the sheet the failure message
    // is written into, and the confirmation then appears to have done nothing — the wrong failure
    // mode on the one screen where the action cannot be taken back.
    //
    // Both halves are needed, and neither can leave the sheet hidden-but-composed. `hide()` and
    // `settle()` each consult confirmValueChange (SheetDefaults.kt), so vetoing Hidden stops the
    // swipe and the scrim tap before anything animates, and the scrim path never reaches
    // onDismissRequest at all. The back press is the exception — ModalBottomSheet calls
    // onDismissRequest unconditionally there — which is what the guard below catches.
    //
    // Nothing can strand the sheet: `submitting` is true only while a call is in flight, and both
    // outcomes clear it (success closes the sheet, failure re-renders it carrying the reason).
    val submittingNow by rememberUpdatedState(submitting)
    val sheetState = rememberModalBottomSheetState(
        confirmValueChange = { target -> target != SheetValue.Hidden || !submittingNow },
    )
    ModalBottomSheet(
        sheetState = sheetState,
        onDismissRequest = { if (!submittingNow) onDismiss() },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                stringResource(if (rejecting) R.string.reject_sheet_title else R.string.confirm_sheet_title),
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                "${sheet.item.orderNumber} · ${sheet.item.clientName}",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (rejecting) {
                // The recorded figure is shown, never edited: a rejection does not adjust anything.
                MoneyText(sheet.item.amount, style = EtalonType.monoTitle)
                OutlinedTextField(
                    value = sheet.rejectReason, onValueChange = onSetRejectReason,
                    label = { Text(stringResource(R.string.reject_reason_label)) },
                    placeholder = { Text(stringResource(R.string.reject_reason_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Column(
                    Modifier.fillMaxWidth().clickable { showKeypad = true },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    SectionLabel(stringResource(R.string.record_amount_label))
                    MoneyText(sheet.amount, style = EtalonType.monoDisplay)
                }
                Text(
                    stringResource(R.string.queue_recorded, formatMoney(sheet.item.amount)),
                    style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                sheet.expected?.let {
                    Text(
                        stringResource(R.string.queue_expected, formatMoney(it)),
                        style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // The route refuses an adjusted amount without a note, so the field appears the
                // moment the figure moves — not after the tap that would have been refused.
                if (sheet.amountChanged) {
                    OutlinedTextField(
                        value = sheet.adjustmentNote, onValueChange = onSetAdjustmentNote,
                        label = { Text(stringResource(R.string.confirm_adjustment_note_label)) },
                        placeholder = { Text(stringResource(R.string.confirm_adjustment_note_hint)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                // Only a driver-collected payment measured against a dispatch can be short, so
                // this whole block never appears for office cash or a bank transfer.
                if (sheet.hasShortfall) {
                    Text(
                        stringResource(R.string.queue_shortfall, formatMoney(sheet.shortfall)),
                        style = EtalonType.monoBody, fontWeight = FontWeight.Bold, color = ext.danger,
                    )
                    SectionLabel(stringResource(R.string.discrepancy_action_label))
                    DISCREPANCY_OPTIONS.forEach { (action, label, hint) ->
                        DiscrepancyOption(
                            selected = sheet.action == action,
                            label = stringResource(label),
                            hint = stringResource(hint),
                            onSelect = { onSetAction(action) },
                        )
                    }
                    OutlinedTextField(
                        value = sheet.note, onValueChange = onSetNote,
                        label = { Text(stringResource(R.string.discrepancy_note_label)) },
                        placeholder = { Text(stringResource(R.string.discrepancy_note_hint)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (receipts.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectionLabel(stringResource(R.string.confirm_receipts_label))
                        PhotoStrip(photos = receipts, onOpen = { lightboxAt = it })
                    }
                }
            }

            sheet.error?.let { ErrorBanner(it) }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton(
                    stringResource(DesignSystemR.string.action_cancel), onClick = onDismiss,
                    enabled = !submitting, modifier = Modifier.weight(1f),
                )
                if (rejecting) {
                    DangerButton(
                        text = stringResource(R.string.queue_action_reject), onClick = onSubmitReject,
                        enabled = !submitting, loading = submitting, modifier = Modifier.weight(1f),
                    )
                } else {
                    PrimaryButton(
                        text = stringResource(DesignSystemR.string.action_confirm), onClick = onSubmitApprove,
                        enabled = !submitting, loading = submitting, modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** A 48 dp radio row, not a bare RadioButton: the owner is choosing how a shortfall is written
 *  off, and the three options must be distinguishable and reachable with a thumb. */
@Composable
private fun DiscrepancyOption(selected: Boolean, label: String, hint: String, onSelect: () -> Unit) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.medium
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else ext.border, shape)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
