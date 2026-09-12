package uz.etalon.crm.feature.orders

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uz.etalon.crm.feature.orders.detail.eventMessage
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

    /**
     * I4. Each of these is the sentence the web actually writes, copied out of its route — the
     * carve-out has to drop every one of them so «Тарих» falls back to the Uzbek label. `null`
     * means «use the label».
     */
    @Test
    fun `the desk's English sentences are not printed`() {
        val english = mapOf(
            "ORDER_PLACED" to "Order placed for Yusupov & Sons",
            "STATUS_CHANGED" to "Delivered — proof photo uploaded",
            "SCHEDULED_DATE_CHANGED" to "Schedule moved: 2026-08-30T06:00:00.000Z → 2026-09-02T06:00:00.000Z",
            "ORDER_EDITED" to "Order edited: total 13350000 → 13550000 (3 rooms)",
            "NOTE_ADDED" to "Client contact corrected · name → Yusupov & Sons",
            "STOCK_WARNING" to "Stock went negative for Beam 4.30 m (now -12). Reconcile production log.",
            "ORDER_DISPATCHED" to "Dispatched: driver Aziz, expected collection 6000000",
            "DISPATCH_RETURNED" to "Driver returned to office",
            "PAYMENT_RECORDED" to "6000000 UZS in cash recorded at office — awaiting handover and confirmation",
            "PAYMENT_HANDED_OVER" to "Cash handed over to office (payment a1b2c3)",
            "PAYMENT_CONFIRMED" to "Payment a1b2c3 confirmed: 6000000",
            "PAYMENT_REJECTED" to "Payment a1b2c3 rejected: no receipt",
            "PAYMENT_ADJUSTED" to "Payment a1b2c3 adjusted: 6000000 → 5900000",
            "DISCREPANCY_OPENED" to "Discrepancy OPEN: short by 100000 (WRITE_OFF)",
            "DISCREPANCY_RESOLVED" to "Discrepancy a1b2c3: OPEN → RESOLVED",
        )
        for ((type, message) in english) {
            assertNull(eventMessage(type, message), "$type still prints the server's English: $message")
        }
    }

    /**
     * The other half of the same rule. A route that already writes Uzbek for one of those types
     * (`order-load.ts`, `settle-remaining`), and an operator's own words quoted inside an English
     * sentence, both carry more than the bare label does — so they are printed.
     */
    @Test
    fun `a message carrying Uzbek is printed even for a carved-out type`() {
        assertEquals(
            "Ишлаб чиқаришга ўтказилди",
            eventMessage("STATUS_CHANGED", "Ишлаб чиқаришга ўтказилди"),
        )
        assertEquals(
            "Қолдиқ ҳисобдан чиқарилди · Remaining written off: 100000 (round-down)",
            eventMessage("DISCREPANCY_RESOLVED", "Қолдиқ ҳисобдан чиқарилди · Remaining written off: 100000 (round-down)"),
        )
        assertEquals(
            "Payment a1b2c3 rejected: Чек йўқ",
            eventMessage("PAYMENT_REJECTED", "Payment a1b2c3 rejected: Чек йўқ"),
        )
    }

    /**
     * The types the carve-out must NOT touch: `ORDER_CANCELED` carries the operator's own reason
     * (in whatever script they typed it), and the shipment routes write Uzbek already — a label
     * instead of «Жўнатма 2 юкланди» would lose which truck.
     */
    @Test
    fun `types the server does not write English for keep their message`() {
        assertEquals("mijoz bekor qildi", eventMessage("ORDER_CANCELED", "mijoz bekor qildi"))
        assertEquals("Жўнатма 2 юкланди", eventMessage("SHIPMENT_LOADED", "Жўнатма 2 юкланди"))
        assertEquals("Юк машинасига юкланди", eventMessage("ORDER_LOADED", "Юк машинасига юкланди"))
    }

    /** An event with no message at all reads as its label whatever its type — every branch of the
     *  carve-out has to survive a null. */
    @Test
    fun `no message means the label`() {
        assertNull(eventMessage("ORDER_PLACED", null))
        assertNull(eventMessage("SHIPMENT_LOADED", null))
    }
}
