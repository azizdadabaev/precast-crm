package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class MoneyTest {
    @Test fun `parses the server's decimal string exactly`() {
        assertEquals(BigDecimal("1250000.00"), Money.parse("1250000.00").amount)
        assertEquals(BigDecimal("0"), Money.parse("0").amount)
    }
    @Test fun `rejects non-numeric input`() {
        assertThrows(IllegalArgumentException::class.java) { Money.parse("abc") }
    }
    @Test fun `remaining is total minus paid, never negative`() {
        val total = Money.parse("100.00"); val paid = Money.parse("130.00")
        assertEquals(Money.parse("-30.00"), total - paid)
        assertEquals(Money.ZERO, (total - paid).coerceAtLeastZero())
        assertTrue(Money.ZERO.isZero)
    }
}
