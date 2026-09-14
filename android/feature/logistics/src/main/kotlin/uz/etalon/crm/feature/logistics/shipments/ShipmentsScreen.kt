package uz.etalon.crm.feature.logistics.shipments

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import uz.etalon.crm.core.designsystem.components.ConfirmGate
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.NavySheet
import uz.etalon.crm.core.designsystem.components.OutboxBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.StickyActionBarDefaults
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.TonalButton
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatScheduleDate
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.R
import java.time.Instant
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * The trucks of one order (ruling R2: this route stays per order, reached from the detail's
 * «Жўнатмалар» card and its action bar). The shell draws its floating nav pill over it and gives
 * it no `Scaffold`, so the screen pads the status bar itself and the list's bottom is
 * [navPillContentPadding] plus the bar's own height.
 */
@Composable
fun ShipmentsRoute(
    orderId: String, onLoadShipment: (String) -> Unit, onDispatch: (String) -> Unit, onBack: () -> Unit,
    vm: ShipmentsViewModel = hiltViewModel<ShipmentsViewModel, ShipmentsViewModel.Factory>(creationCallback = { it.create(orderId) }),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ShipmentsScreen(
        s = s,
        // Read once per composition of the route, exactly as `DiscrepanciesRoute` reads it: a
        // screen that called `Instant.now()` inside itself could not be photographed against a
        // fixed clock.
        now = Instant.now(),
        onLoadShipment = onLoadShipment,
        onDispatch = onDispatch,
        onBack = onBack,
        onAdd = vm::addShipment,
        onDelete = vm::deleteShipment,
        onDeliver = vm::deliverShipment,
        onRefresh = vm::refresh,
        onRetryUpload = vm::retryUpload,
        onCancelUpload = vm::cancelUpload,
    )
}

