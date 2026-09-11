package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The one rule three screens share (defect C2): Home's today and recent rows, the Orders rows and
 * the order detail all ask [owesNothing] rather than each deciding for itself what a canceled
 * order owes. Pinning it here means a new status cannot quietly join the set.
 */
class OwesNothingTest {
    @Test fun `only CANCELED owes nothing`() {
        assertTrue(OrderStatus.CANCELED.owesNothing)
        assertEquals(
            listOf(OrderStatus.CANCELED),
            OrderStatus.entries.filter { it.owesNothing },
        )
    }

    @Test fun `every live status still owes its balance`() {
        for (s in listOf(
            OrderStatus.DRAFT, OrderStatus.PLACED, OrderStatus.IN_PRODUCTION,
            OrderStatus.LOADED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED,
            OrderStatus.UNKNOWN,
        )) {
            assertFalse(s.owesNothing, "$s must still draw its balance")
        }
    }
}
