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

    // 12:00 on 7 Sep 2026 in Tashkent — every case below is relative to this instant.
    private val now = Instant.parse("2026-09-07T07:00:00Z")
    private fun day(d: String) = Instant.parse("${d}T07:00:00Z")

    @Test fun `a scheduled date inside the week reads as how soon, not which day`() {
        assertEquals("бугун", formatScheduleDate(day("2026-09-07"), now))
        assertEquals("эртага", formatScheduleDate(day("2026-09-08"), now))
        assertEquals("кеча", formatScheduleDate(day("2026-09-06"), now))
        assertEquals("3 кундан кейин", formatScheduleDate(day("2026-09-10"), now))
        assertEquals("7 кундан кейин", formatScheduleDate(day("2026-09-14"), now))
        assertEquals("4 кун олдин", formatScheduleDate(day("2026-09-03"), now))
    }

    @Test fun `beyond the week it is absolute, and carries the year only when it differs`() {
        assertEquals("15 сен", formatScheduleDate(day("2026-09-15"), now))       // 8 days out
        assertEquals("7 кун олдин", formatScheduleDate(day("2026-08-31"), now))  // 7 back is still relative…
        assertEquals("30 авг", formatScheduleDate(day("2026-08-30"), now))       // …8 back is not
        assertEquals("15 мар 2027", formatScheduleDate(day("2027-03-15"), now))
        assertEquals("20 дек 2025", formatScheduleDate(day("2025-12-20"), now))
    }

    @Test fun `relative days are counted in Tashkent time, not UTC`() {
        // 23:30 UTC on 7 Sep is already 04:30 on 8 Sep in Tashkent (+05) — tomorrow, not today.
        assertEquals("эртага", formatScheduleDate(Instant.parse("2026-09-07T23:30:00Z"), now))
    }

    @Test fun `an address keeps province and district ahead of the street, so the street truncates first`() {
        assertEquals(
            "Андижон вилояти · Балиқчи тумани · Бобур кўчаси 14",
            formatAddressLine("Андижон вилояти, Балиқчи тумани, Бобур кўчаси 14"),
        )
        assertEquals("Андижон вилояти · Балиқчи тумани", formatAddressLine("Андижон вилояти, Балиқчи тумани"))
    }

    @Test fun `an address written before the widget existed passes through unchanged`() {
        assertEquals("Samarkand · Registan", formatAddressLine("Samarkand · Registan"))
        assertEquals("Navoi · Center", formatAddressLine("Navoi · Center"))
    }

    @Test fun `a missing or empty address is nothing to render, not an empty separator`() {
        assertEquals(null, formatAddressLine(null))
        assertEquals(null, formatAddressLine(""))
        assertEquals(null, formatAddressLine("   "))
        assertEquals(null, formatAddressLine(" , , "))
        assertEquals("Тошкент шаҳри", formatAddressLine("Тошкент шаҳри, , "))  // trailing blanks dropped
    }
}
