package uz.etalon.crm.core.testing

import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.gridRange
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.YearMonth

/**
 * **One September, for every module.** The capacity calendar is drawn in `:core:designsystem`,
 * mounted in `:feature:orders` and reused by `:feature:calculator`, and each of them photographs
 * the same month. A second copy of these numbers in a second module is a second month the day the
 * first one is edited — so the fixture lives here, on the shared test classpath, and the three
 * acceptance days below are the ones the owner checks against the web
 * (`ORDERS_TAB_BUILD_BRIEF.md` §4, design §9).
 *
 * September 2026 starts on a Tuesday, so the six-week grid runs 31 Aug → 11 Oct: one leading
 * adjacent day and eleven trailing ones, which is exactly the shape the owner's web screenshot
 * shows.
 */
object CalendarFixtures {
    val MONTH: YearMonth = YearMonth.of(2026, 9)

    /** «Бугун» in every calendar baseline: the acceptance's own 12 September. */
    val TODAY: LocalDate = LocalDate.of(2026, 9, 12)

    /** The day the baselines select — 685 м² on a 600 м² ceiling, the Overbooked cell. */
    val SELECTED: LocalDate = TODAY

    /** The server's defaults, and what the owner's screenshot was taken against. */
    val THRESHOLDS = CapacityThresholds(BigDecimal(300), BigDecimal(450), BigDecimal(600))

    /** The «recoloured» run of design §9: the same payload under a tighter factory. */
    val TIGHT_THRESHOLDS = CapacityThresholds(BigDecimal(200), BigDecimal(300), BigDecimal(400))

    /**
     * The web's September, day by day: `day of month` to `orders` to `m²`.
     *
     * The three the brief pins are exact — 2 Sep = 5 / 204, 8 Sep = 7 / 525, 12 Sep = 5 / 685 —
     * and the rest are read off the owner's screenshot of the same month so the grid's *shape*
     * (where the colour sits, where the month breathes) can be compared and not just three cells.
     */
    private val DAYS: List<Triple<Int, Int, String>> = listOf(
        Triple(2, 5, "204.00"), Triple(3, 3, "185.00"), Triple(4, 5, "375.00"),
        Triple(5, 4, "130.00"), Triple(6, 1, "334.00"), Triple(7, 4, "166.00"),
        Triple(8, 7, "525.00"), Triple(9, 3, "312.00"), Triple(10, 4, "96.00"),
        Triple(11, 7, "482.00"), Triple(12, 5, "685.00"), Triple(13, 1, "10.00"),
        Triple(14, 6, "290.00"), Triple(15, 3, "204.00"), Triple(16, 3, "240.00"),
        Triple(17, 3, "238.00"), Triple(19, 1, "36.00"), Triple(21, 1, "40.00"),
    )

    /**
     * Blocks per m² of finished flooring, near enough for a fixture: the design's own example day
     * is 3 orders / 230 м² / 1 216 ғишт, which is 5,3 blocks to the square metre. Deriving the
     * count rather than typing eighteen more numbers keeps the sheet's «N ғишт» line consistent
     * with the m² beside it, which is the only thing a reviewer can check about it.
     */
    private val BLOCKS_PER_M2 = BigDecimal("5.3")

    fun day(d: Int): CapacityDay = september.day(MONTH.atDay(d))

    /** The month as the repository would hand it over, thresholds and all. */
    val september: CapacityMonth = month(THRESHOLDS)

    /** The same days under [TIGHT_THRESHOLDS] — every cell one tier warmer. */
    val septemberTight: CapacityMonth = month(TIGHT_THRESHOLDS)

    private fun month(t: CapacityThresholds) = CapacityMonth(
        month = MONTH,
        range = gridRange(MONTH),
        days = DAYS.associate { (d, orders, area) ->
            val date = MONTH.atDay(d)
            val m2 = BigDecimal(area)
            date to CapacityDay(
                date = date,
                totalArea = m2,
                totalOrders = orders,
                totalBlocks = m2.multiply(BLOCKS_PER_M2).setScale(0, RoundingMode.HALF_UP).toInt(),
            )
        },
        thresholds = t,
    )
}
