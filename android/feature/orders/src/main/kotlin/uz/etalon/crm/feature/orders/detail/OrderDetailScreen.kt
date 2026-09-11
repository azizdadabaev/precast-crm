package uz.etalon.crm.feature.orders.detail

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DetailPanel
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.OutboxBanner
import uz.etalon.crm.core.designsystem.components.PanelTotal
import uz.etalon.crm.core.designsystem.components.PaymentStatusTag
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.ProgressCard
import uz.etalon.crm.core.designsystem.components.RoomTile
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.ShipmentStatusTag
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.StepTimeline
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.TimelineStep
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDateTime
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.orders.R
import java.math.RoundingMode
import kotlin.math.roundToInt

/** Adaptation: the brief's ViewModel reads `orderId` from a Nav `SavedStateHandle`. Nav 3's
 *  entryProvider hands the key to the entry instead, so this route takes `orderId` explicitly and
 *  resolves the ViewModel through an assisted-injection factory (`OrderDetailViewModel.Factory`).
 *  `me` comes down from the signed-in shell rather than being re-read from the session here — the
 *  shell already holds the authoritative identity for the whole back stack. */
@Composable
fun OrderDetailRoute(
    orderId: String,
    me: Me,
    onBack: () -> Unit,
    onLoadTruck: () -> Unit,
    onAddPhoto: () -> Unit,
    onDeliveryProof: () -> Unit,
    onOpenShipments: () -> Unit,
    onOpenLocation: () -> Unit,
    onRecordPayment: () -> Unit,
    vm: OrderDetailViewModel = hiltViewModel<OrderDetailViewModel, OrderDetailViewModel.Factory>(creationCallback = { it.create(orderId) }),
) {
    val r by vm.state.collectAsStateWithLifecycle()
    val pending by vm.pending.collectAsStateWithLifecycle()
    val actionError by vm.actionError.collectAsStateWithLifecycle()
    OrderDetailScreen(
        r = r, me = me, pending = pending, actionError = actionError,
        onBack = onBack, onRefresh = vm::refresh,
        onLoadTruck = onLoadTruck, onAddPhoto = onAddPhoto, onDeliveryProof = onDeliveryProof,
        onOpenShipments = onOpenShipments, onOpenLocation = onOpenLocation, onRecordPayment = onRecordPayment,
        onDeletePhoto = vm::deletePhoto, onRetryUpload = vm::retryUpload, onCancelUpload = vm::cancelUpload,
    )
}

/** The delivery proof is not part of the gallery the server hands back, so it is appended as a
 *  strip entry with no id — it is shown, never deleted from here. Guarded against the server one
 *  day listing it in the gallery too, which would otherwise show it twice. */
private fun stripPhotos(o: OrderDetail): List<PhotoRef> =
    o.loadedPhotos.map { PhotoRef(it.id, it.url) } +
        listOfNotNull(o.deliveryProofUrl?.takeIf { url -> o.loadedPhotos.none { it.url == url } }?.let { PhotoRef(null, it) })

private fun dial(ctx: Context, phone: String) {
    ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+$phone")))
}

