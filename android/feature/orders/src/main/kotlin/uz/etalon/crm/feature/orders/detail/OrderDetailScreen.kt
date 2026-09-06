package uz.etalon.crm.feature.orders.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.*
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.*
import uz.etalon.crm.feature.orders.R

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
    vm: OrderDetailViewModel = hiltViewModel<OrderDetailViewModel, OrderDetailViewModel.Factory>(creationCallback = { it.create(orderId) }),
) {
    val r by vm.state.collectAsStateWithLifecycle()
    val pending by vm.pending.collectAsStateWithLifecycle()
    val actionError by vm.actionError.collectAsStateWithLifecycle()
    OrderDetailScreen(
        r = r, me = me, pending = pending, actionError = actionError,
        onBack = onBack, onRefresh = vm::refresh,
        onLoadTruck = onLoadTruck, onAddPhoto = onAddPhoto, onDeliveryProof = onDeliveryProof,
        onOpenShipments = onOpenShipments, onOpenLocation = onOpenLocation,
        onDeletePhoto = vm::deletePhoto, onRetryUpload = vm::retryUpload, onCancelUpload = vm::cancelUpload,
    )
}

private val FLOW = listOf(OrderStatus.PLACED, OrderStatus.LOADED, OrderStatus.DELIVERED)
private fun OrderStatus.collapsed() = when (this) { OrderStatus.IN_PRODUCTION -> OrderStatus.PLACED; OrderStatus.DISPATCHED -> OrderStatus.LOADED; else -> this }

/** The delivery proof is not part of the gallery the server hands back, so it is appended as a
 *  strip entry with no id — it is shown, never deleted from here. Guarded against the server one
 *  day listing it in the gallery too, which would otherwise show it twice. */
