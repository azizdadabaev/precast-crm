package uz.etalon.crm.feature.payments.queue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.CustodyChain
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PaymentStatusChip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.paymentStatusTone
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.ui.format.formatDateTime
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** The three tabs, in the order the money moves through them. Each is a server-side status
 *  filter, so switching one re-fetches rather than filtering a cached list. */
private val TABS = listOf(
    PaymentStatus.PENDING_CONFIRMATION to DesignSystemR.string.payment_pending,
    PaymentStatus.CONFIRMED to DesignSystemR.string.payment_confirmed,
    PaymentStatus.REJECTED to DesignSystemR.string.payment_rejected,
)

/**
 * A top-level bottom-bar destination (Destination.PAYMENTS), so it carries no back arrow and no
 * app-bar title — exactly like `OrdersListRoute`, the other tab-level list in the app. The three
 * tabs name the screen; the navigation bar already carries the word «Тўловлар».
 */
@Composable
fun ConfirmQueueRoute(
    onOpenOrder: (String) -> Unit,
    vm: HiltConfirmQueueViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ConfirmQueueScreen(
        s = s,
        onOpenOrder = onOpenOrder,
        onRefresh = vm::refresh,
        onSetTab = vm::setTab,
        onApprove = vm::openApprove,
        onReject = vm::openReject,
        onCloseSheet = vm::closeSheet,
        onSetAmountDigits = vm::setAmountDigits,
        onSetAdjustmentNote = vm::setAdjustmentNote,
        onSetAction = vm::setAction,
        onSetNote = vm::setNote,
        onSetRejectReason = vm::setRejectReason,
        onSubmitApprove = vm::submitApprove,
        onSubmitReject = vm::submitReject,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmQueueScreen(
    s: ConfirmQueueUiState,
    onOpenOrder: (String) -> Unit,
    onRefresh: () -> Unit,
    onSetTab: (PaymentStatus) -> Unit,
    onApprove: (PaymentQueueItem) -> Unit,
    onReject: (PaymentQueueItem) -> Unit,
    onCloseSheet: () -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSetAdjustmentNote: (String) -> Unit,
    onSetAction: (DiscrepancyAction?) -> Unit,
    onSetNote: (String) -> Unit,
    onSetRejectReason: (String) -> Unit,
    onSubmitApprove: () -> Unit,
    onSubmitReject: () -> Unit,
) {
    Scaffold(
        topBar = {
            PrimaryTabRow(selectedTabIndex = TABS.indexOfFirst { it.first == s.tab }.coerceAtLeast(0)) {
                TABS.forEach { (status, label) ->
                    Tab(
                        selected = s.tab == status,
                        onClick = { onSetTab(status) },
                        text = { Text(stringResource(label), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        modifier = Modifier.height(48.dp),
                    )
                }
            }
        },
    ) { pad ->
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Confirm and reject are both online-only — neither route is withIdempotency
                // wrapped, so neither may be queued. The banner says so before the tap does.
                if (s.isOffline) {
                    item { ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRefresh) }
                } else {
                    val error = s.error
                    if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                }
                if (s.showNoConfirmPermission) item { NoticeBanner(stringResource(R.string.queue_no_confirm_permission)) }
                // Never beside an error banner and never while loading: an empty list there reads
                // as "no payments" when the truth is "couldn't check".
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.queue_empty)) }
                items(s.items, key = { it.id }) { item ->
                    QueueCard(
                        item = item,
                        // Approve and reject are shown only where they can act: the confirm route
                        // refuses any payment that is not still PENDING_CONFIRMATION.
                        actionable = s.canConfirm && item.status == PaymentStatus.PENDING_CONFIRMATION,
                        actionsDisabled = s.busy || s.isOffline,
                        onOpenOrder = { onOpenOrder(item.orderId) },
                        onApprove = { onApprove(item) },
                        onReject = { onReject(item) },
                    )
                }
            }
        }
    }

    val sheet = s.sheet
    if (sheet != null) {
        ConfirmSheet(
            sheet = sheet,
            submitting = s.busy,
            onDismiss = onCloseSheet,
            onSetAmountDigits = onSetAmountDigits,
            onSetAdjustmentNote = onSetAdjustmentNote,
            onSetAction = onSetAction,
            onSetNote = onSetNote,
            onSetRejectReason = onSetRejectReason,
            onSubmitApprove = onSubmitApprove,
            onSubmitReject = onSubmitReject,
        )
    }
}

/**
 * One payment awaiting a decision. Approve and Reject are buttons, never swipe actions: a swipe
 * that confirms money on a mis-grab is not recoverable from the phone.
 */
@Composable
private fun QueueCard(
    item: PaymentQueueItem,
    actionable: Boolean,
    actionsDisabled: Boolean,
    onOpenOrder: () -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    val ext = LocalEtalonColors.current
    StatusStripeCard(stripe = toneColor(paymentStatusTone(item.status)), onClick = onOpenOrder) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                item.orderNumber, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            PaymentStatusChip(item.status)
        }
        Text(
            item.clientName, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        MoneyText(item.amount, style = EtalonType.monoTitle, modifier = Modifier.padding(top = 6.dp))

        // Expected versus received, and only where the comparison means anything: a dispatch's
        // expectedCollection is what a DRIVER was sent to collect, so in-office cash and bank
        // transfers are never measured against it.
        val expected = item.expectedFromDriver
        if (expected != null) {
            Text(
                stringResource(R.string.queue_expected, formatMoney(expected)),
                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!item.shortfall.isZero) {
                Text(
                    stringResource(R.string.queue_shortfall, formatMoney(item.shortfall)),
                    style = EtalonType.monoBody, fontWeight = FontWeight.Bold, color = ext.danger,
                )
            }
        }
        // When it was recorded, unlabelled: the custody chain right below already says who did it.
        Text(
            formatDateTime(item.recordedAt),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        item.rejectionReason?.let {
            Text(
                stringResource(R.string.queue_rejection_reason, it),
                style = MaterialTheme.typography.bodySmall, color = ext.danger,
            )
        }
        CustodyChain(item.custody, modifier = Modifier.padding(top = 8.dp))
        if (actionable) {
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(
                    text = stringResource(DesignSystemR.string.action_confirm), onClick = onApprove,
                    enabled = !actionsDisabled, modifier = Modifier.weight(1f),
                )
                DangerButton(
                    text = stringResource(R.string.queue_action_reject), onClick = onReject,
                    enabled = !actionsDisabled, modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
