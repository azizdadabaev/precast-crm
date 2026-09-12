package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.TagFamily
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.discrepancyStatusFamily
import uz.etalon.crm.core.designsystem.components.driverActiveFamily
import uz.etalon.crm.core.designsystem.components.family
import uz.etalon.crm.core.designsystem.components.orderStatusLabel
import uz.etalon.crm.core.designsystem.components.orderStatusShortLabel
import uz.etalon.crm.core.designsystem.components.paymentStateFamily
import uz.etalon.crm.core.designsystem.components.paymentStatusFamily
import uz.etalon.crm.core.designsystem.components.shipmentStatusFamily
import uz.etalon.crm.core.designsystem.components.tagColors
import uz.etalon.crm.core.designsystem.components.discrepancyStatusLabel
import uz.etalon.crm.core.designsystem.components.discrepancyStatusTone
import uz.etalon.crm.core.designsystem.components.driverActiveTone
import uz.etalon.crm.core.designsystem.components.orderStatusTone
import uz.etalon.crm.core.designsystem.components.paymentStateTone
import uz.etalon.crm.core.designsystem.components.paymentStatusLabel
import uz.etalon.crm.core.designsystem.components.paymentStatusTone
import uz.etalon.crm.core.designsystem.components.shipmentStatusTone
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.ShipmentStatus

