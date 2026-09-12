package uz.etalon.crm.core.ui.format

import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.regions.findTumanByName
import uz.etalon.crm.core.ui.regions.findViloyatByName
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

/** House number format (spec §6.5): space thousands, comma decimal, unit suffix.
 *  Device ICU is deliberately not used — the server does the same. */
val TASHKENT: ZoneId = ZoneId.of("Asia/Tashkent")
val UZ_MONTHS_SHORT = listOf("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
val UZ_MONTHS_FULL = listOf("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь")
/** Monday first, matching java.time's DayOfWeek ordinal. */
val UZ_WEEKDAYS = listOf("Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба", "Якшанба")

// U+202F NARROW NO-BREAK SPACE, written as an escape rather than as a literal invisible character
// — a literal cannot be told apart from a plain space in a diff. Design decision D8 asks for a
// thin group separator: at 10–13 sp a full space between groups reads as two separate numbers on
// a phone row. The obvious character, U+2009 THIN SPACE, is the wrong one for money — its line
// break class is BA, so a nine-digit figure in a narrow column breaks *at a digit-group boundary*
// and, with `maxLines = 1`, everything after the break is discarded: «532 687 601» renders as
// «532». U+202F is the same width and unbreakable by definition (class GL), so a figure that does
// not fit ellipsizes instead of quietly reading as a sum a thousand times smaller.
private const val THIN = '\u202F'

private fun groupThousands(whole: String): String {
    val neg = whole.startsWith("-")
    val digits = whole.trimStart('-')
    val sb = StringBuilder()
    digits.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(THIN); sb.append(c) }
    return (if (neg) "-" else "") + sb.reverse()
}

/** The currency, for the one place it is written: a hero figure. */
const val MONEY_UNIT = "UZS"

/**
 * Money as it appears in a list, a row or a total: grouped digits and **nothing else** (D8).
 * The unit is dropped because every figure on those screens is UZS and repeating it eleven times
 * down a column is what made the old rows unreadable at 13 sp.
 */
fun formatMoney(m: Money): String = groupThousands(m.roundedWhole().toPlainString())

/**
 * The KPI / confirm-sheet form: «UZS 53 268 760». Callers that can style two runs separately
 * should use `MoneyHeroText` instead — it renders the prefix at 14/500 and 50 % opacity, which a
 * plain string cannot. This exists for the places that need one string: a content description,
 * the share image's canvas, a toast.
 */
fun formatMoneyHero(m: Money): String = "$MONEY_UNIT$THIN${formatMoney(m)}"

fun formatDecimal(v: BigDecimal, maxDigits: Int = 1): String {
    val scaled = v.setScale(maxDigits, RoundingMode.HALF_UP).stripTrailingZeros()
    val plain = scaled.toPlainString()
    val parts = plain.split('.')
    val whole = groupThousands(parts[0])
    return if (parts.size == 2 && parts[1].isNotEmpty()) "$whole,${parts[1]}" else whole
}

// 2 decimals — matches the web's formatNumber(o.totalArea, 2) in the orders list and print
// sheet. Staff cross-check the same order's area on the phone and on the desk.
fun formatArea(m2: BigDecimal): String = formatDecimal(m2, 2) + " м²"
fun formatCount(n: Int): String = groupThousands(n.toString()) + " та"

/**
 * A count with no counter word: «312», «8», «1 240» — grouped by the same thin space every other
 * figure in the app is, so a four-digit count never reads as two numbers.
 *
 * For counts a sentence already names: «312 мижоздан», «2 буюртма», «8 хона». [formatCount]'s
 * « та» is Uzbek's own counter and belongs where the noun is absent («Буюртмалар · 7 та»);
 * repeating it in front of a noun that follows («312 та мижоздан 8 таси») is a register the
 * prototype's rows never use. Passing the raw `%1$d` instead is the other half of the bug — it
 * drops the grouping and prints «1240».
 */
fun formatCountBare(n: Int): String = groupThousands(n.toString())

/** A discount percentage, e.g. "10%" or "13,33%" — the calculator's discount field. */
fun formatPercent(v: BigDecimal, decimals: Int = 2): String = formatDecimal(v, decimals) + "%"

/** A length in metres for a room card or a beam schedule row. */
fun formatMeters(v: Double, decimals: Int = 2): String =
    formatDecimal(BigDecimal.valueOf(v), decimals) + " м"

/** Total product weight. The factory's rule of thumb for finished beam-and-block flooring is
 *  180 kg per m² of slab; the calculator shows it so an operator can size the truck at a glance.
 *  Whole kilograms — a tenth of a kilo on a twelve-tonne load is noise. */
