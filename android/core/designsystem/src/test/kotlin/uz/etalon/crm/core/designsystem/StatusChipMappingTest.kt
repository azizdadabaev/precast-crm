package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.ChipTone
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
    @Test fun `a payment's own confirm-reject state is confirmed=success, pending=neutral, rejected=danger`() {
        assertEquals(ChipTone.SUCCESS, paymentStatusTone(PaymentStatus.CONFIRMED))
        assertEquals(R.string.payment_confirmed, paymentStatusLabel(PaymentStatus.CONFIRMED))
        assertEquals(ChipTone.NEUTRAL, paymentStatusTone(PaymentStatus.PENDING_CONFIRMATION))
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
}
