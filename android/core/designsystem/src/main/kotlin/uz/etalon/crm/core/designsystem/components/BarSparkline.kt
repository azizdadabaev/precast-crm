package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import java.math.BigDecimal
import java.math.RoundingMode

/** §2: 4 dp on top, 2 dp at the foot — a sparkline bar is not a plain rounded rectangle. */
private val BarShape = RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp, bottomStart = 2.dp, bottomEnd = 2.dp)

/** The track every sparkline in the app is drawn in, and the gap between two of its bars. */
private val SparklineHeight = 44.dp
private val SparklineGap = 5.dp

/**
 * §2.3: «all-zero series draws 8 floor stubs (2 dp) so the card does not jump». The floor travels
 * as a *fraction* of the track rather than as a `Dp` because that is the unit `fillMaxHeight`
 * takes — and because the KPI card, whose own floor predates this component and whose baselines
 * must not move, is written in the same unit.
 */
private val SparklineStub = 2.dp

/**
 * The KPI card's own floor, unchanged from when it drew its bars itself: 9 % of the 44 dp track,
 * i.e. just under 4 dp. It is a different figure from [SparklineStub] on purpose — a KPI card's
 * quiet week should still read as a bar, while §2.3 asks the dashboard rail for a thinner stub —
 * and keeping it exact to the hundredth is what keeps `ds_kpi_*` pixel-identical through this
 * component's extraction.
 */
internal const val KPI_BAR_FLOOR = 0.09f

/** Tag of the i-th bar, so a test can measure one bar rather than photograph the row. */
fun sparklineBarTag(index: Int) = "sparkline_bar_$index"

/**
 * True on the one bar drawn in [EtalonColors.indigo] — the period the card's figure belongs to.
 * A semantics property rather than a second test tag: a node has one tag, and "which bar is this"
 * and "is this the current one" are two different questions a test needs to ask of the same node.
 */
val SparklineBarAccent = SemanticsPropertyKey<Boolean>("SparklineBarAccent")
private var SemanticsPropertyReceiver.sparklineBarAccent by SparklineBarAccent

/**
 * §2.3's rail sparkline: eight bars, each as tall as its share of the largest of the eight, the
 * last one — this month — in indigo and the rest in lavender.
 *
 * The window is the **tail** of [values] and is left-padded with zeros when the series is shorter,
 * so the bar count never depends on how long the account has existed: the three rail cards must
 * stay the same height beside each other, and a card that draws six bars one month and eight the
 * next moves everything under it.
 *
 * @param values the series in chronological order, ending with the current period. Plain numbers
 *   or money — the ratio is taken in [BigDecimal], so a nine-digit UZS figure never goes near a
 *   `Double` on its way to a height.
 * @param bars how many periods the window shows.
 */
@Composable
fun BarSparkline(values: List<BigDecimal>, modifier: Modifier = Modifier, bars: Int = 8) {
    if (bars <= 0) return
    val tail = values.takeLast(bars)
    val window = List(bars - tail.size) { BigDecimal.ZERO } + tail
    val max = window.maxOrNull() ?: BigDecimal.ZERO
    // A month can only be zero or positive here, but a negative would otherwise become a negative
    // fraction and `coerceIn` would floor it silently — clamp where the sign is still visible.
    val fractions = window.map { v ->
        if (max.signum() <= 0 || v.signum() <= 0) 0f
        else v.divide(max, 4, RoundingMode.HALF_UP).toFloat()
    }
    SparklineBars(
        fractions = fractions,
        accentIndex = bars - 1,
        floorFraction = SparklineStub / SparklineHeight,
        modifier = modifier,
    )
}

/**
 * The drawing itself — the one copy in the app. [BarSparkline] feeds it a window of ratios and
 * accents the last bar; `KpiCard` feeds it heights it was handed and accents whichever bar its
 * figure belongs to. The two differ in what they are given and in how short a quiet period may be
 * drawn, and in nothing else, which is why the geometry lives here and not in either caller.
 */
@Composable
internal fun SparklineBars(
    fractions: List<Float>,
    accentIndex: Int,
    floorFraction: Float,
    modifier: Modifier = Modifier,
) = Row(
    modifier.fillMaxWidth().height(SparklineHeight),
    Arrangement.spacedBy(SparklineGap),
    Alignment.Bottom,
) {
    fractions.forEachIndexed { i, h -> SparklineBar(i, h, i == accentIndex, floorFraction) }
}

@Composable
private fun RowScope.SparklineBar(index: Int, fraction: Float, accent: Boolean, floorFraction: Float) = Box(
    Modifier.weight(1f)
        // A zero-height bar is invisible and reads as missing data rather than a quiet month, so
        // every bar keeps its floor. NaN is checked first: `coerceIn` passes it straight through,
        // and `fillMaxHeight(NaN)` throws inside `roundToInt` — a month with no denominator would
        // crash the screen.
        .fillMaxHeight(
            if (fraction.isFinite()) fraction.coerceIn(0f, 1f).coerceAtLeast(floorFraction) else floorFraction,
        )
        .testTag(sparklineBarTag(index))
        .semantics { sparklineBarAccent = accent }
        .clip(BarShape)
        .background(if (accent) EtalonColors.indigo else EtalonColors.lavender),
)
