package uz.etalon.crm.feature.payments.queue

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.CustodyChain
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonToast
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PaymentStatusTag
import uz.etalon.crm.core.designsystem.components.SegmentItem
import uz.etalon.crm.core.designsystem.components.SegmentedControl
import uz.etalon.crm.core.designsystem.components.TOAST_DURATION_MS
import uz.etalon.crm.core.designsystem.components.TonalButton
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatScheduleDate
import uz.etalon.crm.feature.payments.R
import java.time.Instant
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** The three tabs, in the order the money moves through them. Each is a server-side status
 *  filter, so switching one re-fetches rather than filtering a cached list. */
private val TABS = listOf(
    PaymentStatus.PENDING_CONFIRMATION to DesignSystemR.string.payment_pending,
    PaymentStatus.CONFIRMED to DesignSystemR.string.payment_confirmed,
    PaymentStatus.REJECTED to DesignSystemR.string.payment_rejected,
)

/** §2's list-row avatar, the same 36 dp `OrderRow` draws. */
private val AVATAR = 36.dp

/**
 * The method, worded. Its own table rather than a shared one: the record screen's `METHODS` is a
 * list of *offers* in the order a form presents them, and this is a lookup — a `when` that the
 * compiler makes exhaustive is what keeps a new [PaymentMethod] from silently rendering blank.
 */
internal fun paymentMethodLabel(method: PaymentMethod): Int = when (method) {
    PaymentMethod.CASH -> R.string.method_cash
    PaymentMethod.BANK_TRANSFER -> R.string.method_bank
    PaymentMethod.CLICK -> R.string.method_click
    PaymentMethod.PAYME -> R.string.method_payme
    PaymentMethod.OTHER, PaymentMethod.UNKNOWN -> R.string.method_other
}

/**
 * A top-level bottom-bar destination (Destination.PAYMENTS).
 *
 * @param onOpenDiscrepancies null for an operator without `discrepancy.view` — R9's header pill
 *   is then absent entirely, rather than opening a route the nav host never registered.
 */
@Composable
fun ConfirmQueueRoute(
    onOpenOrder: (String) -> Unit,
    onOpenDiscrepancies: (() -> Unit)?,
    vm: HiltConfirmQueueViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ConfirmQueueScreen(
        s = s,
        // Read once per composition of the route, exactly as `HomeRoute` reads it: a screen that
        // called `Instant.now()` inside itself could not be photographed against a fixed clock.
        now = Instant.now(),
        onOpenOrder = onOpenOrder,
        onOpenDiscrepancies = onOpenDiscrepancies,
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
        onToastShown = vm::clearToast,
    )
}