/**
 * `2b-order-detail.png`: the navy [DetailPanel] over the «Тўлов ҳолати» [ProgressCard], the
 * «Етказиш» card with its [StepTimeline], and then the cards R7 keeps — payments, shipments,
 * photos, events — under a sticky action bar.
 *
 * The shell draws the floating nav pill *over* this screen and has no `Scaffold`, so the root is a
 * plain `Box`: it pads the status bar itself, the list reserves
 * [EtalonSpace.underStickyBar] / [EtalonSpace.underNav] at the bottom, and the action bar is
 * bottom-aligned inside the box with the pill's band beneath it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    r: Resource<OrderDetail>,
    me: Me,
    pending: List<PendingUpload>,
    actionError: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadTruck: () -> Unit,
    onAddPhoto: () -> Unit,
    onDeliveryProof: () -> Unit,
    onOpenShipments: () -> Unit,
    onOpenLocation: () -> Unit,
    onRecordPayment: () -> Unit,
    onDeletePhoto: (String) -> Unit,
    onRetryUpload: (String) -> Unit,
    onCancelUpload: (String) -> Unit,
) {
    val o = r.dataOrNull
    val ctx = LocalContext.current
    val canEdit = me.can("order.edit")
    val unfinishedUploads = pending.count { !it.failed }
    val failedUploads = pending.count { it.failed }
    val firstFailed = pending.firstOrNull { it.failed }
    val step = o?.let { nextStepFor(it, me, unfinishedUploads, failedUploads) } ?: NextStep.None
    val canPay = o != null && canRecordPayment(o, me)
    val hasBar = o != null && (step != NextStep.None || canPay)
    val photos = o?.let { stripPhotos(it) }.orEmpty()
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var deleteCandidate by remember { mutableStateOf<PhotoRef?>(null) }
    // Only a photo the server already knows can be deleted; a queued one has no id to delete by.
    val onPhotoLongPress: ((Int) -> Unit)? = if (canEdit) {
        { index -> photos.getOrNull(index)?.takeIf { p -> p.id != null }?.let { p -> deleteCandidate = p } }
    } else {
        null
    }

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        PullToRefreshBox(
            isRefreshing = r is Resource.Loading && o == null,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = EtalonSpace.cardMargin,
                    end = EtalonSpace.cardMargin,
                    top = EtalonSpace.sm,
                    // The other sticky-bar screens sit in a Scaffold, which adds the bar's own
                    // height to their content padding; this one has no Scaffold, so the clearance
                    // is spelled out. Measured: the bar stands 172 dp tall above the navigation
                    // inset — 16 scrim + 12 + a 48 dp button slot + 12 + this screen's 84 dp
                    // `bottomInset` — so it covers 196 dp of the window on the emulator's
                    // gesture nav (24 dp inset) and 220 on a three-button one (48).
                    // 160 (`underStickyBar`)
                    // alone left the last card behind the buttons on the emulator, and 208
                    // (`+ minTouch`) would still fail the three-button case, so the sum below —
                    // 260, the smallest two-token figure that clears every nav mode — stands.
                    bottom = if (hasBar) EtalonSpace.underNav + EtalonSpace.underStickyBar else EtalonSpace.underNav,
                ),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                // 0 · outbox — a queued photo the operator must be able to see, retry or drop
                if (pending.isNotEmpty()) {
                    item {
                        OutboxBanner(
                            pending = unfinishedUploads,
                            failedMessage = firstFailed?.let { it.error ?: stringResource(R.string.orders_upload_failed) },
                            onRetry = { firstFailed?.let { onRetryUpload(it.id) } },
                            onCancel = { firstFailed?.let { onCancelUpload(it.id) } },
                        )
                    }
                }
                if (r is Resource.Error) item { ErrorBanner(r.error.message, onRetry = onRefresh) }
                if (actionError != null) item { ErrorBanner(actionError) }
                if (o == null) return@LazyColumn
                item { Panel(o, onBack = onBack, onCall = { dial(ctx, o.summary.client.phone) }) }
                item { PaymentProgress(o) }
                if (hasCostBreakdown(o)) item { CostsCard(o) }
                if (o.payments.isNotEmpty() || !o.pendingAmount.isZero) item { PaymentsCard(o) }
                item {
                    DeliveryCard(
                        o = o,
                        // With order.edit the pin is editable, so the control opens the location
                        // screen (which offers navigation of its own). A read-only operator keeps
                        // the straight hand-off to the maps app, and only when a pin exists.
                        onLocation = when {
                            canEdit -> onOpenLocation
                            o.deliveryLat != null && o.deliveryLng != null -> {
                                { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${o.deliveryLat},${o.deliveryLng}?q=${o.deliveryLat},${o.deliveryLng}"))) }
                            }
                            else -> null
                        },
                        locationLabel = if (canEdit) R.string.action_location else R.string.orders_action_navigate,
                    )
                }
                // Once the order is split this lists the trucks; before it is split it is the ONLY
                // way into the split flow (the web app has a dedicated button and Android had
                // nothing), so it also renders empty for an operator who may create one. Tappable
                // only with dispatch.create — every route behind it needs it.
                val shipmentsDoor = canOpenShipments(o, me)
                if (o.shipments.isNotEmpty() || shipmentsDoor) {
                    item { ShipmentsCard(o, pending, if (shipmentsDoor) onOpenShipments else null) }
                }
                val canAdd = canAddPhoto(o, me)
                if (photos.isNotEmpty() || canAdd) {
                    item {
                        WhiteCard(stringResource(R.string.photos)) {
                            PhotoStrip(
                                photos = photos,
                                onOpen = { lightboxAt = it },
                                onAdd = if (canAdd) onAddPhoto else null,
                                onLongPress = onPhotoLongPress,
                            )
                        }
                    }
                }
                if (o.events.isNotEmpty()) {
                    item {
                        WhiteCard(stringResource(R.string.events)) {
                            o.events.take(20).forEach { e ->
                                Text(
                                    "${formatDateTime(e.createdAt)} · ${e.message ?: e.type}${e.actorName?.let { " · $it" } ?: ""}",
                                    style = EtalonType.meta,
                                    color = EtalonColors.ink2,
                                    modifier = Modifier.padding(top = EtalonSpace.xs),
                                )
                            }
                        }
                    }
                }
            }
        }
        if (o != null) ActionBar(step, canPay, onLoadTruck, onDeliveryProof, onOpenShipments, onRecordPayment)
    }

    lightboxAt?.let { at -> Lightbox(photos, at, onDismiss = { lightboxAt = null }) }
    deleteCandidate?.let { photo ->
        AlertDialog(
            onDismissRequest = { deleteCandidate = null },
            title = { Text(stringResource(R.string.delete_photo_title)) },
            text = { Text(stringResource(R.string.delete_photo_message)) },
            confirmButton = {
                TextButton(onClick = {
                    photo.id?.let(onDeletePhoto)
                    deleteCandidate = null
                }) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text(stringResource(R.string.orders_action_cancel)) } },
        )
    }
}

/** The hero. R7: no «Хона қўшиш» tile and no ↗ on a room — there is no order editing on mobile,
 *  so a tile is a figure, not a door. An odd room count keeps the capture's two-column geometry by
 *  leaving the empty half empty rather than stretching the last tile across it. */
