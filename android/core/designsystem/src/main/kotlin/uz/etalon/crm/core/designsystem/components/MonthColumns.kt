package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.math.RoundingMode

/** Design §2.3b: twelve months, whatever the payload's length — a chart that drew ten columns one
 *  month and twelve the next would move everything under it. */
const val MONTH_COLUMNS = 12

/** The bars' own band. Taller than a rail sparkline's 44 dp because two bars share each column and
 *  the difference between them has to be readable at 23 dp of width. */
private val ColumnsHeight = 60.dp

/** Between two months, and between the two bars of one month. The inner gap is the smaller of the
 *  two so a month reads as a pair before it reads as two neighbours. */
private val ColumnGap = EtalonSpace.xs
private val BarGap = 2.dp

/**
 * How the unselected Collected bar is tinted (ruling R13).
 *
 * `greenBg` — the token a chip's ground is drawn in — is a pale mint that all but disappears on a
 * white card at ten device-independent pixels of width, and Collected is almost always the shorter
 * bar of the pair. The same `green` at 45 % reads as the muted half of the same colour rather than
 * as a different one, and the selected month keeps the full `green` so the picked column still
 * stands out.
 */
private const val CollectedAlpha = 0.45f

/**
 * The floor a zero month keeps, as [BarSparkline]'s own stub: a bar with no height reads as
 * missing data rather than as a month with no orders in it. Drawn in the TRACK colour, not the
 * series colour — a zero is the absence of a figure, and drawing it in the series' own green would
 * claim the month collected something.
 */
private val ColumnStub = 2.dp
private val StubFraction = ColumnStub / ColumnsHeight

/**
 * The floor a NON-ZERO month keeps (ruling R13).
 *
 * A month that collected half a percent of the best month's figure is 0,3 dp tall against a 60 dp
 * band — invisible, and indistinguishable from a month that collected nothing at all. Three device-
 * independent pixels is the smallest mark that still reads as a bar, so a real but small month is
 * drawn short rather than drawn away.
 */
private val MinBar = 3.dp
private val MinBarFraction = MinBar / ColumnsHeight

/** The mark under the month containing today. A dot rather than a bolder label: the label has to
 *  stay the same width in every column or the twelve stop lining up. */
private val CurrentDot = 3.dp

/** Tag of the i-th column, so a test can tap one month rather than photograph the row. */
fun monthColumnTag(index: Int) = "month_column_$index"

/** Tag of one bar inside the i-th column, so a test can measure a bar rather than photograph the
 *  row — the two floors of ruling R13 are heights, and a frame cannot assert a height. */
fun monthBarTag(index: Int, collected: Boolean) =
    "month_bar_${if (collected) "collected" else "booked"}_$index"

/**
 * True on the column the operator has picked — the one drawn in the accent pair. A semantics
 * property rather than a second tag, for [SparklineBarAccent]'s reason: a node has one tag, and
 * "which month is this" and "is this the selected one" are two questions a test asks of the same
 * node.
 */
val MonthColumnSelected = SemanticsPropertyKey<Boolean>("MonthColumnSelected")
private var SemanticsPropertyReceiver.monthColumnSelected by MonthColumnSelected

/**
 * §2.3b's month picker: twelve months side by side, each a pair of bars — what was BOOKED that
 * month and what was COLLECTED in it — with the picked month in the accent pair and the month
 * containing today marked under its label.
 *
 * Both series are measured against ONE maximum taken over the two of them, so the two bars of a
 * month can be compared with each other and not only with their own row: collected is almost
 * always the shorter of the pair, and scaling each series to its own maximum would draw a month
 * that collected a tenth of what it sold as two bars of equal height.
 *
 * That shared denominator is what makes a small Collected figure tiny, so two rules protect it
 * (ruling R13): a real figure is never drawn shorter than [MinBar], and the unselected Collected
 * bar is tinted [CollectedAlpha] of `green` rather than the near-white `greenBg`. A month with
 * nothing in it is the one thing drawn smaller and paler than that — [ColumnStub] in the track
 * colour — so "small" and "none" never look alike. A legend beside this chart should key Booked to
 * `indigo` and Collected to `green`, the two selected-state colours.
 *
 * The whole column is the target, not the bar: [onSelect] fires with the column's index, and a
 * column is at least [EtalonSpace.minTouch] tall however short its bars are.
 *
 * @param booked per month, oldest first. Longer series are cut to their last [MONTH_COLUMNS];
 *   shorter ones are left-padded with zero months, so the chart is always twelve wide.
 * @param collected the same twelve months, index-aligned with [booked].
 * @param labels what goes under each column — the short Uzbek month names. Padded on the left the
 *   same way when short, so a label never slides under the wrong month.
 * @param selected index of the picked month, into the padded twelve.
 * @param current index of the month containing today, into the same twelve. `-1` marks none.
 */
