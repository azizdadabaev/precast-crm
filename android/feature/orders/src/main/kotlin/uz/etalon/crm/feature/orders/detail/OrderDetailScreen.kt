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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.DetailPanel
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.LoadListCard
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
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.StepTimeline
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.StickyActionBarDefaults
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.TimelineStep
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.components.timelineFor
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrderComment
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderEventLine
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.displayedDiscount
import uz.etalon.crm.core.model.loadList
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.model.totalBlocks
import uz.etalon.crm.core.model.weightKg
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDateTime
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatPercent
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
    val comments by vm.comments.collectAsStateWithLifecycle()
    val commentDraft by vm.commentDraft.collectAsStateWithLifecycle()
    val postingComment by vm.postingComment.collectAsStateWithLifecycle()
    val commentError by vm.commentError.collectAsStateWithLifecycle()
    OrderDetailScreen(
        r = r, me = me, pending = pending, actionError = actionError,
        onBack = onBack, onRefresh = vm::refresh,
        onLoadTruck = onLoadTruck, onAddPhoto = onAddPhoto, onDeliveryProof = onDeliveryProof,
        onOpenShipments = onOpenShipments, onOpenLocation = onOpenLocation, onRecordPayment = onRecordPayment,
        onDeletePhoto = vm::deletePhoto, onRetryUpload = vm::retryUpload, onCancelUpload = vm::cancelUpload,
        comments = comments, commentDraft = commentDraft, postingComment = postingComment, commentError = commentError,
        onCommentDraftChange = vm::setCommentDraft, onPostComment = vm::postComment,
        onRetryComments = vm::refreshComments,
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
 * plain `Box`: it pads the status bar itself, the list reserves the pill's band plus
 * [StickyActionBarDefaults.height] at the bottom, and the action bar is bottom-aligned inside the
 * box with the pill's band beneath it.
 *
 * @param barVisible whether the sticky [ActionBar] is drawn at all. It steps aside for the
 *   keyboard, the same rule the calculator's summary sheet follows: the app draws edge to edge, so
 *   the window's own `adjustResize` is inert and the root's `imePadding` is what shortens the
 *   screen by the keyboard. The bar is bottom-aligned INSIDE that shortened box, so it would land
 *   directly on top of the «Шарҳлар» field the operator is typing into — over the very words being
 *   written. The comment card carries its own «Юбориш», and the keyboard's own Send key posts the
 *   note, so nothing is out of reach while the bar is away.
 *
 *   Defaulted from the window and passed in only by the tests — Robolectric reports the ime inset
 *   as absent whatever is focused, so this is the only way the rule can be asserted at all.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
    // «Шарҳлар». Defaulted so every frame that has nothing to say about the thread still draws the
    // card in its empty state rather than having to spell six arguments out.
    comments: Resource<List<OrderComment>> = Resource.Loading(null),
    commentDraft: String = "",
    postingComment: Boolean = false,
    commentError: String? = null,
    onCommentDraftChange: (String) -> Unit = {},
    onPostComment: () -> Unit = {},
    onRetryComments: () -> Unit = {},
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    val o = r.dataOrNull
    val ctx = LocalContext.current
    val canEdit = me.can("order.edit")
    val unfinishedUploads = pending.count { !it.failed }
    val failedUploads = pending.count { it.failed }
    val firstFailed = pending.firstOrNull { it.failed }
    val step = o?.let { nextStepFor(it, me, unfinishedUploads, failedUploads) } ?: NextStep.None
    val door = o?.let { paymentDoorFor(it, me) } ?: PaymentDoor.Hidden
    val hasBar = o != null && (step != NextStep.None || door != PaymentDoor.Hidden)
    val photos = o?.let { stripPhotos(it) }.orEmpty()
    // What a blocked payment door adds to the bar: the reason line's own box at its
    // [BLOCKED_REASON_LINES] maximum, plus the `xs` that separates it from the button. Measured
    // rather than guessed at a constant, so at font scale 1,3 the clearance grows with the text
    // and the last card still ends clear of the bar. `meta` declares no line height of its own,
    // so the figure can only come from the font metrics.
    val blockedBarExtra = with(LocalDensity.current) {
        rememberTextMeasurer()
            .measure(BLOCKED_REASON_PROBE, EtalonType.meta, maxLines = BLOCKED_REASON_LINES)
            .size.height.toDp()
    } + EtalonSpace.xs
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var deleteCandidate by remember { mutableStateOf<PhotoRef?>(null) }
    // Only a photo the server already knows can be deleted; a queued one has no id to delete by.
    val onPhotoLongPress: ((Int) -> Unit)? = if (canEdit) {
        { index -> photos.getOrNull(index)?.takeIf { p -> p.id != null }?.let { p -> deleteCandidate = p } }
    } else {
        null
    }

    // `imePadding` on the root, not on the list: the sticky bar is bottom-aligned inside this box
    // rather than laid out under the list, so padding the list alone would leave the bar — and the
    // comment field's own «Юбориш» beneath it — behind the keyboard. The whole screen shortens, and
    // the focused field is scrolled into what is left of it.
    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        PullToRefreshBox(
            isRefreshing = r is Resource.Loading && o == null,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                // The other sticky-bar screens sit in a Scaffold, which adds the bar's own height
                // to their content padding; this one has no Scaffold, so the clearance is spelled
                // out: the pill's inset-aware band, plus the bar's own 88 dp when it is drawn.
                contentPadding = navPillContentPadding(
                    start = EtalonSpace.cardMargin,
                    end = EtalonSpace.cardMargin,
                    top = EtalonSpace.sm,
                    // A blocked payment door hangs its reason under the button, so the bar is one
                    // `meta` line taller than the constant describes — see [blockedBarExtra].
                    extraBottom = when {
                        !hasBar || !barVisible -> 0.dp
                        door is PaymentDoor.Blocked -> StickyActionBarDefaults.height + blockedBarExtra
                        else -> StickyActionBarDefaults.height
                    },
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
                val canceled = o.summary.status.owesNothing
                if (canceled) item { CanceledNotice(o) }
                // Spec §5.1a: the loader's own section, and the one the owner named as the reason
                // the phone could not replace the web page at the truck. Always drawn — on a
                // canceled order collapsed, because what was quoted is still worth reading but
                // nothing is going on a lorry.
                if (o.rooms.isNotEmpty()) {
                    item { LoadListCard(o.loadList, o.totalBlocks, o.weightKg, collapsible = canceled) }
                }
                // A canceled order has no balance to make progress against and no live price to
                // break down (`OrderStatus.owesNothing`): a «45 % тўланган» bar or a «Жами» on a
                // sale that never happened is a claim about money that is not owed. The payments
                // card below still draws — cash that was taken is history and stays visible.
                if (!canceled) {
                    item { PaymentProgress(o) }
                    if (hasCostBreakdown(o)) item { CostsCard(o) }
                }
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
                // §5.1a's order: the thread sits between the photos and «Тарих». Always drawn —
                // a `COMMENT_MENTION` push lands on this screen, and a card that is absent until
                // somebody has already written something is a dead end for the first person to.
                item {
                    CommentsCard(
                        comments = comments, draft = commentDraft, posting = postingComment,
                        error = commentError, onDraftChange = onCommentDraftChange, onPost = onPostComment,
                        onRetryLoad = onRetryComments,
                    )
                }
                if (o.events.isNotEmpty()) item { EventsCard(o.events) }
            }
        }
        if (o != null && barVisible) {
            ActionBar(step, door, onLoadTruck, onDeliveryProof, onOpenShipments, onRecordPayment)
        }
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
        // A canceled order owes nothing (`OrderStatus.owesNothing`), so «Қолди» is a dash rather
        // than its untouched total — the rows on Home and Orders already draw nothing for one, and
        // the screen they open must not contradict them. Muted, because «—» is an absence, not a
        // figure, and green would read as settled.
        val owesNothing = o.summary.status.owesNothing
        PanelTotal(
            stringResource(R.string.detail_remaining),
            if (owesNothing) stringResource(R.string.detail_no_balance) else formatMoney(o.remaining),
            valueColor = when {
                owesNothing -> EtalonColors.onDarkMuted
                o.remaining.isZero -> EtalonColors.paidOnDark
                else -> EtalonColors.onDark
            },
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

/**
 * Why this order is dead, in the two facts the web page carries: when, and on what grounds.
 *
 * The panel's red «Бекор қилинган» tag already says *that* it was canceled; this says *why*, which
 * is the one thing nobody can reconstruct from the rest of the screen — §5.1a's «anyone can see in
 * ten seconds what is owed and why an order was cancelled». An order canceled before the server
 * recorded the date keeps the sentence and drops the «· 3 сен 2026».
 */
@Composable
private fun CanceledNotice(o: OrderDetail) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.redBg)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Text(
        o.canceledAt?.let { stringResource(R.string.detail_canceled_title, formatDate(it)) }
            ?: stringResource(R.string.detail_canceled_no_date),
        style = EtalonType.label,
        color = EtalonColors.red,
    )
    val reason = o.cancelReason?.takeIf { it.isNotBlank() }
        ?: stringResource(R.string.detail_cancel_reason_none)
    Text(
        stringResource(R.string.detail_cancel_reason, reason),
        style = EtalonType.meta,
        color = EtalonColors.red,
        modifier = Modifier.padding(top = EtalonSpace.xs),
    )
}

