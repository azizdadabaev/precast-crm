package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.ShipmentStatus

/** Which of the three §2 palettes a tag is drawn in. */
enum class TagSurface { ROW_ON_NAVY, ROW_ON_LIGHT, PANEL_ON_INDIGO }

/** The five semantic families every status in the app collapses into (design §5.1). */
internal enum class TagFamily { NEUTRAL, LAVENDER, INDIGO, GREEN, RED }

internal fun OrderStatus.family() = when (this) {
    OrderStatus.DRAFT, OrderStatus.PLACED, OrderStatus.UNKNOWN -> TagFamily.NEUTRAL
    OrderStatus.IN_PRODUCTION, OrderStatus.LOADED -> TagFamily.LAVENDER
    OrderStatus.DISPATCHED -> TagFamily.INDIGO
    OrderStatus.DELIVERED -> TagFamily.GREEN
    OrderStatus.CANCELED -> TagFamily.RED
}

/**
 * The §2 palette table, one row per family and one column per context. `internal` rather than
 * private so [uz.etalon.crm.core.designsystem.StatusTagPaletteTest] can assert the criterion the
 * whole design turns on: on each of the three backgrounds the five families must render as five
 * distinct fill/text pairs.
 */
internal fun tagColors(family: TagFamily, surface: TagSurface): Pair<Color, Color> = when (surface) {
    TagSurface.ROW_ON_NAVY -> when (family) {
        TagFamily.NEUTRAL -> EtalonColors.navy2 to EtalonColors.onDark
        TagFamily.LAVENDER -> EtalonColors.navy2 to EtalonColors.lavender
        TagFamily.INDIGO -> EtalonColors.indigo to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.navy2 to EtalonColors.ink3
        TagFamily.RED -> EtalonColors.navy2 to EtalonColors.debtOnDark
    }
    TagSurface.ROW_ON_LIGHT -> when (family) {
        TagFamily.NEUTRAL -> EtalonColors.surfaceBorder to EtalonColors.ink2
        TagFamily.LAVENDER -> EtalonColors.lavenderBg to EtalonColors.indigo
        TagFamily.INDIGO -> EtalonColors.indigo to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.greenBg to EtalonColors.green
        TagFamily.RED -> EtalonColors.redBg to EtalonColors.red
    }
    TagSurface.PANEL_ON_INDIGO -> when (family) {
        TagFamily.NEUTRAL -> EtalonColors.onDark.copy(alpha = 0.18f) to EtalonColors.onDark
        TagFamily.LAVENDER -> EtalonColors.onDark to EtalonColors.indigo
        TagFamily.INDIGO -> EtalonColors.navy to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.green to EtalonColors.onDark
        TagFamily.RED -> EtalonColors.red to EtalonColors.onDark
    }
}

/** §2 geometry: radius xs, 10/600 (10.5 on a panel), pad 2×7. */
@Composable
internal fun Tag(family: TagFamily, text: String, surface: TagSurface, modifier: Modifier) {
    val (bg, fg) = tagColors(family, surface)
    Text(
        text = text,
        style = if (surface == TagSurface.PANEL_ON_INDIGO) EtalonType.tagPanel else EtalonType.tag,
        color = fg,
        maxLines = 1,
        modifier = modifier.clip(EtalonShapes.xs).background(bg).padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** @param short uses the row-sized wording from the prototype where one exists. */
@Composable
fun StatusTag(
    status: OrderStatus,
    surface: TagSurface = TagSurface.ROW_ON_LIGHT,
    short: Boolean = false,
    modifier: Modifier = Modifier,
) = Tag(
    status.family(),
    stringResource(if (short) orderStatusShortLabel(status) else orderStatusLabel(status)),
    surface,
    modifier,
)

@Composable
fun PaymentStateTag(state: PaymentState, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(paymentStateFamily(state), stringResource(paymentStateLabel(state)), surface, modifier)

@Composable
fun PaymentStatusTag(status: PaymentStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(paymentStatusFamily(status), stringResource(paymentStatusLabel(status)), surface, modifier)

@Composable
fun ShipmentStatusTag(status: ShipmentStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(shipmentStatusFamily(status), stringResource(shipmentStatusLabel(status)), surface, modifier)

@Composable
fun DiscrepancyStatusTag(status: DiscrepancyStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(discrepancyStatusFamily(status), stringResource(discrepancyStatusLabel(status)), surface, modifier)

@Composable
fun DriverStatusTag(active: Boolean, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(driverActiveFamily(active), stringResource(driverActiveLabel(active)), surface, modifier)

/** Order-level paid / partial / unpaid. CLAUDE.md §7 pins the meanings and this restyle keeps
 *  them: paid = the positive family, partial = the accent family, pending = the neutral tag. */
internal fun paymentStateFamily(state: PaymentState) = when (state) {
    PaymentState.FULLY_PAID -> TagFamily.GREEN
    PaymentState.PARTIALLY_PAID -> TagFamily.LAVENDER
    PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> TagFamily.NEUTRAL
}

/** A single recorded payment's confirm/reject state. PENDING_CONFIRMATION is deliberately the
 *  lavender family, not the neutral one — a payment sitting in the owner's confirm queue is work
 *  waiting to be done, not an order that simply has not been paid. See [paymentStatusTone]. */
internal fun paymentStatusFamily(status: PaymentStatus) = when (status) {
    PaymentStatus.CONFIRMED -> TagFamily.GREEN
    PaymentStatus.PENDING_CONFIRMATION -> TagFamily.LAVENDER
    PaymentStatus.REJECTED -> TagFamily.RED
    PaymentStatus.UNKNOWN -> TagFamily.NEUTRAL
}

/** A truck's own progress. It borrows the order statuses' words, so it borrows their families —
 *  which is what finally separates ЮКЛАНГАН from ЖЎНАТИЛГАН on the shipments list. */
internal fun shipmentStatusFamily(status: ShipmentStatus) = when (status) {
    ShipmentStatus.PENDING, ShipmentStatus.UNKNOWN -> TagFamily.NEUTRAL
    ShipmentStatus.LOADED -> TagFamily.LAVENDER
    ShipmentStatus.DISPATCHED -> TagFamily.INDIGO
    ShipmentStatus.DELIVERED -> TagFamily.GREEN
}

/**
 * The five resolutions are five families, so the discrepancies list can be scanned by colour.
 * DISPUTED takes the solid accent rather than sharing RESOLVED_DISCOUNT's soft one: on the web
 * they are `warning` and `primary`, two different colours, and this restyle's job is to keep them
 * apart — a granted discount is settled, an open dispute is not.
 */
internal fun discrepancyStatusFamily(status: DiscrepancyStatus) = when (status) {
    DiscrepancyStatus.OPEN -> TagFamily.RED
    DiscrepancyStatus.RESOLVED_RECOVERED -> TagFamily.GREEN
    DiscrepancyStatus.RESOLVED_DISCOUNT -> TagFamily.LAVENDER
    DiscrepancyStatus.DISPUTED -> TagFamily.INDIGO
    DiscrepancyStatus.RESOLVED_WRITEOFF, DiscrepancyStatus.UNKNOWN -> TagFamily.NEUTRAL
}

internal fun driverActiveFamily(active: Boolean) = if (active) TagFamily.GREEN else TagFamily.NEUTRAL