/**
 * §5.2's row for this screen: «NavySheet rows, StatusTag on navy». Top to bottom — the back arrow
 * beside «Жўнатмалар» and the order it belongs to, the banners, and one navy [NavySheet] carrying
 * the trucks as `2b-orders.png`'s own list rows: «Жўнатма N», the truck's state as a tag, the day
 * and who is driving it, and the one thing to do with it next as a [TonalButton] on navy.
 *
 * The title is the production «Жўнатмалар», not the mapping row's «Юклар»: the card and the action
 * button on the order detail that open this screen both say «Жўнатмалар», and a screen that renames
 * the thing on the way in reads as a different thing. Same reason the camera-first trio kept its
 * own titles in Task 2.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShipmentsScreen(
    s: ShipmentsUiState,
    now: Instant,
    onLoadShipment: (String) -> Unit,
    onDispatch: (String) -> Unit,
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onDelete: (String) -> Unit,
    onDeliver: (String) -> Unit,
    onRefresh: () -> Unit,
    onRetryUpload: (String) -> Unit = {},
    onCancelUpload: (String) -> Unit = {},
) {
    // Only one question can be on screen at a time, so both gates are held here rather than inside
    // the rows: a row that owned its own gate would keep it alive across a list recomposition.
    var deliverCandidate by remember { mutableStateOf<ShipmentLine?>(null) }
    var deleteCandidate by remember { mutableStateOf<ShipmentLine?>(null) }
    // Delete and deliver go straight to the network with no idempotency behind them; the ViewModel
    // refuses both offline, and this is the same guard read on the button so a gate never opens on
    // an action that will be refused.
    val actionsEnabled = !s.busy && !s.isOffline
    val order = s.order

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
            // The module's shared header, the same row the camera-first trio draws: a driver moving
            // between the load screen and this list must not find the way out somewhere else.
            LogisticsHeader(
                title = stringResource(R.string.shipments_title),
                meta = order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
                onBack = onBack,
            )

            val banner = Modifier.padding(horizontal = EtalonSpace.cardMargin).padding(bottom = EtalonSpace.sm)
            // The offline case IS a failed refresh, so it is the same banner with the same retry —
            // `resourceError` already carries the network message the ViewModel derives `isOffline`
            // from.
            s.resourceError?.let { ErrorBanner(it, onRetry = onRefresh, modifier = banner) }
            s.actionError?.let { ErrorBanner(it, modifier = banner) }
            // The ORDER's own queued photos — a whole-truck load, an extra photo, a delivery proof.
            // They have no row of their own on this screen, so the banner is the only place they
            // can be seen and acted on. A truck's own load speaks from its row instead, where the
            // retry names the lorry it belongs to rather than acting on whichever failed first.
            val orderUploads = s.pendingUploads.filter { it.shipmentId == null }
            val orderFailed = orderUploads.firstOrNull { it.failed }
            if (orderUploads.isNotEmpty()) {
                Box(banner) {
                    OutboxBanner(
                        pending = orderUploads.count { !it.failed },
                        failedMessage = orderFailed?.let { it.error ?: stringResource(R.string.logistics_upload_failed) },
                        onRetry = { orderFailed?.let { onRetryUpload(it.id) } },
                        onCancel = { orderFailed?.let { onCancelUpload(it.id) } },
                        // A retry or cancel while another request is in flight would be dropped
                        // silently by runAction — disabled says so instead.
                        enabled = !s.busy,
                    )
                }
            }

            NavySheet(
                title = stringResource(R.string.shipments_list_title),
                modifier = Modifier.weight(1f),
            ) {
                PullToRefreshBox(isRefreshing = s.isLoading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        // The sticky bar is drawn OVER this list rather than under it, so the
                        // clearance has to be spelled out: without it «Жўнатма қўшиш» covers the
                        // last truck on the order.
                        //
                        // `canCreateShipment`, NOT `canAddShipment`: the clearance must answer
                        // "is there a bar" and never "may it be tapped this instant", or the rows
                        // jump 88 dp down and back for the length of every request.
                        contentPadding = navPillContentPadding(
                            extraBottom = if (s.canCreateShipment) StickyActionBarDefaults.height else EtalonSpace.sm,
                        ),
                    ) {
                        // Never beside an error banner and never while loading: an empty list there
                        // reads as "no trucks" when the truth is "couldn't check" — the state that
                        // fooled an operator standing at a lorry with no signal.
                        if (s.showEmptyState) {
                            item {
                                Text(
                                    stringResource(R.string.shipments_empty),
                                    style = EtalonType.body, color = EtalonColors.onDarkMuted,
                                    modifier = Modifier.padding(EtalonSpace.lg),
                                )
                            }
                        }
                        items(s.shipments, key = { it.id }) { sh ->
                            val rejected = s.pendingUploads.firstOrNull { it.shipmentId == sh.id && it.failed }
                            ShipmentRow(
                                sh = sh,
                                now = now,
                                busy = s.busy,
                                queuedLoad = s.hasQueuedLoad(sh.id),
                                failedLoad = rejected != null,
                                // The server's own reason where it gave one — «Юборилмади» alone
                                // tells the operator nothing he can act on.
                                failedMessage = rejected?.error,
                                onLoad = { onLoadShipment(sh.id) },
                                onDispatch = { onDispatch(sh.id) },
                                onDeliver = { if (actionsEnabled) deliverCandidate = sh else onDeliver(sh.id) },
                                onDelete = { if (actionsEnabled) deleteCandidate = sh else onDelete(sh.id) },
                                onRetryUpload = { rejected?.let { onRetryUpload(it.id) } },
                                onCancelUpload = { rejected?.let { onCancelUpload(it.id) } },
                            )
                        }
                    }
                }
            }
        }

        // Mounted on the standing fact, disabled on the moment-to-moment one. A bar that unmounts
        // while its own request is in flight takes its spinner with it — the operator taps, the
        // only feedback vanishes, and the list underneath jumps by the bar's height twice.
        if (s.canCreateShipment) {
            Box(Modifier.align(Alignment.BottomCenter)) {
                StickyActionBar {
                    PrimaryButton(
                        text = stringResource(R.string.action_add_shipment),
                        onClick = onAdd,
                        enabled = s.canAddShipment,
                        loading = s.busy,
                    )
                }
            }
        }
    }

    // Both questions are the navy [ConfirmSheet] in a `Dialog` of its own, the way every gate in
    // the app is: a full-screen scrim composed into the column above would be laid out INSIDE the
    // list's own scroll.
    deliverCandidate?.let { sh ->
        ConfirmGate(onDismiss = { deliverCandidate = null }) {
            ConfirmSheet(
                caption = stringResource(R.string.action_deliver_shipment),
                // Not a decision about money: this row only says the lorry arrived. The cash it
                // was carrying is counted on the delivery-proof screen, where the driver is
                // holding it.
                amount = null,
                meta = shipmentMeta(sh, order),
                tiles = deliverTiles(sh),
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.logistics_action_confirm),
                onDismiss = { deliverCandidate = null },
                onConfirm = { deliverCandidate = null; onDeliver(sh.id) },
            )
        }
    }

    deleteCandidate?.let { sh ->
        ConfirmGate(onDismiss = { deleteCandidate = null }) {
            ConfirmSheet(
                caption = stringResource(R.string.shipment_delete_title),
                amount = null,
                meta = shipmentMeta(sh, order),
                tiles = null,
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.action_delete_shipment),
                onDismiss = { deleteCandidate = null },
                onConfirm = { deleteCandidate = null; onDelete(sh.id) },
            )
        }
    }
}

/** «Жўнатма 2 · № 09−0021» — the line both gates carry, so the operator can see WHICH lorry the
 *  question is about on a screen that may hold four of them. */
