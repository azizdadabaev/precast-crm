package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.orderStatusTone
import uz.etalon.crm.core.designsystem.components.paymentStateTone
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState

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
}
