package uz.etalon.crm.core.ui.format

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.time.Instant
import java.time.YearMonth

class FormattersTest {
    @Test fun `money is grouped with a thin space and carries no unit`() {
        // U+202F NARROW NO-BREAK SPACE, written as an escape rather than an invisible literal — and
        // unbreakable, so a long figure can never lose its tail to a line break at a group boundary.
        // D8: the unit belongs on hero figures only, so a list row shows the digits alone.
        assertEquals("542\u202F200\u202F000", formatMoney(Money.parse("542200000.00")))
        assertEquals("0", formatMoney(Money.ZERO))
        assertEquals("1\u202F250\u202F001", formatMoney(Money.parse("1250000.50")))   // half-away-from-zero, like round2 then display
        assertEquals("-4\u202F340\u202F840", formatMoney(Money.parse("-4340840.00")))
    }
    @Test fun `a hero figure carries the unit as a prefix`() {
        assertEquals("UZS\u202F53\u202F268\u202F760", formatMoneyHero(Money.parse("53268760.00")))
        assertEquals("UZS\u202F0", formatMoneyHero(Money.ZERO))
    }
    @Test fun `area uses comma decimal, 2 places, and м²`() {
        assertEquals("12,5 м²", formatArea(BigDecimal("12.500")))
        assertEquals("86,4 м²", formatArea(BigDecimal("86.4")))
        assertEquals("100 м²", formatArea(BigDecimal("100.000")))
        // The web shows 2 decimals (formatNumber(o.totalArea, 2)) — staff cross-check the same
        // order's area on the phone and on the desk, so a real 2nd digit must survive here too.
        assertEquals("24,75 м²", formatArea(BigDecimal("24.75")))
    }
    @Test fun `count uses та`() { assertEquals("12 та", formatCount(12)) }
    @Test fun `meters use comma decimal and м`() { assertEquals("4,25 м", formatMeters(4.25)) }
    @Test fun `weight is grouped with a thin space and кг`() {
        // U+202F NARROW NO-BREAK SPACE (D8), written as an escape so the expectation stays readable.
        assertEquals("12\u202F240 кг", formatWeightKg(12240.0))
    }
    /** The order detail derives its weight as an exact BigDecimal (`totalArea × 180`); the
     *  overload must read identically to the Double one and must not show a fraction of a kilo. */
    @Test fun `weight also takes the exact BigDecimal the order detail derives`() {
        assertEquals("14\u202F166 кг", formatWeightKg(BigDecimal("14166")))
        assertEquals("14\u202F166 кг", formatWeightKg(BigDecimal("14165.60")))
    }
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

    @Test fun `a scheduled date is always a calendar date, never a relative phrase`() {
        assertEquals("7 сен", formatScheduleDate(day("2026-09-07"), now))   // today
        assertEquals("8 сен", formatScheduleDate(day("2026-09-08"), now))   // tomorrow
        assertEquals("6 сен", formatScheduleDate(day("2026-09-06"), now))   // yesterday
        assertEquals("15 сен", formatScheduleDate(day("2026-09-15"), now))
        assertEquals("30 авг", formatScheduleDate(day("2026-08-30"), now))
    }

    @Test fun `the year is carried only when it is not the current one`() {
        assertEquals("15 мар 2027", formatScheduleDate(day("2027-03-15"), now))
        assertEquals("20 дек 2025", formatScheduleDate(day("2025-12-20"), now))
    }

    @Test fun `the day is the Tashkent day, not the UTC one`() {
        // 23:30 UTC on 7 Sep is already 04:30 on 8 Sep in Tashkent (+05).
        assertEquals("8 сен", formatScheduleDate(Instant.parse("2026-09-07T23:30:00Z"), now))
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

    @Test fun longDateIsWeekdayDayMonthInUzbekCyrillic() {
        assertEquals("Чоршанба, 9 сентябрь", formatLongDate(Instant.parse("2026-09-08T19:30:00Z"))) // 00:30 on Wed 9 Sep 2026 in Tashkent — the capture's «Сешанба» is the designer's fiction; the real calendar wins
    }
    @Test fun monthYearHeader() { assertEquals("Сентябрь 2026", formatMonthYear(YearMonth.of(2026, 9))) }
    @Test fun orderNoDropsTheYearAndUsesANonBreakingHyphen() {
        assertEquals("№ 09\u20110003", formatOrderNo("2026-09-0003"))
        assertEquals("№ X17", formatOrderNo("X17"))
    }
}
