package uz.etalon.crm.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** How tall the rejected list may grow before it scrolls instead — three rows of a two-line
 *  refusal, which is as much as fits over «Ёпиш» on the shortest phone the app supports. */
private val REJECTED_LIST_MAX = 260.dp

/**
 * What the app bar's bell opens (ruling R3): how much of this operator's own work is still
 * unsent. It states the count and nothing else — the outbox sends itself, and a "retry now"
 * button here would only duplicate what the sync worker already does on its own schedule.
 *
 * Below the count, the half of the queue that will NOT send itself (design D10, ruling R6): orders
 * the server refused outright while they sat there. Those are the operator's to deal with — they
 * used to be a banner on the calculator, which is the wrong place for them, because by the time a
 * rejection lands the quote it came from was cleared hours ago and the operator may never open the
 * calculator again. Each row names the customer and carries the server's own sentence.
 *
 * Ruling I3: a row offers TWO things. [onReopen] puts the refused order's own figures back into the
 * calculator to be corrected and placed again — the row holds the only copy of that quote, so this
 * is the action that keeps the work, and it is the primary one. [onDiscard] is the other: it ends
 * the quote along with the notice, so it asks first.
 *
 * @param onReopen null for an operator without `calculator.use` — there would be nowhere for the
 *   quote to open, and a button that cannot work is worse than one that is not there.
 * @param reopenError the Uzbek sentence when a re-open failed. The row stays where it is; nothing
 *   was deleted.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutboxSheet(
    pending: Int,
    rejected: List<RejectedOrder>,
    onDiscard: (String) -> Unit,
    onDismiss: () -> Unit,
    onReopen: ((String) -> Unit)? = null,
    reopenError: String? = null,
) {
    /** The row «Тушунарли» was tapped on, waiting for the confirmation. Held here rather than by
     *  the caller: the question belongs to this sheet, and the discard only leaves it once. */
    var discardCandidate by remember { mutableStateOf<RejectedOrder?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.lg)) {
            Text(stringResource(R.string.home_bell), style = EtalonType.sectionTitle, color = EtalonColors.ink)
            // «Юборилмаган маълумот йўқ» is hidden while rejections are listed: nothing is waiting
            // to send, but saying so above a list of orders that FAILED to send reads as a
            // contradiction. A pending count is different — it is a second fact, and it stays.
            if (pending > 0 || rejected.isEmpty()) {
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
            }
            if (rejected.isNotEmpty()) {
                Spacer(Modifier.height(EtalonSpace.lg))
                Text(
                    stringResource(R.string.home_outbox_rejected_title),
                    style = EtalonType.sectionTitle,
                    color = EtalonColors.ink,
                )
                if (reopenError != null) {
                    Spacer(Modifier.height(EtalonSpace.sm))
                    ErrorBanner(reopenError)
                }
                // The list scrolls inside its own band rather than growing the sheet: a dozen
                // refusals is an ordinary week after a bad connection, and every one of them off
                // the bottom edge would take «Ёпиш» — the only way out of this sheet — with them.
                Column(
                    Modifier.fillMaxWidth().heightIn(max = REJECTED_LIST_MAX).verticalScroll(rememberScrollState()),
                ) {
                    rejected.forEach { row ->
                        Box(
                            Modifier.padding(top = EtalonSpace.sm).fillMaxWidth()
                                .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
                        )
                        RejectedRow(row, onDiscard = { discardCandidate = row }, onReopen = onReopen)
                    }
                }
            }
            Spacer(Modifier.height(EtalonSpace.lg))
            SecondaryButton(stringResource(R.string.home_close), onDismiss)
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }

    // In a `Dialog` of its own, the way `Lightbox` is: this sheet already occupies a window, and a
    // confirmation composed inside its column would be laid out INSIDE the sheet rather than over
    // it — a question about deleting something must not be reachable only by scrolling.
    discardCandidate?.let { row ->
        Dialog(
            onDismissRequest = { discardCandidate = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            ConfirmSheet(
                caption = stringResource(R.string.home_outbox_discard_title),
                // Not a decision about money: the sheet leads with the question instead of a figure.
                amount = null,
                meta = row.clientName.ifBlank { stringResource(R.string.home_outbox_rejected_no_client) },
                tiles = null,
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.home_outbox_discard_confirm),
                onDismiss = { discardCandidate = null },
                onConfirm = {
                    onDiscard(row.id)
                    discardCandidate = null
                },
            )
        }
    }
}

/**
 * One refused order: who it was for, why the server said no, and the two things that can be done
 * about it. The reason is in `red` — it is a failure, not a status — and never truncated to one
 * line: the server's sentence is the only explanation the operator will ever get.
 *
 * «Калькуляторда очиш» is the PRIMARY action (ruling I3). This row holds the only copy of that
 * quote — the calculator was cleared when the order was queued, hours before the refusal landed —
 * so the first thing offered is the one that keeps the work: the order's own figures go back into
 * the calculator to be corrected and placed again. It is absent for an operator without
 * `calculator.use`: there would be nowhere for the quote to open.
 *
 * «Тушунарли» stays, and it is the destructive one — [onDiscard] ends the quote as well as the
 * notice — so the caller puts a confirmation in front of it.
 */
@Composable
private fun RejectedRow(
    row: RejectedOrder,
    onDiscard: (String) -> Unit,
    onReopen: ((String) -> Unit)?,
) = Column(Modifier.fillMaxWidth().padding(top = EtalonSpace.sm)) {
    Text(
        row.clientName.ifBlank { stringResource(R.string.home_outbox_rejected_no_client) },
        style = EtalonType.rowTitle,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Text(row.message, style = EtalonType.meta, color = EtalonColors.red)
    Spacer(Modifier.height(EtalonSpace.sm))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
        // With nothing to reopen into, «Тушунарли» keeps its own width at the end of the row —
        // one pill stretched across the sheet reads as the row's main business, which it is not.
        if (onReopen == null) Spacer(Modifier.weight(1f))
        SecondaryButton(
            stringResource(R.string.home_outbox_rejected_ack),
            onClick = { onDiscard(row.id) },
            // Sharing the width rather than sizing to their labels: «Калькуляторда очиш» is a long
            // one, and at font scale 1,3 two intrinsically-sized buttons run off the sheet.
            modifier = if (onReopen != null) Modifier.weight(1f) else Modifier,
            compact = true,
        )
        if (onReopen != null) {
            PrimaryButton(
                text = stringResource(R.string.home_outbox_open_in_calculator),
                onClick = { onReopen(row.id) },
                modifier = Modifier.weight(1f),
                compact = true,
            )
        }
    }
}