@Composable
private fun Panel(o: OrderDetail, onBack: () -> Unit, onCall: () -> Unit) = DetailPanel(
    caption = stringResource(R.string.detail_caption),
    headline = formatOrderNo(o.summary.orderNumber),
    // The full wording, «Жўнатилган», exactly as the capture draws it — the abbreviations
    // («Йўлда») exist for the list rows' width, and `orderStatusShortLabel` itself says the full
    // words stay in use on panels and detail screens.
    statusTag = { StatusTag(o.summary.status, TagSurface.PANEL_ON_INDIGO) },
    clientName = o.summary.client.name,
    addressLine = formatAddressLine(o.summary.client.address),
    tiles = {
        o.rooms.forEachIndexed { i, rm ->
            RoomTile(
                areaText = formatArea(rm.billedArea),
                caption = stringResource(
                    R.string.detail_room_dims,
                    rm.name ?: stringResource(R.string.room_n, i + 1),
                    formatDecimal(rm.innerWidth, 1),
                    formatDecimal(rm.innerLength, 1),
                ),
                modifier = Modifier.weight(1f),
            )
        }
        if (o.rooms.size % 2 == 1) Spacer(Modifier.weight(1f))
    },
    totals = {
        PanelTotal(stringResource(R.string.detail_area), formatArea(o.summary.totalArea), modifier = Modifier.weight(1f))
        PanelTotal(stringResource(R.string.detail_total), formatMoney(o.summary.totalPrice), modifier = Modifier.weight(1f))
        PanelTotal(
            stringResource(R.string.detail_remaining),
            formatMoney(o.remaining),
            valueColor = if (o.remaining.isZero) EtalonColors.paidOnDark else EtalonColors.onDark,
            modifier = Modifier.weight(1f),
        )
    },
    onBack = onBack,
    dateLabel = formatDate(o.summary.scheduledAt),
    onCall = onCall,
)

/** The one permitted BigDecimal→Float crossing on this screen: bar geometry, never a figure. */
internal fun paidFraction(o: OrderDetail): Float {
    val total = o.summary.totalPrice.amount
    if (total.signum() <= 0) return 0f
    return o.summary.confirmedPaid.amount.divide(total, 4, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)
}

/**
 * The percentage the card *says*, which is not the bar's geometry rounded.
 *
 * «100 % тўланган» is a claim about the debt, so only a settled order may make it: 13 349 999 of
 * 13 350 000 rounds to 100 and would read as paid off next to a red «Қолди 1». «0 %» is the same
 * claim backwards — a customer who has paid something must not be shown as having paid nothing.
 * Everything between is clamped into 1..99.
 */
internal fun paidPercent(o: OrderDetail): Int = when {
    o.remaining.isZero -> 100
    o.summary.confirmedPaid.isZero -> 0
    else -> (paidFraction(o) * 100).roundToInt().coerceIn(1, 99)
}

