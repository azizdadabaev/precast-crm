package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.ShipmentStatus

/**
 * **Temporary.** The six `*Chip` composables, [Chip], [ChipTone] and [toneColor] survive only so
 * that the twelve feature files naming them keep compiling until their screens are redrawn in
 * phases 2–5. Every one of them is now a thin shim over [StatusTag] and friends, so a screen that
 * has not been redrawn yet is already wearing the new §2 palette.
 *
 * **Do not add a new use of anything below the tone/label tables.** The last task of phase 5
 * deletes the shims, and that deletion must be a pure removal — if it turns into a refactor, this
 * rule was broken. The `*Tone` and `*Label` functions themselves are not shims: `StatusChip`'s
 * callers read the labels, `StatusStripeCard`'s callers read the tones, and both outlive phase 5.
 */

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

/** Row-sized wording from the prototype (`2b-orders.png`); falls back to the full label where the
 *  prototype has no short form. The full words stay in use on panels and detail screens. */
fun orderStatusShortLabel(s: OrderStatus): Int = when (s) {
    OrderStatus.PLACED -> R.string.ds_status_placed_short
    OrderStatus.IN_PRODUCTION -> R.string.ds_status_in_production_short
    OrderStatus.DISPATCHED -> R.string.ds_status_dispatched_short
    else -> orderStatusLabel(s)
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

/** The old tone vocabulary on the new families. WARNING and GOLD used to collapse onto the same
 *  indigo through `LegacyExtended`; here they keep [Chip]'s only remaining caller (the
 *  calculator's pattern chip) on the accent family, and the six typed chips below no longer route
 *  through a tone at all — which is what separates ЮКЛАНГАН from ЖЎНАТИЛГАН again. */
internal fun ChipTone.family() = when (this) {
    ChipTone.PRIMARY, ChipTone.WARNING, ChipTone.GOLD -> TagFamily.LAVENDER
    ChipTone.SUCCESS -> TagFamily.GREEN
    ChipTone.DANGER -> TagFamily.RED
    ChipTone.NEUTRAL -> TagFamily.NEUTRAL
}

/** The old free-form chip, on the new palette: no more uppercase, no more 14 %-tint-and-border. */
@Composable
fun Chip(tone: ChipTone, text: String, modifier: Modifier = Modifier) =
    Tag(tone.family(), text, TagSurface.ROW_ON_LIGHT, modifier)

// ── The six typed chips. Call [StatusTag] and friends instead; these survive so that twelve
// feature files compile until their screens are redrawn in phases 2–5. ──────────────────────────
@Composable fun StatusChip(status: OrderStatus, modifier: Modifier = Modifier) =
    StatusTag(status, TagSurface.ROW_ON_LIGHT, modifier = modifier)
@Composable fun PaymentChip(state: PaymentState, modifier: Modifier = Modifier) =
    PaymentStateTag(state, TagSurface.ROW_ON_LIGHT, modifier)
@Composable fun ShipmentStatusChip(status: ShipmentStatus, modifier: Modifier = Modifier) =
    ShipmentStatusTag(status, TagSurface.ROW_ON_LIGHT, modifier)
@Composable fun DriverStatusChip(active: Boolean, modifier: Modifier = Modifier) =
    DriverStatusTag(active, TagSurface.ROW_ON_LIGHT, modifier)
@Composable fun PaymentStatusChip(status: PaymentStatus, modifier: Modifier = Modifier) =
    PaymentStatusTag(status, TagSurface.ROW_ON_LIGHT, modifier)
@Composable fun DiscrepancyStatusChip(status: DiscrepancyStatus, modifier: Modifier = Modifier) =
    DiscrepancyStatusTag(status, TagSurface.ROW_ON_LIGHT, modifier)
