package uz.etalon.crm.core.ui.format

import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneId

/** House number format (spec §6.5): space thousands, comma decimal, unit suffix.
 *  Device ICU is deliberately not used — the server does the same. */
val TASHKENT: ZoneId = ZoneId.of("Asia/Tashkent")
val UZ_MONTHS_SHORT = listOf("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")

private fun groupThousands(whole: String): String {
    val neg = whole.startsWith("-")
    val digits = whole.trimStart('-')
    val sb = StringBuilder()
    digits.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(' '); sb.append(c) }
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

fun formatArea(m2: BigDecimal): String = formatDecimal(m2, 1) + " м²"
fun formatCount(n: Int): String = groupThousands(n.toString()) + " та"

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
