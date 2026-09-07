package uz.etalon.crm.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal

/**
 * Pins the one rule the whole dashboard slice depends on: `GET /api/dashboard` sends money as a
 * bare JSON *number* (`Math.round(...)` in `dashboard-data.ts`), unlike every other endpoint in
 * this project, which sends a decimal string. A `999 999 999 999` UZS figure — the top of a
 * Decimal(14,2) column — stringifies as `9.99999999999E11` if it ever passes through a `Double`.
 *
 * This test lives here, next to [Money], rather than in `:core:network`, because it is the
 * domain rule the DTOs must honour, not a wire-format detail. [decodeReceivables] mirrors —
 * under the same name — the `JsonPrimitive` → `BigDecimal(content)` decode `:core:network`'s
 * `DashboardDto` implements for real (see `OutstandingReceivablesDto`); `:core:model` has no
 * network dependency, so this local copy exists only to prove the technique survives the
 * ceiling before Task 3 wires it into the actual response type.
 */
class DashboardMoneyTest {
    @Test fun `a dashboard figure at the column ceiling survives without scientific notation`() {
        // 999 999 999 999 as a Double stringifies to 9.99999999999E11.
        val json = """{"total":999999999999,"orderCount":3}"""
        val receivables = decodeReceivables(json)
        assertEquals(Money.parse("999999999999"), receivables.total)
        assertEquals("999999999999", receivables.total.amount.toPlainString())
        assertEquals(3, receivables.orderCount)
    }
}

private data class ReceivablesFixture(val total: Money, val orderCount: Int)

private fun decodeReceivables(json: String): ReceivablesFixture {
    val obj = Json.parseToJsonElement(json).jsonObject
    val total = BigDecimal(obj.getValue("total").jsonPrimitive.content)
    return ReceivablesFixture(Money(total), obj.getValue("orderCount").jsonPrimitive.int)
}
