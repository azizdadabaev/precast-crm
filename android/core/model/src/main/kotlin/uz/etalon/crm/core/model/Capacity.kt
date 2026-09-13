package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/**
 * The production calendar's load model (design §4.3, §6). A day's load is an **area** in m², not
 * money, but it is decimal on the wire and every comparison here decides a colour a planner acts
 * on — so it is [BigDecimal] end to end. The only float in the whole feature is the bar's ratio,
 * computed inside the draw code and never stored.
 */

/** The four load bands, in increasing load. Labels live in the design system (`ds_tier_*`, R8). */
enum class CapacityTier { AVAILABLE, MODERATE, HEAVY, OVERBOOKED }

/**
 * The day-load bands, in m². The server sends them with the capacity response (R3) because the
 * factory's capacity is a business setting, not a client constant; [DEFAULT] exists only for a
 * server old enough to omit them.
 */
data class CapacityThresholds(val low: BigDecimal, val moderate: BigDecimal, val heavy: BigDecimal) {
    companion object {
        val DEFAULT = CapacityThresholds(BigDecimal(300), BigDecimal(450), BigDecimal(600))
    }
}

/**
 * The web's `tierFor` (`CapacityCalendar.tsx:75-80`), boundary for boundary: each band is
 * **inclusive** of its threshold, so a day holding exactly `low` m² is still «мавжуд». Compared
 * with `compareTo` rather than `equals`, so 300 and 300.00 are the same boundary.
 */
fun tierFor(totalArea: BigDecimal, t: CapacityThresholds): CapacityTier = when {
    totalArea <= t.low -> CapacityTier.AVAILABLE
    totalArea <= t.moderate -> CapacityTier.MODERATE
    totalArea <= t.heavy -> CapacityTier.HEAVY
    else -> CapacityTier.OVERBOOKED
}

/** One day's bucket as the endpoint reports it; canceled orders are already excluded server-side. */
data class CapacityDay(
    val date: LocalDate,
    val totalArea: BigDecimal,
    val totalOrders: Int,
    val totalBlocks: Int,
)

/**
 * One cursor month plus the leading and trailing days its six-week grid shows. [days] holds only
 * the dates the server reported — a date it never sent is a day with no orders, which [day]
 * answers with zeros rather than null, so no caller has to invent them.
 */
data class CapacityMonth(
    val month: YearMonth,
    val range: ClosedRange<LocalDate>,
    val days: Map<LocalDate, CapacityDay>,
    val thresholds: CapacityThresholds,
) {
    fun day(d: LocalDate): CapacityDay = days[d] ?: CapacityDay(d, BigDecimal.ZERO, 0, 0)

    /** §4.1's header counts the CURSOR month only: the grid's leading and trailing days belong to
     *  the neighbouring months and would double-count when the planner pages through. */
    private val ownDays: List<CapacityDay>
        get() = days.values.filter { YearMonth.from(it.date) == month }

    val totalOrders: Int get() = ownDays.sumOf { it.totalOrders }

    val totalArea: BigDecimal
        get() = ownDays.fold(BigDecimal.ZERO) { acc, d -> acc + d.totalArea }
}

/**
 * The visible six-week grid for a month: Monday-first, always 42 days so the card never changes
 * height (R10, the web's `CapacityCalendar.tsx:87-100`). ISO numbers Monday 1, so the offset back
 * to the grid's first Monday is `(dayOfWeek.value - 1)` — written as the web's `(dow + 6) % 7` on
 * a Sunday-first value would be.
 */
fun gridRange(month: YearMonth): ClosedRange<LocalDate> {
    val first = month.atDay(1)
    val start = first.minusDays((first.dayOfWeek.value - 1).toLong())
    return start..start.plusDays(41)
}

/**
 * How many weeks the card actually draws — **owner ruling R16 (2026-09-13): five rows are enough.**
 * [gridRange] still asks the server for all 42 days (the web's range, R10), but a sixth row made
 * entirely of the NEXT month's days is a week of the planner's screen spent on dates they are not
 * looking at. September 2026 needs five; August 2026 genuinely spans six Monday-first weeks and
 * keeps all six, so no day of the month is ever dropped; February 2027 starts on a Monday with 28
 * days and needs four.
 *
 * The leading days of the previous month and whatever trailing days complete the LAST drawn row
 * stay where they are, greyed — the row has to be seven cells wide either way.
 */
fun gridRows(month: YearMonth): Int {
    val leading = month.atDay(1).dayOfWeek.value - 1 // ISO Monday = 1, so Monday-first index
    return (leading + month.lengthOfMonth() + DAYS_PER_WEEK - 1) / DAYS_PER_WEEK
}

/** Monday-first, seven columns — the one number both [gridRange] and [gridRows] count in. */
const val DAYS_PER_WEEK = 7
