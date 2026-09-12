package uz.etalon.crm.feature.payments.queue

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.ConfirmGate
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

private val DISCREPANCY_OPTIONS = listOf(
    Triple(DiscrepancyAction.TRACK, R.string.discrepancy_action_track, R.string.discrepancy_action_track_hint),
    Triple(DiscrepancyAction.DISCOUNT, R.string.discrepancy_action_discount, R.string.discrepancy_action_discount_hint),
    Triple(DiscrepancyAction.WRITEOFF, R.string.discrepancy_action_writeoff, R.string.discrepancy_action_writeoff_hint),
)

/** §2's own sheet scrim — the navy at 55 %, the same figure [ConfirmSheet] and [Lightbox] draw. */
internal val SHEET_SCRIM = EtalonColors.navy.copy(alpha = 0.55f)

/** §2's form sheet: the 20/16 every restyled sheet in the app uses. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg

/** The selected option's check, the same 16 dp glyph `DriverPicker`'s selected row carries. */
private val CHECK = 16.dp

/** Stands where a name is missing, the same dash §3.6's «Қарз —» uses. */
private const val UNKNOWN = "—"

/**
 * Everything the owner decides an approval on, in one white sheet (ruling R3): the figure — which
 * may be adjusted — the note that adjustment requires, what to do about a shortfall, and the
 * receipts. The design system's navy [ConfirmSheet] is the shape for a confirmation with **nothing
 * to type**, so it cannot be this sheet; it is the GATE in front of the approval instead, opened by
 * «Тасдиқлаш» below.
 *
 * «Рад этиш» lives here rather than on the queue card. A rejection is as irreversible as an
 * approval, and the card offering it as a bare pill is what makes a mis-grab possible; reaching it
 * costs one deliberate tap through the same look at the figure and the proof.
 *
 * The keypad and the lightbox REPLACE this sheet rather than stacking on top of it: both are their
 * own window, and a second bottom sheet over an open one is not a shape this app uses anywhere.
 * Nothing is lost by the swap — every field lives in the ViewModel, not here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApproveSheet(
    sheet: ConfirmSheetState,
    submitting: Boolean,
    canConfirm: Boolean,
    isOffline: Boolean,
    onDismiss: () -> Unit,
    onReject: () -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSetAdjustmentNote: (String) -> Unit,
    onSetAction: (DiscrepancyAction?) -> Unit,
    onSetNote: (String) -> Unit,
    onSubmitApprove: () -> Unit,
) {
    var showKeypad by remember { mutableStateOf(false) }
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var gateOpen by remember { mutableStateOf(false) }
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
    // Straight to full height: at Material's half-screen anchor the shortfall block and the
    // «Рад этиш» / «Тасдиқлаш» pair sit below the fold, and the two decisions this sheet exists
    // for must not have to be dragged into view.
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { target -> target != SheetValue.Hidden || !submittingNow },
    )
    ModalBottomSheet(
        sheetState = sheetState,
        onDismissRequest = { if (!submittingNow) onDismiss() },
        containerColor = EtalonColors.surface,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            Text(stringResource(R.string.confirm_sheet_title), style = EtalonType.sectionTitle, color = EtalonColors.ink)
            Text(sheetMeta(sheet), style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)

            // The figure IS the control: tapping it opens the keypad. Labelled so the tap target
            // is not an unexplained number, and held at D7's 48 dp even though the hero is taller.
            Column(
                Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch).clickable { showKeypad = true },
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
            ) {
                Text(stringResource(R.string.record_amount_label), style = EtalonType.labelSm, color = EtalonColors.ink2)
                MoneyHeroText(sheet.amount, style = EtalonType.amountLg)
            }
            Text(
                stringResource(R.string.queue_recorded, formatMoney(sheet.item.amount)),
                style = EtalonType.meta, color = EtalonColors.ink2,
            )
            sheet.expected?.let {
                Text(
                    stringResource(R.string.queue_expected, formatMoney(it)),
                    style = EtalonType.meta, color = EtalonColors.ink2,
                )
            }

            // The route refuses an adjusted amount without a note, so the field appears the
            // moment the figure moves — not after the tap that would have been refused.
            if (sheet.amountChanged) {
                FormCard {
                    FormField(stringResource(R.string.confirm_adjustment_note_label), divider = false) {
                        EtalonTextField(
                            value = sheet.adjustmentNote,
                            onValueChange = onSetAdjustmentNote,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = stringResource(R.string.confirm_adjustment_note_hint),
                            singleLine = false,
                            maxLines = 3,
                        )
                    }
                }
            }

            // Only a driver-collected payment measured against a dispatch can be short, so this
            // whole block never appears for office cash or a bank transfer.
            if (sheet.hasShortfall) {
                Text(
                    stringResource(R.string.queue_shortfall, formatMoney(sheet.shortfall)),
                    style = EtalonType.label, color = EtalonColors.red,
                )
                FormCard {
                    FormField(stringResource(R.string.discrepancy_action_label)) {
                        Column(Modifier.fillMaxWidth()) {
                            DISCREPANCY_OPTIONS.forEach { (action, label, hint) ->
                                DiscrepancyOption(
                                    selected = sheet.action == action,
                                    label = stringResource(label),
                                    hint = stringResource(hint),
                                    onSelect = { onSetAction(action) },
                                )
                            }
                        }
                    }
                    FormField(stringResource(R.string.discrepancy_note_label), divider = false) {
                        EtalonTextField(
                            value = sheet.note,
                            onValueChange = onSetNote,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = stringResource(R.string.discrepancy_note_hint),
                            singleLine = false,
                            maxLines = 3,
                        )
                    }
                }
            }

            if (receipts.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                    Text(stringResource(R.string.confirm_receipts_label), style = EtalonType.labelSm, color = EtalonColors.ink2)
                    PhotoStrip(photos = receipts, onOpen = { lightboxAt = it })
                }
            }

            sheet.error?.let { ErrorBanner(it) }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                DangerButton(
                    text = stringResource(R.string.queue_action_reject), onClick = onReject,
                    enabled = !submitting, modifier = Modifier.weight(1f),
                )
                // `loading` alone, not `enabled = !submitting` beside it: `loading` already takes
                // the click away, and it is what keeps the indigo fill while the call is in
                // flight. Disabling it as well paints the lavender "you cannot do this" skin over
                // the action the owner has just taken — which is the one thing that must not
                // happen on a confirmation that IS going through.
                // The gate is a CONFIRMATION, and there is nothing to confirm while the sheet is
                // still missing something the route will refuse — a shortfall with no «Тафовут
                // амали» chosen, an adjusted figure with no note. Opening it there asked the owner
                // to approve, took the tap, and then showed a red banner on the sheet BEHIND the
                // gate they were looking at. So a blocked tap goes straight to the ViewModel,
                // which refuses it and writes the Uzbek reason into this sheet's own error banner,
                // beside the field that caused it. `blocker` is the same rule the ViewModel guards
                // with, read once — not a second copy of it.
                //
                // `blocker` is not the WHOLE of that rule, though: `guardedSheet` refuses on the
                // permission and on being offline BEFORE it looks at the blocker, and a sheet the
                // blocker is perfectly happy with can still be unsendable for either. The queue
                // behind this sheet is on screen from the cache while its fetch fails for want of
                // a network, so offline-with-a-complete-sheet is a state this screen is built to
                // be in. Opening the gate there asked the owner to approve on the navy panel and
                // then sent nothing. `ApproveGateTest` pins all three.
                PrimaryButton(
                    text = stringResource(DesignSystemR.string.action_confirm),
                    onClick = {
                        if (sheet.blocker == null && canConfirm && !isOffline) gateOpen = true
                        else onSubmitApprove()
                    },
                    loading = submitting, modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }

    // R3's final gate. In a `Dialog` of its own, the way `OutboxSheet`'s discard confirmation and
    // `Lightbox` are: the sheet above already occupies a window, and a full-screen scrim composed
    // inside its column would be laid out INSIDE the sheet rather than over it.
    if (gateOpen) {
        ConfirmGate(onDismiss = { gateOpen = false }) {
            ConfirmSheet(
                caption = stringResource(DesignSystemR.string.action_confirm),
                // The figure being confirmed, not the one that was recorded: an adjusted approval
                // must be gated on the number that will actually reach the order.
                amount = sheet.amount,
                meta = sheetMeta(sheet),
                tiles = {
                    ConfirmTile(
                        stringResource(R.string.record_method_label),
                        stringResource(paymentMethodLabel(sheet.item.method)),
                        Modifier.weight(1f),
                    )
                    ConfirmTile(
                        stringResource(R.string.confirm_tile_recorded_by),
                        sheet.item.custody.recordedBy ?: sheet.item.custody.collectedBy ?: UNKNOWN,
                        Modifier.weight(1f),
                    )
                },
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(DesignSystemR.string.action_confirm),
                onDismiss = { gateOpen = false },
                // The gate closes and the sheet behind it carries the outcome — the spinner while
                // the call is in flight, the reason if it fails. A refused approval must land
                // where the fields that caused the refusal still are.
                onConfirm = { gateOpen = false; onSubmitApprove() },
                confirmEnabled = !submitting,
            )
        }
    }
}

/** «№ 09−0003 · Yusupov & Sons» — the line both the sheet and its gate carry. */
private fun sheetMeta(sheet: ConfirmSheetState) =
    "${formatOrderNo(sheet.item.orderNumber)} · ${sheet.item.clientName}"

/**
 * A 48 dp option row, not a `RadioButton`: the owner is choosing how a shortfall is written off,
 * and the three options must be distinguishable and reachable with a thumb. §2's own selected-row
 * treatment, the same one [uz.etalon.crm.core.designsystem.components.DriverPicker] draws — a
 * `lavenderBg` fill and a check glyph, so the choice is never colour alone. `Role.RadioButton`
 * stays for TalkBack.
 */
@Composable
private fun DiscrepancyOption(selected: Boolean, label: String, hint: String, onSelect: () -> Unit) = Row(
    Modifier.fillMaxWidth()
        .heightIn(min = EtalonSpace.minTouch)
        .clip(EtalonShapes.lg)
        .background(if (selected) EtalonColors.lavenderBg else Color.Transparent)
        .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
        .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f)) {
        Text(label, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(hint, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (selected) {
        Spacer(Modifier.width(EtalonSpace.sm))
        EtalonIcon(EtalonIcons.Check, null, size = CHECK, tint = EtalonColors.indigo)
    }
}