/**
 * `2b-payments.png`, top to bottom: «Тўловлар» over «Ходимлар қайд қилган тўловларни тасдиқлаш»,
 * the full-width navy Кутилмоқда/Тасдиқланган/Рад этилган switch carrying its counts (R7), and one
 * white card per payment — avatar, client, `№ · метод · ходим · сана`, the amount, and the one
 * «Кўриб чиқиш» pill a pending row offers.
 *
 * The shell does not wrap the tabs in a `Scaffold`, so the screen applies [statusBarsPadding]
 * itself; the list's bottom is [navPillContentPadding], which is what the floating nav pill needs
 * to scroll clear. There is no sticky bar and no text field on this screen, so no `imePadding` —
 * the two sheets are M3 `ModalBottomSheet`s, which pad themselves for the keyboard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmQueueScreen(
    s: ConfirmQueueUiState,
    now: Instant,
    onOpenOrder: (String) -> Unit,
    onOpenDiscrepancies: (() -> Unit)?,
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
    onToastShown: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
                verticalAlignment = Alignment.Bottom,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.payments_title),
                        style = EtalonType.displayTitle,
                        color = EtalonColors.ink,
                    )
                    Text(
                        stringResource(R.string.payments_subtitle),
                        style = EtalonType.body,
                        color = EtalonColors.ink2,
                        // Two lines: beside the pill on a 360 dp phone the sentence no longer
                        // fits one, and it is the only thing that says what this queue is for.
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                // R9: the second door into the discrepancies list, drawn only when there is
                // something behind it and the operator may open it.
                if (onOpenDiscrepancies != null && s.openDiscrepancies > 0) {
                    Spacer(Modifier.width(EtalonSpace.sm))
                    TonalButton(
                        stringResource(
                            R.string.payments_discrepancies_pill,
                            formatCountBare(s.openDiscrepancies),
                        ),
                        onOpenDiscrepancies,
                    )
                }
            }
            SegmentedControl(
                items = TABS.map { (status, label) ->
                    SegmentItem(stringResource(label), s.counts?.let { tabCountOf(it, status) })
                },
                selectedIndex = TABS.indexOfFirst { it.first == s.tab }.coerceAtLeast(0),
                onSelect = { onSetTab(TABS[it].first) },
                modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                onNavy = false,
                fill = true,
            )
            // Confirm and reject are both online-only — neither route is withIdempotency
            // wrapped, so neither may be queued. The banner says so before the tap does.
            val banner = Modifier.padding(horizontal = EtalonSpace.cardMargin).padding(top = EtalonSpace.sm)
            if (s.isOffline) {
                ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRefresh, modifier = banner)
            } else {
                s.error?.let { ErrorBanner(it, onRetry = onRefresh, modifier = banner) }
            }
            if (s.showNoConfirmPermission) {
                NoticeBanner(stringResource(R.string.queue_no_confirm_permission), modifier = banner)
            }
            PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = navPillContentPadding(
                        start = EtalonSpace.cardMargin, top = EtalonSpace.sm, end = EtalonSpace.cardMargin,
                    ),
                    verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
                ) {
                    // Never beside an error banner and never while loading: an empty list there
                    // reads as "no payments" when the truth is "couldn't check".
                    if (s.showEmptyState) item { EmptyState(stringResource(R.string.queue_empty)) }
                    items(s.items, key = { it.id }) { item ->
                        PaymentCard(
                            item = item,
                            // The pill is shown only where it can act: the confirm route refuses
                            // any payment that is not still PENDING_CONFIRMATION, and an
                            // ACCOUNTANT without payment.confirm reads the queue without acting.
                            reviewable = s.canConfirm && item.status == PaymentStatus.PENDING_CONFIRMATION,
                            reviewEnabled = !s.busy && !s.isOffline,
                            now = now,
                            onOpenOrder = { onOpenOrder(item.orderId) },
                            onReview = { onApprove(item) },
                        )
                    }
                    // The route caps its rows while the tab counts are uncapped, so the figure on
                    // the pill can be larger than the list under it. Said at the bottom, which is
                    // exactly where an owner who has scrolled to the end would otherwise read the
                    // last row as the oldest payment there is.
                    if (s.showTruncatedNotice) {
                        item {
                            NoticeBanner(
                                stringResource(
                                    R.string.queue_truncated,
                                    formatCountBare(s.tabCount ?: 0),
                                    formatCountBare(s.items.size),
                                ),
                            )
                        }
                    }
                }
            }
        }

        // R8. The message is remembered rather than read straight off the state so the toast has
        // something to draw while it fades OUT — the state's own field is already null by then.
        var shown by remember { mutableStateOf("") }
        LaunchedEffect(s.toast) {
            val message = s.toast ?: return@LaunchedEffect
            shown = message
            delay(TOAST_DURATION_MS)
            onToastShown()
        }
        EtalonToast(shown, visible = s.toast != null, modifier = Modifier.align(Alignment.BottomCenter))
    }

    val sheet = s.sheet
    if (sheet != null) {
        when (sheet.mode) {
            ConfirmMode.APPROVE -> ApproveSheet(
                sheet = sheet,
                submitting = s.busy,
                canConfirm = s.canConfirm,
                isOffline = s.isOffline,
                onDismiss = onCloseSheet,
                onReject = { onReject(sheet.item) },
                onSetAmountDigits = onSetAmountDigits,
                onSetAdjustmentNote = onSetAdjustmentNote,
                onSetAction = onSetAction,
                onSetNote = onSetNote,
                onSubmitApprove = onSubmitApprove,
            )
            ConfirmMode.REJECT -> RejectSheet(
                sheet = sheet,
                submitting = s.busy,
                onDismiss = onCloseSheet,
                onSetRejectReason = onSetRejectReason,
                onSubmitReject = onSubmitReject,
            )
        }
    }
}

/**
 * One payment awaiting a decision, as `2b-payments.png` draws it: a white `xl` card with the
 * system's hairline, `[36 avatar | client + meta | amount over one action]`.
 *
 * The card carries ONE action, not the confirm/reject pair it used to. «Рад этиш» lives inside the
 * approve sheet, behind the same look at the receipts and the figure that an approval gets: a
 * rejection is irreversible, and offering it as a bare pill on a list row is what makes a mis-grab
 * possible. Tapping anywhere else on the card opens the order.
 *
 * The lines below the row appear only when they are true of this payment. They are what the web's
 * queue shows and what the owner decides on, so none of them is dropped for the capture's sake —
 * the capture simply has no payment that carries any.
 */
