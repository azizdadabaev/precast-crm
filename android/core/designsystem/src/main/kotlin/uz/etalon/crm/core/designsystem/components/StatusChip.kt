package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
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
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
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

/** A driver's own active/inactive flag — a plain Boolean, not an enum, since that is exactly
 *  what [uz.etalon.crm.core.model.Driver.active] is. */
fun driverActiveTone(active: Boolean): ChipTone = if (active) ChipTone.SUCCESS else ChipTone.NEUTRAL
fun driverActiveLabel(active: Boolean): Int = if (active) R.string.driver_status_active else R.string.driver_status_inactive

/** A single payment's own confirm/reject state — distinct from [paymentStateTone], the order-
 *  level paid/partial/pending triad. Fixed product meaning: confirmed is the positive family,
 *  pending is muted, rejected is the danger family.
 *
 *  PENDING_CONFIRMATION here is deliberately WARNING, not NEUTRAL like [paymentStateTone]'s
 *  AWAITING_PAYMENT: this is a recorded payment sitting in the owner's confirm queue — it is
 *  work waiting to be done, not an order that simply hasn't been paid yet. The web renders it
 *  amber with a warning border in payments/orders/gazoblok pages for the same reason. Do not
 *  "fix" the two pendings into agreement — they answer different questions. */
fun paymentStatusTone(s: PaymentStatus): ChipTone = when (s) {
    PaymentStatus.CONFIRMED -> ChipTone.SUCCESS
    PaymentStatus.PENDING_CONFIRMATION -> ChipTone.WARNING
    PaymentStatus.REJECTED -> ChipTone.DANGER
    PaymentStatus.UNKNOWN -> ChipTone.NEUTRAL
}
fun paymentStatusLabel(s: PaymentStatus): Int = when (s) {
    PaymentStatus.CONFIRMED -> R.string.payment_confirmed
    PaymentStatus.PENDING_CONFIRMATION -> R.string.payment_pending // same word, "Кутилмоқда" — no separate string
    PaymentStatus.REJECTED -> R.string.payment_rejected
    PaymentStatus.UNKNOWN -> R.string.status_unknown
}

/** Mirrors DISCREPANCY_STATUS_META in discrepancies/page.tsx. */
fun discrepancyStatusTone(s: DiscrepancyStatus): ChipTone = when (s) {
    DiscrepancyStatus.OPEN -> ChipTone.DANGER
    DiscrepancyStatus.RESOLVED_RECOVERED -> ChipTone.SUCCESS
    DiscrepancyStatus.RESOLVED_DISCOUNT -> ChipTone.PRIMARY
    DiscrepancyStatus.RESOLVED_WRITEOFF -> ChipTone.NEUTRAL
    DiscrepancyStatus.DISPUTED -> ChipTone.WARNING
    DiscrepancyStatus.UNKNOWN -> ChipTone.NEUTRAL
}
fun discrepancyStatusLabel(s: DiscrepancyStatus): Int = when (s) {
    DiscrepancyStatus.OPEN -> R.string.discrepancy_open
    DiscrepancyStatus.RESOLVED_RECOVERED -> R.string.discrepancy_recovered
    DiscrepancyStatus.RESOLVED_DISCOUNT -> R.string.discrepancy_discount
    DiscrepancyStatus.RESOLVED_WRITEOFF -> R.string.discrepancy_writeoff
    DiscrepancyStatus.DISPUTED -> R.string.discrepancy_disputed
    DiscrepancyStatus.UNKNOWN -> R.string.status_unknown
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
            .background(c.copy(alpha = 0.14f), EtalonShapes.pill)
            .border(1.dp, c.copy(alpha = 0.30f), EtalonShapes.pill)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable fun StatusChip(status: OrderStatus, modifier: Modifier = Modifier) =
    Chip(orderStatusTone(status), stringResource(orderStatusLabel(status)), modifier)
@Composable fun PaymentChip(state: PaymentState, modifier: Modifier = Modifier) =
    Chip(paymentStateTone(state), stringResource(paymentStateLabel(state)), modifier)
@Composable fun ShipmentStatusChip(status: ShipmentStatus, modifier: Modifier = Modifier) =
    Chip(shipmentStatusTone(status), stringResource(shipmentStatusLabel(status)), modifier)
@Composable fun DriverStatusChip(active: Boolean, modifier: Modifier = Modifier) =
    Chip(driverActiveTone(active), stringResource(driverActiveLabel(active)), modifier)
@Composable fun PaymentStatusChip(status: PaymentStatus, modifier: Modifier = Modifier) =
    Chip(paymentStatusTone(status), stringResource(paymentStatusLabel(status)), modifier)
@Composable fun DiscrepancyStatusChip(status: DiscrepancyStatus, modifier: Modifier = Modifier) =
    Chip(discrepancyStatusTone(status), stringResource(discrepancyStatusLabel(status)), modifier)