@Composable
fun MonthColumns(
    booked: List<Money>,
    collected: List<Money>,
    labels: List<String>,
    selected: Int,
    current: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bookedWindow = window(booked)
    val collectedWindow = window(collected)
    val labelWindow = List(MONTH_COLUMNS - labels.takeLast(MONTH_COLUMNS).size) { "" } +
        labels.takeLast(MONTH_COLUMNS)
    // One denominator over both series — see the KDoc.
    val max = (bookedWindow + collectedWindow).maxOrNull() ?: Money.ZERO

    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ColumnGap),
        verticalAlignment = Alignment.Bottom,
    ) {
        repeat(MONTH_COLUMNS) { i ->
            MonthColumn(
                index = i,
                label = labelWindow[i],
                bookedFraction = fraction(bookedWindow[i], max),
                collectedFraction = fraction(collectedWindow[i], max),
                isSelected = i == selected,
                isCurrent = i == current,
                onSelect = onSelect,
            )
        }
    }
}

/** The tail of a series, left-padded with zero months to [MONTH_COLUMNS]. */
private fun window(values: List<Money>): List<Money> {
    val tail = values.takeLast(MONTH_COLUMNS)
    return List(MONTH_COLUMNS - tail.size) { Money.ZERO } + tail
}

/**
 * A month's share of the tallest month, 0..1.
 *
 * `BigDecimal`, never a `Double` ratio of two nine-digit UZS figures — the same rule the rail's
 * sparkline follows. A negative cannot occur here, but it would otherwise become a negative
 * fraction that `coerceIn` floors silently, so it is clamped where the sign is still visible.
 */
private fun fraction(value: Money, max: Money): Float =
    if (max.amount.signum() <= 0 || value.amount.signum() <= 0) 0f
    else value.amount.divide(max.amount, FRACTION_SCALE, RoundingMode.HALF_UP).toFloat()

/** Four places: one pixel of a 60 dp bar is well inside 0,0001 of the whole. */
private const val FRACTION_SCALE = 4

@Composable
private fun RowScope.MonthColumn(
    index: Int,
    label: String,
    bookedFraction: Float,
    collectedFraction: Float,
    isSelected: Boolean,
    isCurrent: Boolean,
    onSelect: (Int) -> Unit,
) = Column(
    Modifier
        .weight(1f)
        .heightIn(min = EtalonSpace.minTouch)
        .clickable(role = Role.Button, onClickLabel = label) { onSelect(index) }
        .testTag(monthColumnTag(index))
        .semantics { monthColumnSelected = isSelected },
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    Row(
        Modifier.fillMaxWidth().height(ColumnsHeight),
        horizontalArrangement = Arrangement.spacedBy(BarGap),
        verticalAlignment = Alignment.Bottom,
    ) {
        Bar(
            fraction = bookedFraction,
            colour = if (isSelected) EtalonColors.indigo else EtalonColors.lavender,
            tag = monthBarTag(index, collected = false),
        )
        Bar(
            fraction = collectedFraction,
            colour = if (isSelected) EtalonColors.green else EtalonColors.green.copy(alpha = CollectedAlpha),
            tag = monthBarTag(index, collected = true),
        )
    }
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        label,
        style = EtalonType.caption,
        color = if (isSelected) EtalonColors.ink else EtalonColors.ink3,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
    CurrentMark(isCurrent)
}

/** The dot under today's month — and, under every other month, the space it takes, so that the
 *  twelve labels sit on one line whether or not the current month is on screen. */
@Composable
private fun ColumnScope.CurrentMark(isCurrent: Boolean) {
    Spacer(Modifier.height(EtalonSpace.xs))
    Box(
        Modifier
            .size(CurrentDot)
            .clip(EtalonShapes.pill)
            .background(if (isCurrent) EtalonColors.ink2 else Color.Transparent),
    )
}

/**
 * One bar of a month's pair.
 *
 * Two floors, and they mean different things (ruling R13). A month with a REAL figure is drawn at
 * least [MinBar] tall in its own colour, so a small month is short rather than absent. A month with
 * NOTHING in it keeps the thinner [ColumnStub] in the track colour: the mark says "this column
 * exists and its figure is zero", which is a different statement from "this month collected a
 * little".
 *
 * NaN is checked first — `coerceIn` passes it straight through and `fillMaxHeight(NaN)` throws
 * inside `roundToInt`, so a month with no denominator would otherwise take the screen down with it.
 * It reads as a zero, because a fraction that is not a number is not a figure either.
 */
@Composable
private fun RowScope.Bar(fraction: Float, colour: Color, tag: String) {
    val real = fraction.isFinite() && fraction > 0f
    Box(
        Modifier
            .weight(1f)
            .fillMaxHeight(
                if (real) fraction.coerceIn(0f, 1f).coerceAtLeast(MinBarFraction) else StubFraction,
            )
            .testTag(tag)
            .clip(BarShape)
            .background(if (real) colour else EtalonColors.lavenderBg),
    )
}
