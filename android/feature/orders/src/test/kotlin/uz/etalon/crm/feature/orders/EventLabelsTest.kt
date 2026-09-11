package uz.etalon.crm.feature.orders

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uz.etalon.crm.feature.orders.detail.orderEventLabel

/**
 * Defect M6. «Тарих» prints `OrderEventLine.type` when an event has no `message`, and most events
 * have none — so the timeline read «SHIPMENT_DISPATCHED» at an operator who reads Uzbek.
 *
 * [SERVER_EVENT_TYPES] is the Prisma `OrderEventType` enum
 * (`precast-crm/prisma/schema.prisma`) copied out literally, in the order it is declared there.
 * Copied, not derived: the Android build cannot see the Prisma schema, so this list is the only
 * place the two are compared. Adding a type on the server and not here fails this test, which is
 * the point — the alternative is English text reaching a phone unnoticed.
 */
class EventLabelsTest {
    private companion object {
        val SERVER_EVENT_TYPES = listOf(
            "ORDER_PLACED",
            "STATUS_CHANGED",
            "SCHEDULED_DATE_CHANGED",
            "DISCOUNT_APPLIED",
            "ORDER_CANCELED",
            "ORDER_EDITED",
            "NOTE_ADDED",
            "STOCK_WARNING",
            "ORDER_DISPATCHED",
            "DISPATCH_RETURNED",
            "PAYMENT_RECORDED",
            "PAYMENT_HANDED_OVER",
            "PAYMENT_CONFIRMED",
            "PAYMENT_REJECTED",
            "PAYMENT_ADJUSTED",
            "DISCREPANCY_OPENED",
            "DISCREPANCY_RESOLVED",
            "ORDER_LOADED",
            "SHIPMENT_CREATED",
            "SHIPMENT_LOADED",
            "SHIPMENT_DISPATCHED",
            "SHIPMENT_DELIVERED",
        )
    }

    @Test
    fun `every server event type has its own wording`() {
        for (type in SERVER_EVENT_TYPES) {
            assertNotNull(orderEventLabel(type), "$type has no Uzbek wording in orderEventLabel")
        }
    }

    /** Distinct resources, not one string reused: two different events must not read alike. */
    @Test
    fun `no two event types share a string`() {
        val ids = SERVER_EVENT_TYPES.mapNotNull(::orderEventLabel)
        val duplicated = ids.groupBy { it }.filterValues { it.size > 1 }.keys
        assert(duplicated.isEmpty()) { "string resources reused by more than one event type: $duplicated" }
    }

    /** An unrecognised type falls through to «Ҳодиса» at the call site rather than being guessed
     *  at here — the raw enum name never reaches the screen either way. */
    @Test
    fun `an unknown type has no wording of its own`() {
        assertNull(orderEventLabel("SOMETHING_NEW_ON_THE_SERVER"))
        assertNull(orderEventLabel(""))
    }
}
