package uz.etalon.crm.core.ui.format

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.time.Instant

class FormattersTest {
    @Test fun `money uses space thousands, no decimals, UZS suffix`() {
        assertEquals("542 200 000 UZS", formatMoney(Money.parse("542200000.00")))
        assertEquals("0 UZS", formatMoney(Money.ZERO))
        assertEquals("1 250 001 UZS", formatMoney(Money.parse("1250000.50")))   // half-away-from-zero, like round2→display
    }
    @Test fun `area uses comma decimal and м²`() {
        assertEquals("12,5 м²", formatArea(BigDecimal("12.500")))
        assertEquals("86,4 м²", formatArea(BigDecimal("86.4")))
        assertEquals("100 м²", formatArea(BigDecimal("100.000")))
    }
    @Test fun `count uses та`() { assertEquals("12 та", formatCount(12)) }
    @Test fun `phone renders +998 90 111 22 33 from digits`() {
        assertEquals("+998 90 111 22 33", formatPhone("998901112233"))
        assertEquals("+998 90 111 22 33", formatPhone("901112233"))
        assertEquals("12345", formatPhone("12345")) // unknown shape: returned as-is
    }
    @Test fun `dates use the hand-rolled Uzbek months in Tashkent time`() {
        val t = Instant.parse("2026-09-04T23:30:00Z") // 04:30 on 5 Sep in Tashkent (+05)
        assertEquals("5 сен 2026", formatDate(t))
        assertEquals("5 сен 2026, 04:30", formatDateTime(t))
    }
}