@Composable
private fun PaymentProgress(o: OrderDetail) {
    ProgressCard(
        label = stringResource(R.string.detail_payment_state),
        fraction = paidFraction(o),
        percentText = stringResource(R.string.detail_percent_paid, paidPercent(o)),
        paidLabel = stringResource(R.string.detail_paid_amount, formatMoney(o.summary.confirmedPaid)),
        remainingLabel = stringResource(R.string.detail_remaining_amount, formatMoney(o.remaining)),
        settled = o.remaining.isZero,
    )
}

/**
 * §2's white card: `xl`, hairline border, 16/14 padding, a 14/700 title over its content.
 *
 * @param title null for a card whose rows title themselves — the cost breakdown, which is a list
 *   of named lines closed by «Жами» and would only repeat itself in a header.
 */
@Composable
private fun WhiteCard(
    title: String?,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    if (title != null || trailing != null) {
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            Text(
                title.orEmpty(),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (trailing != null) trailing()
        }
        Spacer(Modifier.height(EtalonSpace.rowGap))
    }
    content()
}

/** A card with nothing to say: only the rooms priced the order, and the panel's «Жами» already
 *  carries that figure. */
private fun hasCostBreakdown(o: OrderDetail): Boolean =
    !o.discountAmount.isZero || !o.deliveryCost.isZero || !o.otherCost.isZero

/** U+2212 MINUS SIGN, written as an escape so a diff can tell it from a hyphen. */
private const val MINUS = '−'

/**
 * What the order is priced from: the rooms' own subtotal, then whatever moved it, closed by the
 * figure the panel shows. Restored from the rooms card the restyle replaced — without it the
 * discount, the delivery cost and the other cost are visible nowhere on the phone.
 */
@Composable
private fun CostsCard(o: OrderDetail) = WhiteCard(title = null) {
    CostRow(stringResource(R.string.rooms_subtotal), formatMoney(o.roomsSubtotal))
    if (!o.discountAmount.isZero) CostRow(stringResource(R.string.discount), "$MINUS${formatMoney(o.discountAmount)}")
    if (!o.deliveryCost.isZero) CostRow(stringResource(R.string.delivery), formatMoney(o.deliveryCost))
    if (!o.otherCost.isZero) CostRow(stringResource(R.string.other_cost), formatMoney(o.otherCost))
    HorizontalDivider(
        Modifier.padding(vertical = EtalonSpace.sm),
        thickness = EtalonSpace.hairline,
        color = EtalonColors.surfaceBorder,
    )
    CostRow(stringResource(R.string.total), formatMoney(o.summary.totalPrice), total = true)
}