/** How many «Тарих» rows are drawn before «Барчаси (N)». Spec §5.1a: the section is a *collapsed*
 *  one — three lines of context, and the rest a tap away. */
private const val COLLAPSED_EVENTS = 3

/** The same rule for «Шарҳлар» — but the LAST three, not the first: the route hands the thread
 *  back oldest-first and what anyone opening an order wants is the end of the conversation. */
private const val COLLAPSED_COMMENTS = 3

/**
 * «Шарҳлар»: the deal's thread and a composer under a hairline.
 *
 * An `@исм` is drawn as the plain text it is. The server resolves mentions at write time — it is
 * what turns them into the `COMMENT_MENTION` push that opens this very screen — so the phone has
 * nothing to look up and no mention picker to offer; typing the name is the whole interaction.
 *
 * Online only, with no cache behind it. A failed LOAD is said inside the card, above whatever
 * rows the last answer left there: «Ҳозирча шарҳлар йўқ» under a thread that merely failed to
 * arrive is a lie, and the operator has to be able to tell an empty deal from a dropped
 * connection. A failed SEND keeps the draft in the field so nobody retypes a note.
 * The expansion is `rememberSaveable` because a rotation in the middle of reading a long thread
 * must not fold it back to three lines.
 */
@Composable
private fun CommentsCard(
    comments: Resource<List<OrderComment>>,
    draft: String,
    posting: Boolean,
    error: String?,
    onDraftChange: (String) -> Unit,
    onPost: () -> Unit,
    onRetryLoad: () -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val thread = comments.dataOrNull.orEmpty()
    WhiteCard(stringResource(R.string.detail_comments)) {
        if (comments is Resource.Error) {
            ErrorBanner(comments.error.message, onRetry = onRetryLoad)
            Spacer(Modifier.height(EtalonSpace.sm))
        } else if (thread.isEmpty()) {
            Text(stringResource(R.string.detail_comments_empty), style = EtalonType.body, color = EtalonColors.ink3)
        }
        (if (expanded) thread else thread.takeLast(COLLAPSED_COMMENTS)).forEach { CommentRow(it) }
        if (thread.size > COLLAPSED_COMMENTS) {
            Text(
                if (expanded) {
                    stringResource(R.string.detail_comments_less)
                } else {
                    stringResource(R.string.detail_comments_all, thread.size)
                },
                style = EtalonType.label,
                color = EtalonColors.indigo,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(TAG_COMMENTS_ALL)
                    .clickable(role = Role.Button) { expanded = !expanded }
                    .heightIn(min = EtalonSpace.minTouch)
                    .wrapContentHeight(Alignment.CenterVertically),
            )
        }
        HorizontalDivider(
            Modifier.padding(vertical = EtalonSpace.sm),
            thickness = EtalonSpace.hairline,
            color = EtalonColors.surfaceBorder,
        )
        if (error != null) {
            // The server's own Uzbek sentence when it named a reason; the flat «Шарҳ юборилмади»
            // when it did not — the same shape the outbox banner uses for a failed upload.
            ErrorBanner(error.ifBlank { stringResource(R.string.detail_comment_failed) }, onRetry = onPost)
            Spacer(Modifier.height(EtalonSpace.sm))
        }
        EtalonTextField(
            value = draft,
            onValueChange = onDraftChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = stringResource(R.string.detail_comment_hint),
            singleLine = false,
            maxLines = 3,
            // readOnly, not disabled: a send in flight must not grey out the note the operator
            // just typed — if it fails, that text is what they keep.
            readOnly = posting,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { onPost() }),
        )
        Spacer(Modifier.height(EtalonSpace.sm))
        Row(Modifier.fillMaxWidth(), Arrangement.End) {
            // Live whenever there is something to send, offline included: this app observes no
            // connectivity, so a disabled-when-offline button would be guessing. The send fails
            // loudly instead and keeps the draft, which is the honest half of the same promise.
            PrimaryButton(
                text = stringResource(R.string.detail_comment_send),
                onClick = onPost,
                enabled = draft.isNotBlank(),
                loading = posting,
                compact = true,
            )
        }
    }
}

