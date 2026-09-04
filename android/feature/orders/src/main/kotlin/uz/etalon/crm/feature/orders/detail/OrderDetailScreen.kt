package uz.etalon.crm.feature.orders.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.*
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.*
import uz.etalon.crm.feature.orders.R

/** Adaptation: the brief's ViewModel reads `orderId` from a Nav `SavedStateHandle`. Task 10 (Nav 3)
 *  hasn't landed yet, so this route takes `orderId` explicitly and resolves the ViewModel through
 *  an assisted-injection factory (`OrderDetailViewModel.Factory`) instead — keeping this screen
 *  independent of Nav 3 wiring details. */
@Composable
fun OrderDetailRoute(orderId: String, onBack: () -> Unit, vm: OrderDetailViewModel = hiltViewModel<OrderDetailViewModel, OrderDetailViewModel.Factory>(creationCallback = { it.create(orderId) })) {
    val r by vm.state.collectAsStateWithLifecycle()
    OrderDetailScreen(r, onBack, vm::refresh)
}

private val FLOW = listOf(OrderStatus.PLACED, OrderStatus.LOADED, OrderStatus.DELIVERED)
private fun OrderStatus.collapsed() = when (this) { OrderStatus.IN_PRODUCTION -> OrderStatus.PLACED; OrderStatus.DISPATCHED -> OrderStatus.LOADED; else -> this }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(r: Resource<OrderDetail>, onBack: () -> Unit, onRefresh: () -> Unit) {
    val o = r.dataOrNull
    val ctx = LocalContext.current
    Scaffold(topBar = {
        TopAppBar(title = { Text(o?.summary?.orderNumber ?: "", style = EtalonType.monoTitle) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } })
    }) { pad ->
        PullToRefreshBox(isRefreshing = r is Resource.Loading && o == null, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                if (r is Resource.Error) item { ErrorBanner(r.error.message, onRetry = onRefresh) }
                if (o == null) return@LazyColumn
                // 1 · header
                item {
                    StatusStripeCard(stripe = toneColor(orderStatusTone(o.summary.status))) {
                        Text(o.summary.client.name, style = MaterialTheme.typography.titleMedium)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(formatPhone(o.summary.client.phone), style = EtalonType.monoBody, color = MaterialTheme.colorScheme.primary)
                            IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+${o.summary.client.phone}"))) }) { Icon(Icons.Default.Call, stringResource(R.string.action_call)) }
                            if (o.deliveryLat != null && o.deliveryLng != null) IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${o.deliveryLat},${o.deliveryLng}?q=${o.deliveryLat},${o.deliveryLng}"))) }) { Icon(Icons.Default.Navigation, stringResource(R.string.action_navigate)) }
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
                // 4 · rooms
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
                // 5 · photos
                val photos = o.loadedPhotoUrls + listOfNotNull(o.deliveryProofUrl)
                if (photos.isNotEmpty()) item {
                    SectionLabel(stringResource(R.string.photos))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                        items(photos) { url -> AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(120.dp)) }
                    }
                }
                // 6 · timeline
                item {
                    SectionLabel(stringResource(R.string.events))
                    o.events.take(20).forEach { e ->
                        Text("${formatDateTime(e.createdAt)} · ${e.message ?: e.type}${e.actorName?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
}
