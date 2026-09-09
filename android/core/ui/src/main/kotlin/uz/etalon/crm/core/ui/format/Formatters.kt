package uz.etalon.crm.core.ui.format

import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.regions.findTumanByName
import uz.etalon.crm.core.ui.regions.findViloyatByName
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneId

/** House number format (spec §6.5): space thousands, comma decimal, unit suffix.
 *  Device ICU is deliberately not used — the server does the same. */
val TASHKENT: ZoneId = ZoneId.of("Asia/Tashkent")
val UZ_MONTHS_SHORT = listOf("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")

// U+00A0 non-breaking space, written as an escape rather than a literal invisible character.
// Matches the web's Intl.NumberFormat("ru-RU", …) grouping separator, so a long figure like
// "542 200 000 UZS" can't wrap across lines mid-number.
private const val NBSP = '\u00A0'

private fun groupThousands(whole: String): String {
    val neg = whole.startsWith("-")
    val digits = whole.trimStart('-')
    val sb = StringBuilder()
    digits.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(NBSP); sb.append(c) }
    return (if (neg) "-" else "") + sb.reverse()
}

fun formatMoney(m: Money): String = groupThousands(m.roundedWhole().toPlainString()) + " UZS"

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

/** A discount percentage, e.g. "10%" or "13,33%" — the calculator's discount field. */
fun formatPercent(v: BigDecimal, decimals: Int = 2): String = formatDecimal(v, decimals) + "%"

/** A length in metres for a room card or a beam schedule row. */
fun formatMeters(v: Double, decimals: Int = 2): String =
    formatDecimal(BigDecimal.valueOf(v), decimals) + " м"

/** Total product weight. The factory's rule of thumb for finished beam-and-block flooring is
 *  180 kg per m² of slab; the calculator shows it so an operator can size the truck at a glance.
 *  Whole kilograms — a tenth of a kilo on a twelve-tonne load is noise. */
fun formatWeightKg(kg: Double): String = formatDecimal(BigDecimal.valueOf(kg), 0) + " кг"

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