/** One line of the thread: the author's circle, their name with when they wrote it, then the note. */
@Composable
private fun CommentRow(c: OrderComment) = Row(
    Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
) {
    Avatar(c.authorName, size = 28.dp)
    Spacer(Modifier.width(EtalonSpace.sm))
    Column(Modifier.weight(1f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                c.authorName,
                style = EtalonType.label,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                // fill = false: a short name leaves the date beside it rather than shoving it to
                // the far edge, and a long one still yields the space the date needs.
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(EtalonSpace.xs))
            Text(formatDateTime(c.createdAt), style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1)
        }
        Text(c.body, style = EtalonType.body, color = EtalonColors.ink)
    }
}

/**
 * «Тарих», collapsed. The expansion happens in place: there is no history screen to navigate to,
 * and the newest three lines are what anyone checking an order actually reads.
 *
 * A server `message` written as English prose for the desk is not printed — [eventMessage] carries
 * the list and the rule, and the phone shows the type's Uzbek wording instead. Every other message
 * is kept: it carries the specifics — which driver, how much — that a type name cannot.
 *
 * Expanding shows the whole list with no cap of its own, which is safe because the route caps
 * itself: `GET /api/orders/{id}` takes the newest 100 events (`take: 100`), so «Барчаси» is at
 * most a hundred lines. «Камроқ» folds it back — an expansion with no way out leaves the composer
 * and the bar a hundred rows away, and the state is `rememberSaveable` so a rotation does not
 * decide it either way.
 */