private fun stripPhotos(o: OrderDetail): List<PhotoRef> =
    o.loadedPhotos.map { PhotoRef(it.id, it.url) } +
        listOfNotNull(o.deliveryProofUrl?.takeIf { url -> o.loadedPhotos.none { it.url == url } }?.let { PhotoRef(null, it) })

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
    val photos = o?.let { stripPhotos(it) }.orEmpty()
    var lightboxAt by remember { mutableStateOf<Int?>(null) }
    var deleteCandidate by remember { mutableStateOf<PhotoRef?>(null) }
    // Only a photo the server already knows can be deleted; a queued one has no id to delete by.
    val onPhotoLongPress: ((Int) -> Unit)? = if (canEdit) {
        { index -> photos.getOrNull(index)?.takeIf { p -> p.id != null }?.let { p -> deleteCandidate = p } }
    } else {
        null
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(o?.summary?.orderNumber ?: "", style = EtalonType.monoTitle) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } })
        },
        bottomBar = { NextStepBar(step, onLoadTruck, onDeliveryProof, onOpenShipments) },
    ) { pad ->
        PullToRefreshBox(isRefreshing = r is Resource.Loading && o == null, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                // 0 · outbox — a queued photo the operator must be able to see, retry or drop
                if (pending.isNotEmpty()) item {
                    OutboxBanner(
                        pending = unfinishedUploads,
                        failedMessage = firstFailed?.let { it.error ?: stringResource(R.string.upload_failed) },
                        onRetry = { firstFailed?.let { onRetryUpload(it.id) } },
                        onCancel = { firstFailed?.let { onCancelUpload(it.id) } },
                    )
                }
                if (r is Resource.Error) item { ErrorBanner(r.error.message, onRetry = onRefresh) }
                if (actionError != null) item { ErrorBanner(actionError) }
                if (o == null) return@LazyColumn
                // 1 · header
                item {
                    StatusStripeCard(stripe = toneColor(orderStatusTone(o.summary.status))) {
                        Text(o.summary.client.name, style = MaterialTheme.typography.titleMedium)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(formatPhone(o.summary.client.phone), style = EtalonType.monoBody, color = MaterialTheme.colorScheme.primary)
                            IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+${o.summary.client.phone}"))) }) { Icon(Icons.Default.Call, stringResource(R.string.action_call)) }
                            // With order.edit the pin is editable, so the icon opens the location
                            // screen (which offers navigation of its own). A read-only operator
                            // keeps the straight hand-off to the maps app, and only when a pin exists.
                            if (canEdit) {
                                IconButton(onClick = onOpenLocation) { Icon(Icons.Default.Navigation, stringResource(R.string.action_location)) }
                            } else if (o.deliveryLat != null && o.deliveryLng != null) {
                                IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${o.deliveryLat},${o.deliveryLng}?q=${o.deliveryLat},${o.deliveryLng}"))) }) { Icon(Icons.Default.Navigation, stringResource(R.string.action_navigate)) }
                            }
                        }
                        o.summary.client.address?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text(stringResource(R.string.scheduled_on, formatDate(o.summary.scheduledAt)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // 2 · status timeline (read-only in 1a)
                item {
                    StatusStripeCard(stripe = LocalEtalonColors.current.border) {
                        val current = o.summary.status.collapsed()
                        val idx = FLOW.indexOf(current)
                        FLOW.forEachIndexed { i, st ->
                            val done = idx >= i && o.summary.status != OrderStatus.CANCELED
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                                Text(if (done) "●" else "○", color = if (done) LocalEtalonColors.current.success else MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.width(10.dp))
                                Text(stringResource(orderStatusLabel(st)), style = MaterialTheme.typography.bodyMedium, fontWeight = if (i == idx) FontWeight.Bold else FontWeight.Normal)
                            }
                        }
                        if (o.summary.status == OrderStatus.CANCELED) StatusChip(OrderStatus.CANCELED)
                    }
                }
                // 3 · payments
                item {
                    StatusStripeCard(stripe = if (o.remaining.isZero) LocalEtalonColors.current.success else MaterialTheme.colorScheme.primary) {
                        SectionLabel(stringResource(R.string.remaining))
                        MoneyText(o.remaining, style = EtalonType.monoDisplay)
                        Text(stringResource(R.string.paid_of_total, formatMoney(o.summary.confirmedPaid), formatMoney(o.summary.totalPrice)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!o.pendingAmount.isZero) Text(stringResource(R.string.pending_amount, formatMoney(o.pendingAmount)), style = MaterialTheme.typography.bodySmall, color = LocalEtalonColors.current.warning)
                        o.payments.forEach { p ->
                            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    MoneyText(p.amount)
                                    Text("${formatDateTime(p.recordedAt)}${p.recordedByName?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Chip(when (p.status) { uz.etalon.crm.core.model.PaymentStatus.CONFIRMED -> ChipTone.SUCCESS; uz.etalon.crm.core.model.PaymentStatus.REJECTED -> ChipTone.DANGER; else -> ChipTone.WARNING }, stringResource(when (p.status) { uz.etalon.crm.core.model.PaymentStatus.CONFIRMED -> R.string.payment_confirmed; uz.etalon.crm.core.model.PaymentStatus.REJECTED -> R.string.payment_rejected; else -> R.string.payment_pending_confirmation }))
                            }
                        }
                    }
                }
                // 4 · shipments. Once the order is split this lists the trucks; before it is split
                // it is the ONLY way into the split flow (the web app has a dedicated button and
                // Android had nothing), so it also renders empty for an operator who may create
                // one. Tappable only with dispatch.create — every route behind it needs it.
                val canOpenShipments = canOpenShipments(o, me)
                if (o.shipments.isNotEmpty() || canOpenShipments) item {
                    StatusStripeCard(
                        stripe = LocalEtalonColors.current.border,
                        onClick = if (canOpenShipments) onOpenShipments else null,
                    ) {
                        SectionLabel(stringResource(R.string.shipments))
                        if (o.shipments.isEmpty()) {
                            Text(
                                stringResource(R.string.split_into_shipments),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(vertical = 6.dp),
                            )
                        }
                        o.shipments.forEach { sh ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(stringResource(R.string.shipment_n, sh.number), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                    val who = listOfNotNull(sh.driverName, sh.truckIdentifier).joinToString(" · ")
                                    if (who.isNotEmpty()) Text(who, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    // A load queued offline leaves the truck looking untouched; say so
                                    // here so nobody loads it a second time from the shipment list.
                                    if (pending.any { it.shipmentId == sh.id }) {
                                        Text(stringResource(R.string.upload_sending), style = MaterialTheme.typography.bodySmall, color = LocalEtalonColors.current.warning)
                                    }
                                }
                                ShipmentStatusChip(sh.status)
                            }
                        }
                    }
                }
                // 5 · rooms
                item {
                    StatusStripeCard(stripe = LocalEtalonColors.current.border) {
                        SectionLabel(stringResource(R.string.rooms))
                        o.rooms.forEachIndexed { i, rm ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(rm.name ?: stringResource(R.string.room_n, i + 1), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                    Text("${formatDecimal(rm.innerWidth, 2)} × ${formatDecimal(rm.innerLength, 2)} м · ${rm.pattern} · ${rm.beamCount} балка ${formatDecimal(rm.beamLength, 2)} · ${rm.totalBlocks} блок", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                MoneyText(rm.subtotal)
                            }
                        }
                        HorizontalDivider(Modifier.padding(vertical = 6.dp))
                        Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.total_area), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); AreaText(o.summary.totalArea) }
                        if (!o.discountAmount.isZero) Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.discount), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); MoneyText(o.discountAmount) }
                        if (!o.deliveryCost.isZero) Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.delivery), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); MoneyText(o.deliveryCost) }
                        Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.total), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold); MoneyText(o.summary.totalPrice, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold)) }
                    }
                }
                // 6 · photos
                val canAdd = canAddPhoto(o, me)
                if (photos.isNotEmpty() || canAdd) item {
                    SectionLabel(stringResource(R.string.photos))
                    Spacer(Modifier.height(6.dp))
                    PhotoStrip(
                        photos = photos,
                        onOpen = { lightboxAt = it },
                        onAdd = if (canAdd) onAddPhoto else null,
                        onLongPress = onPhotoLongPress,
                    )
                }
                // 7 · timeline
                item {
                    SectionLabel(stringResource(R.string.events))
                    o.events.take(20).forEach { e ->
                        Text("${formatDateTime(e.createdAt)} · ${e.message ?: e.type}${e.actorName?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
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
            dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

/** The order's single next action. [NextStep.None] renders nothing at all — an empty bar would
 *  eat thumb space and read as a disabled action. */
@Composable
private fun NextStepBar(
    step: NextStep,
    onLoadTruck: () -> Unit,
    onDeliveryProof: () -> Unit,
    onOpenShipments: () -> Unit,
) {
    if (step == NextStep.None) return
    StickyActionBar {
        when (step) {
            NextStep.LoadTruck -> PrimaryButton(stringResource(R.string.action_load_truck), onLoadTruck)
            NextStep.DeliveryProof -> PrimaryButton(stringResource(R.string.action_delivery_proof), onDeliveryProof)
            NextStep.ManageShipments -> PrimaryButton(stringResource(R.string.action_shipments), onOpenShipments)
            is NextStep.Blocked -> PrimaryButton(step.reason, onClick = {}, enabled = false)
            NextStep.None -> Unit
        }
    }
}