fun formatWeightKg(kg: Double): String = formatDecimal(BigDecimal.valueOf(kg), 0) + " кг"

/** The same figure where it is already exact: the order detail's load list derives its weight as
 *  `totalArea × 180` in [BigDecimal] ([uz.etalon.crm.core.model.weightKg]), and routing it
 *  through a `Double` on the way to the screen would be a rounding for nothing. */
fun formatWeightKg(kg: BigDecimal): String = formatDecimal(kg, 0) + " кг"

/** Digits-only storage → `+998 90 111 22 33`. Mirrors src/lib/phone.ts formatPhone. */
fun formatPhone(raw: String): String {
    val d = raw.filter { it.isDigit() }
    val full = when {
        d.length == 12 && d.startsWith("998") -> d
        d.length == 9 -> "998$d"
        else -> return raw
    }
    return "+${full.substring(0, 3)} ${full.substring(3, 5)} ${full.substring(5, 8)} ${full.substring(8, 10)} ${full.substring(10, 12)}"
}

fun formatDate(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${z.dayOfMonth} ${UZ_MONTHS_SHORT[z.monthValue - 1]} ${z.year}"
}

fun formatDateTime(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${formatDate(t)}, ${"%02d".format(z.hour)}:${"%02d".format(z.minute)}"
}

/**
 * The scheduled day for a list row: always a calendar date, never a relative phrase.
 * The year is carried only when it is not the current one — every row already repeats
 * the current year in its order number, and the width belongs to the address instead.
 */
fun formatScheduleDate(t: Instant, now: Instant = Instant.now()): String {
    val day = t.atZone(TASHKENT).toLocalDate()
    val today = now.atZone(TASHKENT).toLocalDate()
    val dayMonth = "${day.dayOfMonth} ${UZ_MONTHS_SHORT[day.monthValue - 1]}"
    return if (day.year == today.year) dayMonth else "$dayMonth ${day.year}"
}

/** Home's subtitle: «Сешанба, 9 сентябрь». */
fun formatLongDate(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${UZ_WEEKDAYS[z.dayOfWeek.value - 1]}, ${z.dayOfMonth} ${UZ_MONTHS_FULL[z.monthValue - 1]}"
}

/** A month group header on the orders list: «Сентябрь 2026». */
fun formatMonthYear(ym: YearMonth): String =
    UZ_MONTHS_FULL[ym.monthValue - 1].replaceFirstChar { it.uppercase() } + " " + ym.year

private const val NB_HYPHEN = '\u2011' // NON-BREAKING HYPHEN — an escape, like THIN, so a diff can tell it from '-'

/** «№ 09‑0003» for `2026-09-0003`: the year is dropped (it is on every row of a list), the
 *  remaining hyphen is U+2011 so a number never breaks across lines. */
fun formatOrderNo(orderNumber: String): String {
    val rest = orderNumber.substringAfter('-', orderNumber)
    return "№ " + rest.replace('-', NB_HYPHEN)
}

/** A viloyat/tuman head converted to Cyrillic for display, or [part] unchanged if it isn't a
 *  recognised region name (i.e. it's the street). Mirrors the web's `addressToCyrillic`
 *  (src/lib/regions/index.ts) — a web-side bug can canonicalise a stored address's region
 *  parts to Latin, and this CRM's rule is Uzbek Cyrillic everywhere, so every render path
 *  needs the same correction. Never touches what is stored — display only. */
private fun cyrillicRegionPart(part: String): String =
    findViloyatByName(part)?.nameUz ?: findTumanByName(part)?.nameUz ?: part

/**
 * A client address for a single-line row. The web widget stores it as
 * `"<Viloyat>, <Tuman>, <street>"` (src/lib/regions/index.ts), so joining the parts
 * with the card's own "·" separator leaves the street last — when the row runs out of
 * width it is the street that truncates and the province and district survive, which
 * is what a delivery operator is actually scanning for. Addresses written before that
 * widget existed carry no comma and pass through unchanged.
 *
 * Only the first two parts can be a viloyat/tuman head, so only those are checked against
 * the region catalogue and converted to Cyrillic; the street (and anything else) passes
 * through untouched.
 */
fun formatAddressLine(raw: String?): String? {
    val parts = raw?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
    if (parts.isEmpty()) return null
    return parts.mapIndexed { i, p -> if (i < 2) cyrillicRegionPart(p) else p }.joinToString(" · ")
}