@Composable
private fun PaymentCard(
    item: PaymentQueueItem,
    reviewable: Boolean,
    reviewEnabled: Boolean,
    now: Instant,
    onOpenOrder: () -> Unit,
    onReview: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(EtalonShapes.xl)
            .background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            // The system's one "pressed on white", as SecondaryButton and the light OrderRow use.
            .background(if (pressed) EtalonColors.lavenderBg else Color.Transparent)
            .clickable(
                role = Role.Button,
                indication = etalonRipple(),
                interactionSource = interaction,
                onClick = onOpenOrder,
            )
            .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(item.clientName, size = AVATAR)
            Spacer(Modifier.width(EtalonSpace.rowGap))
            Column(Modifier.weight(1f)) {
                Text(
                    item.clientName,
                    style = EtalonType.rowTitle,
                    color = EtalonColors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    metaLine(item, now),
                    style = EtalonType.meta,
                    color = EtalonColors.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(EtalonSpace.sm))
            Column(horizontalAlignment = Alignment.End) {
                MoneyText(item.amount, style = EtalonType.rowAmount)
                Spacer(Modifier.height(EtalonSpace.xs))
                if (reviewable) {
                    TonalButton(stringResource(R.string.payments_review), onReview, enabled = reviewEnabled)
                } else {
                    PaymentStatusTag(item.status)
                }
            }
        }

        // Expected versus received, and only where the comparison means anything: a dispatch's
        // expectedCollection is what a DRIVER was sent to collect, so in-office cash and bank
        // transfers are never measured against it.
        val expected = item.expectedFromDriver
        if (expected != null) {
            Text(
                stringResource(R.string.queue_expected, formatMoney(expected)),
                style = EtalonType.meta,
                color = EtalonColors.ink2,
            )
            if (!item.shortfall.isZero) {
                Text(
                    stringResource(R.string.queue_shortfall, formatMoney(item.shortfall)),
                    style = EtalonType.label,
                    color = EtalonColors.red,
                )
            }
        }
        item.rejectionReason?.let {
            Text(stringResource(R.string.queue_rejection_reason, it), style = EtalonType.meta, color = EtalonColors.red)
        }
        // Only where the money actually changed hands. A chain of ONE stage is a single avatar
        // standing alone under the row, repeating the name the meta line has already given — which
        // is what every office payment in `2b-payments.png` would draw. Two or more stages is a
        // hand-off, and that is the thing the chain exists to show.
        if (item.custody.stages > 1) CustodyChain(item.custody)
    }
}

/** `№ 09−0003 · Нақд · Азиз Р. · 3 сен` — §3.5's meta line. The person is whoever the custody
 *  chain names first: an office payment was recorded by an operator, a driver's was collected
 *  before anybody recorded it. */
@Composable
private fun metaLine(item: PaymentQueueItem, now: Instant): String = listOfNotNull(
    formatOrderNo(item.orderNumber),
    stringResource(paymentMethodLabel(item.method)),
    item.custody.recordedBy ?: item.custody.collectedBy,
    formatScheduleDate(item.paidOn ?: item.recordedAt, now),
).joinToString(" · ")
