package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/**
 * The calendar's whole arithmetic, pinned away from the screen. Two things can silently go wrong
 * here and neither shows up as a crash: a tier boundary drawn one square metre off (the web uses
 * `≤`, so exactly 300 m² is still «мавжуд»), and a grid that starts on the wrong weekday, which
 * would shift every load figure by a day without the grid ever looking broken.
 *
 * The tier cases are the web's own (`CapacityCalendar.tsx:75-80`): both sides of each of the three
 * boundaries, plus the four sample totals the design names.
 */
class CapacityModelTest {
    private val d = CapacityThresholds.DEFAULT

    private fun tier(total: Int) = tierFor(BigDecimal(total), d)

    @Test fun `boundaries are inclusive, exactly as the web's tierFor`() {
        assertEquals(CapacityTier.AVAILABLE, tier(0))
        assertEquals(CapacityTier.AVAILABLE, tier(300))
        assertEquals(CapacityTier.MODERATE, tier(301))
        assertEquals(CapacityTier.MODERATE, tier(450))
        assertEquals(CapacityTier.HEAVY, tier(451))
        assertEquals(CapacityTier.HEAVY, tier(600))
        assertEquals(CapacityTier.OVERBOOKED, tier(601))
    }

    @Test fun `the design's four samples land in the four tiers`() {
        assertEquals(
            listOf(
                CapacityTier.AVAILABLE, CapacityTier.MODERATE,
                CapacityTier.HEAVY, CapacityTier.OVERBOOKED,
            ),
            listOf(BigDecimal.ZERO, d.low + BigDecimal.ONE, d.moderate + BigDecimal.ONE, d.heavy + BigDecimal.ONE)
                .map { tierFor(it, d) },
        )
    }

    /** R3: the thresholds come from the server, so the same total must recolour when they change. */
    @Test fun `server thresholds recolour the same total`() {
        val tight = CapacityThresholds(BigDecimal(200), BigDecimal(300), BigDecimal(400))
        assertEquals(CapacityTier.MODERATE, tierFor(BigDecimal(350), d))
        assertEquals(CapacityTier.HEAVY, tierFor(BigDecimal(350), tight))
    }

    /** Scale must not decide a tier: 300.00 is the same boundary as 300. */
    @Test fun `trailing zeros do not move a boundary`() {
        assertEquals(CapacityTier.AVAILABLE, tierFor(BigDecimal("300.00"), d))
        assertEquals(CapacityTier.MODERATE, tierFor(BigDecimal("300.01"), d))
    }

    @Test fun `grid starts on the Monday on or before the first and runs 42 days`() {
        // 1 Sep 2026 is a Tuesday: one leading day.
        assertEquals(LocalDate.of(2026, 8, 31)..LocalDate.of(2026, 10, 11), gridRange(YearMonth.of(2026, 9)))
        // 1 Jun 2026 is a Monday: no leading days at all.
        assertEquals(LocalDate.of(2026, 6, 1)..LocalDate.of(2026, 7, 12), gridRange(YearMonth.of(2026, 6)))
        // 1 Nov 2026 is a Sunday: six leading days, the worst case.
        assertEquals(LocalDate.of(2026, 10, 26)..LocalDate.of(2026, 12, 6), gridRange(YearMonth.of(2026, 11)))
    }

    @Test fun `every grid is exactly six weeks and begins on a Monday`() {
        for (m in 1..12) {
            val r = gridRange(YearMonth.of(2026, m))
            assertEquals(java.time.DayOfWeek.MONDAY, r.start.dayOfWeek, "month $m")
            assertEquals(41L, java.time.temporal.ChronoUnit.DAYS.between(r.start, r.endInclusive), "month $m")
        }
    }

    @Test fun `a day the server never sent reads as zero, not as missing`() {
        val month = month(days = emptyList())
        val empty = month.day(LocalDate.of(2026, 9, 9))
        assertEquals(BigDecimal.ZERO, empty.totalArea)
        assertEquals(0, empty.totalOrders)
        assertEquals(0, empty.totalBlocks)
        assertEquals(LocalDate.of(2026, 9, 9), empty.date)
    }

    /** §4.1: the header's «N буюртма · X м²» counts the cursor month, not the six-week grid —
     *  the leading and trailing days belong to the neighbouring months' totals. */
    @Test fun `month totals ignore the leading and trailing days`() {
        val month = month(
            days = listOf(
                day(LocalDate.of(2026, 8, 31), "120", 2, 300),   // leading, August
                day(LocalDate.of(2026, 9, 1), "230.50", 3, 1216),
                day(LocalDate.of(2026, 9, 30), "69.50", 1, 240),
                day(LocalDate.of(2026, 10, 1), "400", 5, 900),   // trailing, October
            ),
        )
        assertEquals(4, month.totalOrders)
        assertEquals(0, BigDecimal("300.00").compareTo(month.totalArea))
    }

    @Test fun `an empty month totals zero rather than nothing`() {
        val month = month(days = emptyList())
        assertEquals(0, month.totalOrders)
        assertEquals(0, BigDecimal.ZERO.compareTo(month.totalArea))
    }

    private fun day(date: LocalDate, area: String, orders: Int, blocks: Int) =
        CapacityDay(date, BigDecimal(area), orders, blocks)

    private fun month(days: List<CapacityDay>, ym: YearMonth = YearMonth.of(2026, 9)) = CapacityMonth(
        month = ym,
        range = gridRange(ym),
        days = days.associateBy { it.date },
        thresholds = CapacityThresholds.DEFAULT,
    )
}