@Composable
private fun CostRow(caption: String, value: String, total: Boolean = false) = Row(
    Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
    Arrangement.SpaceBetween,
    Alignment.CenterVertically,
) {
    Text(
        caption,
        style = if (total) EtalonType.label else EtalonType.meta,
        color = if (total) EtalonColors.ink else EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    Spacer(Modifier.width(EtalonSpace.sm))
    Text(
        value,
        style = if (total) EtalonType.label else EtalonType.rowAmount,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun PaymentsCard(o: OrderDetail) = WhiteCard(stringResource(R.string.detail_payments)) {
    o.payments.forEach { p ->
        Row(
            Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                MoneyText(p.amount, style = EtalonType.rowAmount, color = EtalonColors.ink)
                Text(
                    "${formatDateTime(p.recordedAt)}${p.recordedByName?.let { " · $it" } ?: ""}",
                    style = EtalonType.meta,
                    color = EtalonColors.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            PaymentStatusTag(p.status)
        }
    }
    if (!o.pendingAmount.isZero) {
        Text(
            stringResource(R.string.pending_amount, formatMoney(o.pendingAmount)),
            style = EtalonType.meta,
            color = EtalonColors.indigo,
            modifier = Modifier.padding(top = EtalonSpace.xs),
        )
    }
}

/**
 * The «Етказиш» card: the four-step timeline over the `Сана · Ҳайдовчи` footer.
 *
 * The location control rides in the card's header. [DetailPanel] offers one trailing slot and the
 * dialer has it, so the pin — which is a *delivery* affordance — lives with the delivery card
 * rather than being dropped.
 */
@Composable
private fun DeliveryCard(o: OrderDetail, onLocation: (() -> Unit)?, @StringRes locationLabel: Int) = WhiteCard(
    title = stringResource(R.string.detail_delivery),
    trailing = onLocation?.let {
        {
            SecondaryButton(
                text = stringResource(locationLabel),
                onClick = it,
                leadingIcon = EtalonIcons.Navigation,
                compact = true,
            )
        }
    },
) {
    StepTimeline(timelineFor(o).map { TimelineStep(stringResource(it.labelRes), it.caption, it.state) })
    Spacer(Modifier.height(EtalonSpace.md))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.detail_date), style = EtalonType.meta, color = EtalonColors.ink2)
            Text(formatDate(o.summary.scheduledAt), style = EtalonType.label, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
            Text(stringResource(R.string.detail_driver), style = EtalonType.meta, color = EtalonColors.ink2)
            Text(
                o.dispatch?.driverName
                    ?: o.shipments.firstNotNullOfOrNull { it.driverName }
                    ?: stringResource(R.string.detail_no_driver),
                style = EtalonType.label,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ShipmentsCard(o: OrderDetail, pending: List<PendingUpload>, onOpen: (() -> Unit)?) = WhiteCard(
    title = stringResource(R.string.shipments),
    onClick = onOpen,
    trailing = if (onOpen != null) {
        { EtalonIcon(EtalonIcons.ChevronRight, null, tint = EtalonColors.ink3) }
    } else {
        null
    },
) {
    if (o.shipments.isEmpty()) {
        Text(stringResource(R.string.split_into_shipments), style = EtalonType.label, color = EtalonColors.indigo)
    }
    o.shipments.forEach { sh ->
        Row(
            Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.orders_shipment_n, sh.number), style = EtalonType.rowTitle, color = EtalonColors.ink)
                val who = listOfNotNull(sh.driverName, sh.truckIdentifier).joinToString(" · ")
                if (who.isNotEmpty()) {
                    Text(who, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                // A load queued offline leaves the truck looking untouched; say so here so nobody
                // loads it a second time from the shipment list. A row the server has already
                // rejected gets its own wording and colour — it is not on its way anywhere, and
                // the outbox banner at the top of this screen is where the retry and the cancel are.
                val truckRows = pending.filter { it.shipmentId == sh.id }
                when {
                    truckRows.any { it.failed } ->
                        Text(stringResource(R.string.orders_upload_failed_short), style = EtalonType.meta, color = EtalonColors.red)
                    truckRows.isNotEmpty() ->
                        Text(stringResource(R.string.orders_upload_sending), style = EtalonType.meta, color = EtalonColors.indigo)
                }
            }
            ShipmentStatusTag(sh.status)
        }
    }
}

/**
 * R7's bar: the existing next step as a [SecondaryButton] beside «Тўлов қайд қилиш». A lone button
 * fills the width; with neither, no bar at all — an empty bar would eat thumb space and read as a
 * disabled action.
 *
 * The shell's floating pill is drawn over this screen at the window's bottom edge, so the bar is
 * given the pill's band as its own `bottomInset` — inside the bar, where the system's navigation
 * inset is applied, so that inset is counted once. (The nine screens lifted in this phase's task 4
 * wrap the bar in a padded `Box` instead, which counts it twice; phase 3 unifies them on this.)
 * Less the bar's own 16 dp of horizontal margin, so the buttons keep the capture's ~24 dp of air
 * over the pill rather than the full 100.
 */
@Composable
private fun BoxScope.ActionBar(
    step: NextStep,
    canPay: Boolean,
    onLoadTruck: () -> Unit,
    onDeliveryProof: () -> Unit,
    onOpenShipments: () -> Unit,
    onRecordPayment: () -> Unit,
) {
    val secondary: (@Composable RowScope.() -> Unit)? = when (step) {
        NextStep.LoadTruck -> { { SecondaryButton(stringResource(R.string.action_load), onLoadTruck, Modifier.weight(1f)) } }
        NextStep.DeliveryProof -> { { SecondaryButton(stringResource(R.string.action_delivered), onDeliveryProof, Modifier.weight(1f)) } }
        NextStep.ManageShipments -> { { SecondaryButton(stringResource(R.string.action_shipments), onOpenShipments, Modifier.weight(1f)) } }
        is NextStep.Blocked -> { { SecondaryButton(step.reason, onClick = {}, Modifier.weight(1f), enabled = false) } }
        NextStep.None -> null
    }
    if (secondary == null && !canPay) return
    Box(Modifier.align(Alignment.BottomCenter)) {
        StickyActionBar(bottomInset = EtalonSpace.underNav - EtalonSpace.cardMargin) {
            secondary?.invoke(this)
            if (canPay) PrimaryButton(stringResource(R.string.action_record_payment), onRecordPayment, Modifier.weight(1f))
        }
    }
}