class StatusChipMappingTest {
    @Test fun `order statuses map to the web's chip variants`() {
        assertEquals(ChipTone.PRIMARY, orderStatusTone(OrderStatus.PLACED))
        assertEquals(ChipTone.WARNING, orderStatusTone(OrderStatus.IN_PRODUCTION))
        assertEquals(ChipTone.WARNING, orderStatusTone(OrderStatus.LOADED))
        assertEquals(ChipTone.GOLD, orderStatusTone(OrderStatus.DISPATCHED))
        assertEquals(ChipTone.SUCCESS, orderStatusTone(OrderStatus.DELIVERED))
        assertEquals(ChipTone.DANGER, orderStatusTone(OrderStatus.CANCELED))
        assertEquals(ChipTone.NEUTRAL, orderStatusTone(OrderStatus.UNKNOWN))
    }
    @Test fun `payment triad is paid=success, partial=primary, pending=neutral`() {
        assertEquals(ChipTone.SUCCESS, paymentStateTone(PaymentState.FULLY_PAID))
        assertEquals(ChipTone.PRIMARY, paymentStateTone(PaymentState.PARTIALLY_PAID))
        assertEquals(ChipTone.NEUTRAL, paymentStateTone(PaymentState.AWAITING_PAYMENT))
    }
    @Test fun `a shipment's own progress mirrors the order chip's words`() {
        assertEquals(ChipTone.NEUTRAL, shipmentStatusTone(ShipmentStatus.PENDING))
        assertEquals(ChipTone.WARNING, shipmentStatusTone(ShipmentStatus.LOADED))
        assertEquals(ChipTone.GOLD, shipmentStatusTone(ShipmentStatus.DISPATCHED))
        assertEquals(ChipTone.SUCCESS, shipmentStatusTone(ShipmentStatus.DELIVERED))
        assertEquals(ChipTone.NEUTRAL, shipmentStatusTone(ShipmentStatus.UNKNOWN))
    }
    @Test fun `a driver's active flag is success, inactive is neutral`() {
        assertEquals(ChipTone.SUCCESS, driverActiveTone(true))
        assertEquals(ChipTone.NEUTRAL, driverActiveTone(false))
    }
    @Test fun `a payment's own confirm-reject state is confirmed=success, pending=warning, rejected=danger`() {
        assertEquals(ChipTone.SUCCESS, paymentStatusTone(PaymentStatus.CONFIRMED))
        assertEquals(R.string.payment_confirmed, paymentStatusLabel(PaymentStatus.CONFIRMED))
        // Warning, not neutral: this is the owner's confirm queue — a recorded payment waiting
        // on them, distinct from paymentStateTone's AWAITING_PAYMENT (an order simply unpaid).
        assertEquals(ChipTone.WARNING, paymentStatusTone(PaymentStatus.PENDING_CONFIRMATION))
        assertEquals(R.string.payment_pending, paymentStatusLabel(PaymentStatus.PENDING_CONFIRMATION))
        assertEquals(ChipTone.DANGER, paymentStatusTone(PaymentStatus.REJECTED))
        assertEquals(R.string.payment_rejected, paymentStatusLabel(PaymentStatus.REJECTED))
        assertEquals(ChipTone.NEUTRAL, paymentStatusTone(PaymentStatus.UNKNOWN))
        assertEquals(R.string.status_unknown, paymentStatusLabel(PaymentStatus.UNKNOWN))
    }
    @Test fun `a discrepancy's resolution state has one tone and label per status`() {
        assertEquals(ChipTone.DANGER, discrepancyStatusTone(DiscrepancyStatus.OPEN))
        assertEquals(R.string.discrepancy_open, discrepancyStatusLabel(DiscrepancyStatus.OPEN))
        assertEquals(ChipTone.SUCCESS, discrepancyStatusTone(DiscrepancyStatus.RESOLVED_RECOVERED))
        assertEquals(R.string.discrepancy_recovered, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_RECOVERED))
        assertEquals(ChipTone.PRIMARY, discrepancyStatusTone(DiscrepancyStatus.RESOLVED_DISCOUNT))
        assertEquals(R.string.discrepancy_discount, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_DISCOUNT))
        assertEquals(ChipTone.NEUTRAL, discrepancyStatusTone(DiscrepancyStatus.RESOLVED_WRITEOFF))
        assertEquals(R.string.discrepancy_writeoff, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_WRITEOFF))
        assertEquals(ChipTone.WARNING, discrepancyStatusTone(DiscrepancyStatus.DISPUTED))
        assertEquals(R.string.discrepancy_disputed, discrepancyStatusLabel(DiscrepancyStatus.DISPUTED))
        assertEquals(ChipTone.NEUTRAL, discrepancyStatusTone(DiscrepancyStatus.UNKNOWN))
        assertEquals(R.string.status_unknown, discrepancyStatusLabel(DiscrepancyStatus.UNKNOWN))
    }

    // ── The new §2 vocabulary. The tone tables above stay as they are because the features and
    // `StatusStripeCard` still read them; these assert the families the tags actually draw. ─────

    @Test fun `all seven order statuses land on the five design 5-1 families`() {
        assertEquals(TagFamily.NEUTRAL, OrderStatus.DRAFT.family())
        assertEquals(TagFamily.NEUTRAL, OrderStatus.PLACED.family())
        assertEquals(TagFamily.LAVENDER, OrderStatus.IN_PRODUCTION.family())
        // Design §5.1 lets LOADED share IN_PRODUCTION's palette — both are "in the yard" — but it
        // must not share DISPATCHED's, which is what the LegacyExtended shim had collapsed.
        assertEquals(TagFamily.LAVENDER, OrderStatus.LOADED.family())
        assertEquals(TagFamily.INDIGO, OrderStatus.DISPATCHED.family())
        assertEquals(TagFamily.GREEN, OrderStatus.DELIVERED.family())
        assertEquals(TagFamily.RED, OrderStatus.CANCELED.family())
        assertEquals(TagFamily.NEUTRAL, OrderStatus.UNKNOWN.family())
    }

    @Test fun `a truck's own progress separates loaded from dispatched`() {
        assertEquals(TagFamily.NEUTRAL, shipmentStatusFamily(ShipmentStatus.PENDING))
        assertEquals(TagFamily.LAVENDER, shipmentStatusFamily(ShipmentStatus.LOADED))
        assertEquals(TagFamily.INDIGO, shipmentStatusFamily(ShipmentStatus.DISPATCHED))
        assertEquals(TagFamily.GREEN, shipmentStatusFamily(ShipmentStatus.DELIVERED))
        assertEquals(TagFamily.NEUTRAL, shipmentStatusFamily(ShipmentStatus.UNKNOWN))
    }

    @Test fun `both payment triads keep their fixed meanings`() {
        assertEquals(TagFamily.GREEN, paymentStateFamily(PaymentState.FULLY_PAID))
        assertEquals(TagFamily.LAVENDER, paymentStateFamily(PaymentState.PARTIALLY_PAID))
        assertEquals(TagFamily.NEUTRAL, paymentStateFamily(PaymentState.AWAITING_PAYMENT))
        assertEquals(TagFamily.NEUTRAL, paymentStateFamily(PaymentState.UNKNOWN))

        assertEquals(TagFamily.GREEN, paymentStatusFamily(PaymentStatus.CONFIRMED))
        // Lavender, not neutral: the owner's confirm queue is work waiting, and it must not look
        // like an order that simply has not been paid.
        assertEquals(TagFamily.LAVENDER, paymentStatusFamily(PaymentStatus.PENDING_CONFIRMATION))
        assertEquals(TagFamily.RED, paymentStatusFamily(PaymentStatus.REJECTED))
        assertEquals(TagFamily.NEUTRAL, paymentStatusFamily(PaymentStatus.UNKNOWN))
    }

    @Test fun `the five discrepancy resolutions are five distinguishable tags`() {
        assertEquals(TagFamily.RED, discrepancyStatusFamily(DiscrepancyStatus.OPEN))
        assertEquals(TagFamily.GREEN, discrepancyStatusFamily(DiscrepancyStatus.RESOLVED_RECOVERED))
        assertEquals(TagFamily.LAVENDER, discrepancyStatusFamily(DiscrepancyStatus.RESOLVED_DISCOUNT))
        assertEquals(TagFamily.NEUTRAL, discrepancyStatusFamily(DiscrepancyStatus.RESOLVED_WRITEOFF))
        // Not RESOLVED_DISCOUNT's family: they are `primary` and `warning` on the web, two
        // colours, and the discrepancies list is scanned by colour.
        assertEquals(TagFamily.INDIGO, discrepancyStatusFamily(DiscrepancyStatus.DISPUTED))
        assertEquals(TagFamily.NEUTRAL, discrepancyStatusFamily(DiscrepancyStatus.UNKNOWN))
        val resolutions = DiscrepancyStatus.entries.filter { it != DiscrepancyStatus.UNKNOWN }
        assertEquals(resolutions.size, resolutions.map(::discrepancyStatusFamily).toSet().size)
    }

    @Test fun `a driver's active flag is the positive family, inactive the neutral one`() {
        assertEquals(TagFamily.GREEN, driverActiveFamily(true))
        assertEquals(TagFamily.NEUTRAL, driverActiveFamily(false))
    }

    /** The acceptance test the design turns on: on each ground the five families must be five
     *  distinguishable tags, fill and text alike. */
    @Test fun `each surface draws the five families as five distinct fill-text pairs`() {
        TagSurface.entries.forEach { surface ->
            val drawn = TagFamily.entries.map { tagColors(it, surface) }
            assertEquals(TagFamily.entries.size, drawn.toSet().size, "$surface reuses a fill/text pair")
            drawn.forEach { (bg, fg) -> assertNotEquals(bg, fg, "$surface draws a tag in one colour") }
        }
    }

    @Test fun `only the three the prototype shortens have a short label`() {
        assertEquals(R.string.ds_status_placed_short, orderStatusShortLabel(OrderStatus.PLACED))
        assertEquals(R.string.ds_status_in_production_short, orderStatusShortLabel(OrderStatus.IN_PRODUCTION))
        assertEquals(R.string.ds_status_dispatched_short, orderStatusShortLabel(OrderStatus.DISPATCHED))
        listOf(
            OrderStatus.DRAFT, OrderStatus.LOADED, OrderStatus.DELIVERED,
            OrderStatus.CANCELED, OrderStatus.UNKNOWN,
        ).forEach { assertEquals(orderStatusLabel(it), orderStatusShortLabel(it), "$it should fall back") }
    }

    /**
     * A draft is a state the business has a word for. It used to borrow «Номаълум», which says the
     * app failed to read the status rather than that nothing has been placed yet — and phase 3's
     * clients and payments lists put unplaced calculations next to real orders, where that reads as
     * a bug. Short and long are the same word: «Лойиҳа» already fits a row tag.
     */
    @Test fun `a draft says Лойиҳа, and only a genuinely unknown status says Номаълум`() {
        assertEquals(R.string.ds_status_draft, orderStatusLabel(OrderStatus.DRAFT))
        assertEquals(R.string.ds_status_draft, orderStatusShortLabel(OrderStatus.DRAFT))
        assertNotEquals(R.string.status_unknown, orderStatusLabel(OrderStatus.DRAFT))
        assertEquals(R.string.status_unknown, orderStatusLabel(OrderStatus.UNKNOWN))
        // The family is unchanged: a draft is still the quiet neutral tag, not a new colour.
        assertEquals(TagFamily.NEUTRAL, OrderStatus.DRAFT.family())
    }

    /** The six chips are shims now; the tone tables they used to read are still the ones the
     *  stripe cards read, so both vocabularies have to stay reachable and in step. */
    @Test fun `the old tone table and the new family table agree on the positive and danger ends`() {
        OrderStatus.entries.forEach { s ->
            when (orderStatusTone(s)) {
                ChipTone.SUCCESS -> assertSame(TagFamily.GREEN, s.family())
                ChipTone.DANGER -> assertSame(TagFamily.RED, s.family())
                else -> Unit
            }
        }
    }
}