@Composable
private fun EventsCard(events: List<OrderEventLine>) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    WhiteCard(stringResource(R.string.events)) {
        (if (expanded) events else events.take(COLLAPSED_EVENTS)).forEach { e ->
            val what = eventMessage(e.type, e.message)
                ?: stringResource(orderEventLabel(e.type) ?: R.string.event_generic)
            Text(
                "${formatDateTime(e.createdAt)} · $what${e.actorName?.let { " · $it" } ?: ""}",
                style = EtalonType.meta,
                color = EtalonColors.ink2,
                modifier = Modifier.padding(top = EtalonSpace.xs),
            )
        }
        if (events.size > COLLAPSED_EVENTS) {
            Text(
                if (expanded) {
                    stringResource(R.string.detail_events_less)
                } else {
                    stringResource(R.string.detail_events_all, events.size)
                },
                style = EtalonType.label,
                color = EtalonColors.indigo,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(TAG_EVENTS_ALL)
                    .clickable(role = Role.Button) { expanded = !expanded }
                    .heightIn(min = EtalonSpace.minTouch)
                    .wrapContentHeight(Alignment.CenterVertically),
            )
        }
    }
}

/** The two expand/collapse rows, tagged so a test can find them by role rather than by the wording
 *  they carry — «Барчаси (5)» changes with the count and «Камроқ» is the same word in both cards. */
