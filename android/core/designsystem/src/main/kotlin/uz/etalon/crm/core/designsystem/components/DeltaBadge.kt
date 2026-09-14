package uz.etalon.crm.core.designsystem.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import uz.etalon.crm.core.ui.format.formatPercent

/**
 * Design §2.3 — the trend pill's `(foreground, background)` pair, the web's `TrendIndicator.tsx`
 * rule transcribed: **polarity decides what "good" means, direction decides which way it went.**
 * Booked, collected and AOV are positive metrics, so a rise is green; receivables is negative, so
 * a rise is red and a fall is the green one. Colouring by the arrow alone would tell the owner
 * that a shrinking debt is bad news.
 *
 * FLAT and UNKNOWN are the same neutral pair: a month that stood still makes no claim, and a
 * direction this build does not recognise must not invent one.
 *
 * Public and separate from the composable so the pairing can be asserted without rendering — the
 * same shape `tagColors` has in `StatusTag.kt`.
 */
fun trendColors(trend: Trend): Pair<Color, Color> = when (trend.direction) {
    TrendDirection.FLAT, TrendDirection.UNKNOWN -> EtalonColors.ink3 to EtalonColors.lavenderBg
    TrendDirection.UP, TrendDirection.DOWN -> {
        val rose = trend.direction == TrendDirection.UP
        val good = if (trend.polarity == TrendPolarity.NEGATIVE) !rose else rose
        if (good) EtalonColors.green to EtalonColors.greenBg else EtalonColors.red to EtalonColors.redBg
    }
}

/**
 * «↑ 68%», «↓ 12%», «→ 0%». The arrow carries the direction, so the figure drops its sign: the web
 * prints «↓ -12%», and a minus behind a down arrow is the same fact written twice — on a 228 dp
 * card it is two characters that say nothing. `deltaPct` arrives already rounded to a whole
 * percent by the server (`buildTrend`'s `Math.round`); [formatPercent] with no decimals groups it
 * and adds the «%» without rounding it a second time.
 */
private fun deltaBadgeText(trend: Trend): String {
    val arrow = when (trend.direction) {
        TrendDirection.UP -> "↑"
        TrendDirection.DOWN -> "↓"
        TrendDirection.FLAT, TrendDirection.UNKNOWN -> "→"
    }
    return "$arrow ${formatPercent(trend.deltaPct.abs(), decimals = 0)}"
}

/**
 * §2.3's delta badge, drawn through [TagBody] so it carries the same radius, padding and type as
 * every other tag in the app.
 *
 * A `null` trend renders **nothing at all** — not an empty pill, not a dash. The first month of an
 * account has no prior month to compare against, and a placeholder there reads as a measured zero.
 */
@Composable
fun DeltaBadge(trend: Trend?, modifier: Modifier = Modifier) {
    if (trend == null) return
    val (fg, bg) = trendColors(trend)
    TagBody(text = deltaBadgeText(trend), bg = bg, fg = fg, style = EtalonType.tag, modifier = modifier)
}
