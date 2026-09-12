package uz.etalon.crm.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * What the app bar's bell opens (ruling R3): how much of this operator's own work is still
 * unsent. It states the count and nothing else — the outbox sends itself, and a "retry now"
 * button here would only duplicate what the sync worker already does on its own schedule.
 *
 * Below the count, the half of the queue that will NOT send itself (design D10, ruling R6): orders
 * the server refused outright while they sat there. Those are the operator's to read and dismiss —
 * they used to be a banner on the calculator, which is the wrong place for them, because by the
 * time a rejection lands the quote it came from was cleared hours ago and the operator may never
 * open the calculator again. Each row names the customer and carries the server's own sentence,
 * and «Тушунарли» is the only way one leaves the list — [onDiscard] deletes the row for good.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutboxSheet(
    pending: Int,
    rejected: List<RejectedOrder>,
    onDiscard: (String) -> Unit,
    onDismiss: () -> Unit,
) = ModalBottomSheet(
    onDismissRequest = onDismiss,
    containerColor = EtalonColors.surface,
    shape = EtalonShapes.sheetTop,
    dragHandle = null,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.lg)) {
        Text(stringResource(R.string.home_bell), style = EtalonType.sectionTitle, color = EtalonColors.ink)
        Spacer(Modifier.height(EtalonSpace.sm))
        Text(
            if (pending > 0) {
                pluralStringResource(DesignSystemR.plurals.outbox_pending, pending, pending)
            } else {
                stringResource(R.string.home_outbox_clear_data)
            },
            style = EtalonType.body,
            color = EtalonColors.ink2,
        )
        if (rejected.isNotEmpty()) {
            Spacer(Modifier.height(EtalonSpace.lg))
            Text(
                stringResource(R.string.home_outbox_rejected_title),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )
            rejected.forEach { row ->
                Box(
                    Modifier.padding(top = EtalonSpace.sm).fillMaxWidth()
                        .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
                )
                RejectedRow(row, onDiscard)
            }
        }
        Spacer(Modifier.height(EtalonSpace.lg))
        SecondaryButton(stringResource(R.string.home_close), onDismiss)
        Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
    }
}

/** One refused order: who it was for, why the server said no, and the one button that ends it.
 *  The reason is in `red` — it is a failure, not a status — and never truncated to one line: the
 *  server's sentence is the only explanation the operator will ever get. */
@Composable
private fun RejectedRow(row: RejectedOrder, onDiscard: (String) -> Unit) = Row(
    Modifier.fillMaxWidth().padding(top = EtalonSpace.sm),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f)) {
        Text(
            row.clientName.ifBlank { stringResource(R.string.home_outbox_rejected_no_client) },
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(row.message, style = EtalonType.meta, color = EtalonColors.red)
    }
    SecondaryButton(
        stringResource(R.string.home_outbox_rejected_ack),
        onClick = { onDiscard(row.id) },
        compact = true,
    )
}