internal const val TAG_COMMENTS_ALL = "detail_comments_all"
internal const val TAG_EVENTS_ALL = "detail_events_all"

/** How many `meta` lines the blocked payment door's reason may take, and a probe of exactly that
 *  many to measure their box against. Two, because the line sits under the button rather than
 *  across the bar: «Тасдиқ кутилмоқда: 13 350 000» at font scale 1,3 does not fit one, and a sum
 *  ellipsised to «13 35…» is the one part of the sentence the operator needed. The probe's
 *  characters are irrelevant — only the box's height is read. */
private const val BLOCKED_REASON_LINES = 2
private const val BLOCKED_REASON_PROBE = "0\n0"

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
    // The rate the discount was struck at, when the order carries one — the web writes the same
    // «Чегирма 2,1%» beside the sum, and it is what a client asks about. The FIGURE is
    // [displayedDiscount], not `discountAmount`: see that property for why the column would
    // otherwise be a UZS short of «Жами» on a discount that lands on a half — and why it falls back
    // to the stored figure rather than to nothing when the derivation cannot be trusted.
    val discount = o.displayedDiscount
    if (discount.amount.signum() > 0) {
        CostRow(
            if (o.discountPercent.signum() > 0) {
                stringResource(R.string.detail_discount_pct, formatPercent(o.discountPercent, 1))
            } else {
                stringResource(R.string.discount)
            },
            "$MINUS${formatMoney(discount)}",
        )
    }
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
    // On a canceled order the progress card and the cost breakdown are both gone, so these rows
    // would be sums with nothing to be read against. This is the only place left that can state
    // the denominator — how much of the order's price the cash on file actually covered.
    if (o.summary.status.owesNothing) {
        Text(
            stringResource(
                R.string.detail_payments_confirmed_of,
                formatMoney(o.summary.confirmedPaid),
                formatMoney(o.summary.totalPrice),
            ),
            style = EtalonType.meta,
            color = EtalonColors.ink2,
            modifier = Modifier.padding(top = EtalonSpace.xs),
        )
    }
}

/**
 * The «Етказиш» card: the three-step timeline ([timelineFor]) over the `Сана · Ҳайдовчи` footer.
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
            StatusTag(sh.status)
        }
    }
}

/**
 * R7's bar: the existing next step as a [SecondaryButton] beside «Тўлов қайд қилиш». A lone button
 * fills the width; with neither, no bar at all — an empty bar would eat thumb space and read as a
 * disabled action.
 *
 * The shell's floating pill is drawn over this screen at the window's bottom edge; the bar clears
 * it by itself (`clearNavPill`, the default), which counts the system navigation inset exactly
 * once and leaves the buttons the capture's ~24 dp of air over the pill in every navigation mode.
 */
@Composable
private fun BoxScope.ActionBar(
    step: NextStep,
    door: PaymentDoor,
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
    if (secondary == null && door == PaymentDoor.Hidden) return
    Box(Modifier.align(Alignment.BottomCenter)) {
        StickyActionBar {
            secondary?.invoke(this)
            val record = stringResource(R.string.action_record_payment)
            when (door) {
                PaymentDoor.Open -> PrimaryButton(record, onRecordPayment, Modifier.weight(1f))
                // §5.1a's disable-with-a-reason: the button stays where the thumb expects it, greyed,
                // with the sentence that explains the refusal — the whole balance is already waiting
                // to be confirmed, so the server would take nothing more.
                is PaymentDoor.Blocked -> Column(Modifier.weight(1f)) {
                    PrimaryButton(record, onClick = {}, enabled = false)
                    Text(
                        stringResource(R.string.pending_amount, formatMoney(door.pending)),
                        style = EtalonType.meta,
                        color = EtalonColors.ink2,
                        // Two at most — the list's bottom clearance is measured for exactly this
                        // many ([blockedBarExtra]), so the two cannot drift apart. A nine-digit sum
                        // at a large font scale wraps here instead of losing its tail.
                        maxLines = BLOCKED_REASON_LINES,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = EtalonSpace.xs),
                    )
                }
                PaymentDoor.Hidden -> Unit
            }
        }
    }
}
