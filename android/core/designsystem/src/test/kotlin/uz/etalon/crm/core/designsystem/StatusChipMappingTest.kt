package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.TagFamily
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.discrepancyStatusFamily
import uz.etalon.crm.core.designsystem.components.driverActiveFamily
import uz.etalon.crm.core.designsystem.components.driverActiveLabel
import uz.etalon.crm.core.designsystem.components.family
import uz.etalon.crm.core.designsystem.components.orderStatusLabel
import uz.etalon.crm.core.designsystem.components.orderStatusShortLabel
import uz.etalon.crm.core.designsystem.components.paymentStateFamily
import uz.etalon.crm.core.designsystem.components.paymentStatusFamily
import uz.etalon.crm.core.designsystem.components.shipmentStatusFamily
import uz.etalon.crm.core.designsystem.components.shipmentStatusLabel
import uz.etalon.crm.core.designsystem.components.shipmentStatusShortLabel
import uz.etalon.crm.core.designsystem.components.tagColors
import uz.etalon.crm.core.designsystem.components.discrepancyStatusLabel
import uz.etalon.crm.core.designsystem.components.paymentStatusLabel
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.ShipmentStatus

/**
 * The families and the words every status tag in the app is drawn from.
 *
 * The phase-1 `ChipTone` vocabulary these tests used to assert beside the families was deleted
 * with the chips at the end of phase 5: a tone was a translation step between a status and a
 * colour, and the families replaced it. The labels are the half that was never a shim, and they
 * are asserted here for the same reason they always were — a status word is what an operator
 * reads off a row.
 */
class StatusChipMappingTest {
    @Test fun `a payment's own confirm-reject state has one word per status`() {
        assertEquals(R.string.payment_confirmed, paymentStatusLabel(PaymentStatus.CONFIRMED))
        assertEquals(R.string.payment_pending, paymentStatusLabel(PaymentStatus.PENDING_CONFIRMATION))
        assertEquals(R.string.payment_rejected, paymentStatusLabel(PaymentStatus.REJECTED))
        assertEquals(R.string.status_unknown, paymentStatusLabel(PaymentStatus.UNKNOWN))
    }

    @Test fun `a discrepancy's resolution state has one word per status`() {
        assertEquals(R.string.discrepancy_open, discrepancyStatusLabel(DiscrepancyStatus.OPEN))
        assertEquals(R.string.discrepancy_recovered, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_RECOVERED))
        assertEquals(R.string.discrepancy_discount, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_DISCOUNT))
        assertEquals(R.string.discrepancy_writeoff, discrepancyStatusLabel(DiscrepancyStatus.RESOLVED_WRITEOFF))
        assertEquals(R.string.discrepancy_disputed, discrepancyStatusLabel(DiscrepancyStatus.DISPUTED))
        assertEquals(R.string.status_unknown, discrepancyStatusLabel(DiscrepancyStatus.UNKNOWN))
    }

    @Test fun `all seven order statuses land on the six design 5-1 families`() {
        assertEquals(TagFamily.NEUTRAL, OrderStatus.DRAFT.family())
        assertEquals(TagFamily.NEUTRAL, OrderStatus.PLACED.family())
        assertEquals(TagFamily.LAVENDER, OrderStatus.IN_PRODUCTION.family())
        // Spec v1.3 §2 took LOADED out of IN_PRODUCTION's lavender and gave it its own amber. It still
        // must not share DISPATCHED's, which is what the LegacyExtended shim had collapsed.
        assertEquals(TagFamily.AMBER, OrderStatus.LOADED.family())
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

    /** The acceptance test the design turns on: on each ground every family must be a
     *  distinguishable tags, fill and text alike. */
    @Test fun `each surface draws every family as a distinct fill-text pair`() {
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

    /**
     * R6's shipment overload. The four live states must be four distinguishable tags — ЮКЛАНГАН
     * and ЖЎНАТИЛГАН sharing one fill is the exact bug the families were introduced to fix — and
     * UNKNOWN, which is not a state the business has, sits with PENDING in the neutral one.
     */
    @Test fun `a shipment's four live states are four distinguishable families`() {
        assertEquals(TagFamily.NEUTRAL, shipmentStatusFamily(ShipmentStatus.PENDING))
        assertEquals(TagFamily.LAVENDER, shipmentStatusFamily(ShipmentStatus.LOADED))
        assertEquals(TagFamily.INDIGO, shipmentStatusFamily(ShipmentStatus.DISPATCHED))
        assertEquals(TagFamily.GREEN, shipmentStatusFamily(ShipmentStatus.DELIVERED))
        assertEquals(TagFamily.NEUTRAL, shipmentStatusFamily(ShipmentStatus.UNKNOWN))
        val live = ShipmentStatus.entries.filter { it != ShipmentStatus.UNKNOWN }
        assertEquals(live.size, live.map(::shipmentStatusFamily).toSet().size)
    }

    /** The row wording the shipments list is drawn with, against the full words the order detail
     *  keeps. Three states shorten; the two one-word ones fall back, the way the order table does. */
    @Test fun `only the three moving shipment states have a row form`() {
        assertEquals(R.string.ds_status_shipment_loaded, shipmentStatusShortLabel(ShipmentStatus.LOADED))
        assertEquals(R.string.ds_status_shipment_dispatched, shipmentStatusShortLabel(ShipmentStatus.DISPATCHED))
        assertEquals(R.string.ds_status_shipment_delivered, shipmentStatusShortLabel(ShipmentStatus.DELIVERED))
        listOf(ShipmentStatus.PENDING, ShipmentStatus.UNKNOWN).forEach {
            assertEquals(shipmentStatusLabel(it), shipmentStatusShortLabel(it), "$it should fall back")
        }
        // The row form is a different string from the order status it borrows its word from, so
        // shortening an order tag can never silently reword a truck.
        assertNotEquals(R.string.status_loaded, shipmentStatusShortLabel(ShipmentStatus.LOADED))
        assertNotEquals(R.string.ds_status_dispatched_short, shipmentStatusShortLabel(ShipmentStatus.DISPATCHED))
    }

    /** The driver overload carries the two words the Drivers list is scanned by. */
    @Test fun `a driver reads Фаол or Нофаол, never a status word`() {
        assertEquals(R.string.driver_status_active, driverActiveLabel(true))
        assertEquals(R.string.driver_status_inactive, driverActiveLabel(false))
    }
}
