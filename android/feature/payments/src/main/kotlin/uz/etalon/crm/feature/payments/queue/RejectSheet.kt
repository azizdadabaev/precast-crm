package uz.etalon.crm.feature.payments.queue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * The second half of ruling R3. The design system's navy `ConfirmSheet` is the shape for a
 * confirmation with nothing to type, and a rejection MUST carry a reason — `PaymentRejectSchema`
 * refuses one shorter than three characters, and the reason is what the operator who recorded the
 * payment will read. So this stays a white sheet, wearing the same tokens [ApproveSheet] does.
 *
 * The figure is shown and never edited: a rejection adjusts nothing. It is [ConfirmSheetState.item]'s
 * recorded amount, not the sheet's editable one — reaching this sheet is a separate decision from
 * the approval, and a number the owner had started to correct must not appear to be what is being
 * refused.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RejectSheet(
    sheet: ConfirmSheetState,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSetRejectReason: (String) -> Unit,
    onSubmitReject: () -> Unit,
) {
    // The same guard the approve sheet carries, for the same reason: dismissing mid-flight would
    // drop the sheet the failure message is written into.
    val submittingNow by rememberUpdatedState(submitting)
    val sheetState = rememberModalBottomSheetState(
        // As on the approve sheet: at font scale 1,3 the reason field and «Рад этиш» are past
        // Material's half-screen anchor, and a rejection must not be reached by a drag.
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
                .padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.lg),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            Text(stringResource(R.string.reject_sheet_title), style = EtalonType.sectionTitle, color = EtalonColors.ink)
            Text(
                "${formatOrderNo(sheet.item.orderNumber)} · ${sheet.item.clientName}",
                style = EtalonType.meta, color = EtalonColors.ink2,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            MoneyHeroText(sheet.item.amount, style = EtalonType.amountLg)

            FormCard {
                FormField(stringResource(R.string.reject_reason_label), divider = false) {
                    EtalonTextField(
                        value = sheet.rejectReason,
                        onValueChange = onSetRejectReason,
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = stringResource(R.string.reject_reason_hint),
                        singleLine = false,
                        maxLines = 3,
                    )
                }
            }

            sheet.error?.let { ErrorBanner(it) }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                SecondaryButton(
                    stringResource(DesignSystemR.string.ds_action_cancel), onClick = onDismiss,
                    enabled = !submitting, modifier = Modifier.weight(1f),
                )
                // `loading` alone: it already takes the click away, and it is what keeps the red
                // fill while the call is in flight. See the same note on the approve sheet.
                DangerButton(
                    text = stringResource(R.string.queue_action_reject), onClick = onSubmitReject,
                    loading = submitting, modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }
}