@Composable
private fun shipmentMeta(sh: ShipmentLine, order: OrderDetail?): String = listOfNotNull(
    stringResource(R.string.logistics_shipment_n, sh.number),
    order?.let { formatOrderNo(it.summary.orderNumber) },
).joinToString(" · ")

/** The two facts worth agreeing to before a lorry is signed for: who was driving it, and what went
 *  on it. A truck with neither known — the server has nothing to show — gets no tile row at all
 *  rather than two dashes. */
@Composable
private fun deliverTiles(sh: ShipmentLine): (@Composable RowScope.() -> Unit)? {
    val driver = sh.driverName
    val beams = sh.loadedBeams.values.sum()
    val blocks = sh.loadedBlocks ?: 0
    val loaded = if (beams > 0 || blocks > 0) stringResource(R.string.loaded_summary, beams, blocks) else null
    if (driver == null && loaded == null) return null
    return {
        if (driver != null) {
            ConfirmTile(stringResource(R.string.logistics_driver_label), driver, Modifier.weight(1f))
        }
        if (loaded != null) {
            ConfirmTile(stringResource(R.string.logistics_tile_loaded), loaded, Modifier.weight(1f))
        }
    }
}

/**
 * One truck as a navy list row: «Жўнатма N» over its state and the day it was loaded, and the one
 * thing to do with it next on the right.
 *
 * The trailing offer is the truck's own next step, and nothing else: PENDING is loaded, LOADED is
 * dispatched, DISPATCHED is signed for, DELIVERED is done and offers nothing. Loading and
 * dispatching only NAVIGATE (loading is itself queue-safe offline, per the module's rule), so
 * neither is gated on connectivity; delivering hits the network directly and is, via the gate the
 * caller opens.
 *
 * [queuedLoad] blocks loading for a different reason: the server has not seen the load yet, so the
 * truck still reads PENDING here, and loading again would queue a second row with its own
 * idempotency key which the server accepts and then refuses ("Shipment is already LOADED").
 * [failedLoad] is the same block with a different story — a row the server has already rejected is
 * not on its way anywhere, so labelling it «Юборилмоқда…» told the operator to keep waiting for
 * something that had stopped. Both states say so under the row, with the way out beside them.
 *
 * A long press on a truck nothing has been put on yet offers to delete it — the kept rule that
 * only a PENDING shipment may go. It is hidden rather than disabled elsewhere: a lorry that has
 * left cannot be un-sent, and a greyed «Ўчириш» on it is an answer to a question nobody may ask.
 * Deleting is blocked while a load is queued too; it would strand the photo in the outbox.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ShipmentRow(
    sh: ShipmentLine,
    now: Instant,
    busy: Boolean,
    queuedLoad: Boolean,
    failedLoad: Boolean,
    failedMessage: String?,
    onLoad: () -> Unit,
    onDispatch: () -> Unit,
    onDeliver: () -> Unit,
    onDelete: () -> Unit,
    onRetryUpload: () -> Unit,
    onCancelUpload: () -> Unit,
) {
    val unsentLoad = queuedLoad || failedLoad
    // `busy` disables rather than swallows: `runAction` returns early while another request is in
    // flight and writes nothing, so a live-looking button that does nothing at all was the worst
    // of the two — a dead control at least says so.
    val deletable = sh.status == ShipmentStatus.PENDING && !unsentLoad && !busy
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(EtalonShapes.lg)
            // §2: a navy row presses to indigo, exactly as OrderRow's does.
            .background(if (pressed && deletable) EtalonColors.indigo else Color.Transparent)
            .then(
                if (deletable) {
                    Modifier.combinedClickable(
                        role = Role.Button,
                        indication = etalonRipple(onDark = true),
                        interactionSource = interaction,
                        onLongClick = onDelete,
                        onClick = onLoad,
                    )
                } else {
                    Modifier
                },
            )
            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.logistics_shipment_n, sh.number),
                    style = EtalonType.rowTitle, color = EtalonColors.onDark,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(ROW_TITLE_GAP))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusTag(sh.status, TagSurface.ROW_ON_NAVY, short = true)
                    val meta = metaLine(sh, now)
                    if (meta.isNotEmpty()) {
                        Spacer(Modifier.width(TAG_GAP))
                        Text(
                            meta,
                            style = EtalonType.meta, color = EtalonColors.onDarkMuted,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            val trailing: Pair<Int, () -> Unit>? = when (sh.status) {
                ShipmentStatus.PENDING -> R.string.action_load_shipment to onLoad
                ShipmentStatus.LOADED -> R.string.action_dispatch_shipment to onDispatch
                ShipmentStatus.DISPATCHED -> R.string.action_deliver_shipment to onDeliver
                ShipmentStatus.DELIVERED, ShipmentStatus.UNKNOWN -> null
            }
            if (trailing != null) {
                Spacer(Modifier.width(EtalonSpace.rowGap))
                TonalButton(
                    text = stringResource(trailing.first),
                    onClick = trailing.second,
                    // Offline is NOT a term here — the deliver gate carries that refusal itself,
                    // and loading and dispatching only open the next screen. `busy` is, because
                    // the ViewModel would drop the tap in silence; and the load offer is withdrawn
                    // on top of that while its own photo is still unsent.
                    enabled = !busy && !(sh.status == ShipmentStatus.PENDING && unsentLoad),
                    onDark = true,
                )
            }
        }
        when {
            failedLoad -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    failedMessage ?: stringResource(R.string.logistics_upload_failed_short),
                    style = EtalonType.meta, color = EtalonColors.debtOnDark,
                    maxLines = FAILURE_LINES, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(EtalonSpace.sm))
                // Both are local-only, so connectivity is not a term — but `runAction` still
                // returns early while something else is in flight, so `busy` is.
                TonalButton(stringResource(R.string.logistics_upload_retry), onRetryUpload, enabled = !busy, onDark = true)
                Spacer(Modifier.width(EtalonSpace.xs))
                TonalButton(stringResource(R.string.logistics_upload_cancel), onCancelUpload, enabled = !busy, onDark = true)
            }
            queuedLoad -> Text(
                stringResource(R.string.logistics_upload_sending),
                style = EtalonType.meta, color = EtalonColors.onDarkMuted,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** `3 сен · Дилшод Раҳимов · 01 A 123 BC` — the day the truck was loaded, then who is taking it
 *  where. Each part is dropped where the server has nothing, so an untouched lorry shows no meta
 *  line at all rather than a row of separators. */
private fun metaLine(sh: ShipmentLine, now: Instant): String = listOfNotNull(
    sh.loadedAt?.let { formatScheduleDate(it, now) },
    sh.driverName,
    sh.truckIdentifier,
).joinToString(" · ")

/** Title to the tag row under it, the same 3 dp the navy `OrderRow` and the discrepancies row use. */
private val ROW_TITLE_GAP = 3.dp

/** Tag to the meta beside it. */
private val TAG_GAP = 6.dp

/** The server's refusal is a sentence, not a word: two lines beside the two buttons. */
private const val FAILURE_LINES = 2
