package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.ShipmentStatus

enum class ChipTone { PRIMARY, SUCCESS, WARNING, DANGER, GOLD, NEUTRAL }

/** Mirrors STATUS_META in orders/page.tsx. */
fun orderStatusTone(s: OrderStatus): ChipTone = when (s) {
    OrderStatus.PLACED -> ChipTone.PRIMARY
    OrderStatus.IN_PRODUCTION, OrderStatus.LOADED -> ChipTone.WARNING
    OrderStatus.DISPATCHED -> ChipTone.GOLD
    OrderStatus.DELIVERED -> ChipTone.SUCCESS
    OrderStatus.CANCELED -> ChipTone.DANGER
    OrderStatus.DRAFT, OrderStatus.UNKNOWN -> ChipTone.NEUTRAL
}
/** Spec §6.1 payment triad. */
fun paymentStateTone(p: PaymentState): ChipTone = when (p) {
    PaymentState.FULLY_PAID -> ChipTone.SUCCESS
    PaymentState.PARTIALLY_PAID -> ChipTone.PRIMARY
    PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> ChipTone.NEUTRAL
}

fun orderStatusLabel(s: OrderStatus): Int = when (s) {
    OrderStatus.PLACED -> R.string.status_placed
    OrderStatus.IN_PRODUCTION -> R.string.status_in_production
    OrderStatus.LOADED -> R.string.status_loaded
    OrderStatus.DISPATCHED -> R.string.status_dispatched
    OrderStatus.DELIVERED -> R.string.status_delivered
    OrderStatus.CANCELED -> R.string.status_canceled
    OrderStatus.DRAFT, OrderStatus.UNKNOWN -> R.string.status_unknown
}
fun paymentStateLabel(p: PaymentState): Int = when (p) {
    PaymentState.FULLY_PAID -> R.string.payment_paid
    PaymentState.PARTIALLY_PAID -> R.string.payment_partial
    PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> R.string.payment_pending
}

/** A truck's own PENDING/LOADED/DISPATCHED/DELIVERED progress (`ShipmentLine.status`),
 *  distinct from the order-level [OrderStatus] above but sharing its words. */
fun shipmentStatusTone(s: ShipmentStatus): ChipTone = when (s) {
    ShipmentStatus.PENDING -> ChipTone.NEUTRAL
    ShipmentStatus.LOADED -> ChipTone.WARNING
    ShipmentStatus.DISPATCHED -> ChipTone.GOLD
    ShipmentStatus.DELIVERED -> ChipTone.SUCCESS
    ShipmentStatus.UNKNOWN -> ChipTone.NEUTRAL
}
fun shipmentStatusLabel(s: ShipmentStatus): Int = when (s) {
    ShipmentStatus.PENDING -> R.string.payment_pending // same word, "Кутилмоқда" — no separate string
    ShipmentStatus.LOADED -> R.string.status_loaded
    ShipmentStatus.DISPATCHED -> R.string.status_dispatched
    ShipmentStatus.DELIVERED -> R.string.status_delivered
    ShipmentStatus.UNKNOWN -> R.string.status_unknown
}

@Composable
fun toneColor(t: ChipTone): Color {
    val ext = LocalEtalonColors.current
    return when (t) {
        ChipTone.PRIMARY -> MaterialTheme.colorScheme.primary
        ChipTone.SUCCESS -> ext.success
        ChipTone.WARNING -> ext.warning
        ChipTone.DANGER -> ext.danger
        ChipTone.GOLD -> ext.gold
        ChipTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/** Text colour on a 14 % tint, 30 % border — never a solid fill (spec §6.1). */
@Composable
fun Chip(tone: ChipTone, text: String, modifier: Modifier = Modifier) {
    val c = toneColor(tone)
    Text(
        text = text.uppercase(),
        style = EtalonType.mono.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.08.sp, color = c),
        modifier = modifier
            .background(c.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .border(1.dp, c.copy(alpha = 0.30f), RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable fun StatusChip(status: OrderStatus, modifier: Modifier = Modifier) =
    Chip(orderStatusTone(status), stringResource(orderStatusLabel(status)), modifier)
@Composable fun PaymentChip(state: PaymentState, modifier: Modifier = Modifier) =
    Chip(paymentStateTone(state), stringResource(paymentStateLabel(state)), modifier)
@Composable fun ShipmentStatusChip(status: ShipmentStatus, modifier: Modifier = Modifier) =
    Chip(shipmentStatusTone(status), stringResource(shipmentStatusLabel(status)), modifier)
