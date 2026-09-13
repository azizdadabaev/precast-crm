package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.components.bg
import uz.etalon.crm.core.designsystem.components.color
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDecimal
import java.math.BigDecimal
import java.math.RoundingMode

/** Design §4.2's geometry, internal so the skeleton copies it rather than guessing at it. */
internal val CELL_H: Dp = 56.dp
internal val CELL_GAP: Dp = 2.dp

internal val CELL_PAD_H = 5.dp
private val CELL_PAD_V = 4.dp
private val BAR_H = 3.dp
private val BAR_GAP = 3.dp
private val RING = 1.dp

/** §4.2: an adjacent month's day is drawn — the web draws it — but at 35 % and inert. §7 gives
 *  the calculator's out-of-range days the same treatment, for the same reason. */
private const val DIMMED_ALPHA = 0.35f

/** Four places is far past what a 40 dp bar can express, and it keeps the division exact enough
 *  that two days a tenth of a square metre apart never draw the same width. */
private const val RATIO_SCALE = 4

/** The m² figure's own two places — [formatArea] minus the unit it appends (§8's yield). */
private const val AREA_PLACES = 2

/**
 * One day of the capacity calendar (design §4.2, prototype 4a): the day number top left, that
 * day's order count top right, its load in m² under them, and a 3 dp bar along the bottom whose
 * width is the day's share of the factory's heavy threshold. The ground is the tier's pale fill,
 * so a planner reads the month's shape before reading a single figure.
 *
 * The whole cell is the touch target. At 360 dp it measures about 40 × 56 dp: seven columns and
 * six 2 dp gaps cannot be 48 dp each inside a card that keeps its own margins, and the design's
 * «≥ 48 at 360 dp» is arithmetic that does not close (7 × 48 + 6 × 2 = 348 dp of grid inside
 * 296 dp of card). The 56 dp height carries D7's floor on the axis where a finger actually misses,
 * and `CapacityCalendarTest` pins both numbers so a later padding change cannot quietly shrink it.
 *
 * @param tier null is an **empty** day — no orders, no load — which is a white cell with a
 *   hairline and no bar, not a tier whose colour happens to be pale (§4.2). It is also what a grid
 *   whose capacity failed to load draws, with [enabled] false (§8: no zeros invented).
 * @param dimmed a day that is not this planner's to pick: the leading and trailing days of the
 *   neighbouring months, and — in the calculator's picker — every day before `minSelectable`.
 *   Drawn in its own tier's colour, as the web draws it, but at 35 % and inert. It is a separate
 *   flag from [enabled] because a grid whose capacity failed to load disables every cell without
 *   fading the dates, which are the one thing it still knows.
 * @param heavy the top threshold the bar is a fraction of. Zero or less draws no bar rather than
 *   dividing by it.
 * @param enabled false for a dimmed day and for every cell of a grid with no capacity behind it.
 * @param cellWidth what the column actually measured, which the grid works out once from its own
 *   constraints. It is what decides whether «м²» is drawn at all — see [areaLine].
 */
@Composable
internal fun DayCell(
    day: CapacityDay,
    tier: CapacityTier?,
    dimmed: Boolean,
    isToday: Boolean,
    isSelected: Boolean,
    heavy: BigDecimal,
    enabled: Boolean,
    cellWidth: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // A tier with no area behind it draws no figure and no bar: §8's beams-only day carries orders
    // and zero m², and a zero-width bar on a coloured ground would read as a rendering fault.
    val loaded = tier?.takeIf { day.totalArea.signum() > 0 }
    val ground = when {
        isSelected -> EtalonColors.navy
        tier != null -> tier.bg()
        else -> EtalonColors.surface
    }
    // Today's ring wins over the empty day's hairline: both are 1 dp, and «this is today» is the
    // more useful of the two things a border can say.
    val borderColor = when {
        isSelected -> null
        isToday -> EtalonColors.indigo
        tier == null -> EtalonColors.surfaceBorder
        else -> null
    }
    val today = stringResource(R.string.ds_calendar_today_cd)
    // A cell with nothing behind it — an unloaded grid, or a day the factory has no work on —
    // announces its date and stops. «0 буюртма, 0 м²» would state as fact the very thing a grid
    // whose capacity failed to load does not know (§8), and on a loaded but empty day it is noise
    // read out forty-two times.
    val hasFigures = tier != null || day.totalOrders > 0
    val cd = if (hasFigures) {
        stringResource(
            R.string.ds_calendar_day_cd,
            formatDate(day.date),
            formatCountBare(day.totalOrders),
            formatArea(day.totalArea),
        )
    } else {
        formatDate(day.date)
    }.let { if (isToday) "$it, $today" else it }
    val interaction = remember { MutableInteractionSource() }

    Box(
        modifier
            .height(CELL_H)
            .then(if (dimmed) Modifier.alpha(DIMMED_ALPHA) else Modifier)
            .clip(EtalonShapes.md)
            .background(ground)
            .then(if (borderColor != null) Modifier.border(RING, borderColor, EtalonShapes.md) else Modifier)
            .clickable(
                enabled = enabled,
                role = Role.Button,
                indication = etalonRipple(isSelected),
                interactionSource = interaction,
                onClick = onClick,
            )
            // The three lines read aloud as «12», «5», «685 м²» in an order nobody could act on;
            // the cell answers as one sentence instead. `selected` is the other half of that: the
            // navy fill is the whole of the chosen day's state, and a screen reader cannot see it.
            .semantics { contentDescription = cd; selected = isSelected },
    ) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = CELL_PAD_H, vertical = CELL_PAD_V)
                .clearAndSetSemantics { },
        ) {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
                Text(
                    day.date.dayOfMonth.toString(),
                    style = EtalonType.label,
                    fontWeight = if (isToday && !isSelected) FontWeight.W800 else null,
                    color = when {
                        isSelected -> EtalonColors.onDark
                        isToday -> EtalonColors.indigo
                        else -> EtalonColors.ink
                    },
                    maxLines = 1,
                )
                if (day.totalOrders > 0) {
                    Text(
                        formatCountBare(day.totalOrders),
                        style = EtalonType.calendarCount,
                        color = if (isSelected) EtalonColors.onDarkMuted else EtalonColors.ink3,
                        maxLines = 1,
                    )
                }
            }
            // The m² line is the one that yields at font scale 1.3 (§8), so it sits under a
            // flexible gap and above a bar whose height is fixed.
            Spacer(Modifier.weight(1f))
            if (loaded != null) {
                Text(
                    areaLine(day.totalArea, cellWidth - CELL_PAD_H * 2),
                    style = EtalonType.calendarArea,
                    color = if (isSelected) EtalonColors.onDark else loaded.color(),
                    maxLines = 1,
                    // Never an ellipsis inside a 40 dp cell: «685 …» costs more meaning than the
                    // unit does, and [areaLine] has already dropped the unit if it was the thing
                    // that did not fit.
                    overflow = TextOverflow.Clip,
                )
                Spacer(Modifier.height(BAR_GAP))
                LoadBar(
                    fraction = loadFraction(day.totalArea, heavy),
                    color = loaded.color(),
                    track = if (isSelected) EtalonColors.navy2 else EtalonColors.surfaceBorder,
                    height = BAR_H,
                )
            }
        }
    }
}

/**
 * The m² line, with its unit only if the unit fits (§8: «the m² line is the one that yields», and
 * the unit is what yields first). At 360 dp and font scale 1,3 a cell is about 40 dp wide and
 * «525 м²» renders past its own padding — the old answer clipped, and a «м» cut down the middle
 * reads as a rendering fault rather than as a narrow column. Measured rather than guessed, because
 * how much text fits is a function of the width, the font scale AND the digits the day happens to
 * carry: «96 м²» still fits where «525 м²» does not, and a blanket rule would drop the unit off
 * cells that had room for it.
 *
 * [available] is the cell's width minus its own horizontal padding.
 */
@Composable
private fun areaLine(totalArea: BigDecimal, available: Dp): String {
    val withUnit = formatArea(totalArea)
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(withUnit, available, density) {
        val width = measurer.measure(
            withUnit,
            style = EtalonType.calendarArea,
            maxLines = 1,
            softWrap = false,
        ).size.width
        if (width <= with(density) { available.roundToPx() }) withUnit else formatDecimal(totalArea, AREA_PLACES)
    }
}

/**
 * The one float in the whole feature, computed in the draw and never stored (`Capacity.kt`).
 * A heavy threshold of zero is a server that has not been configured, not a day that is
 * infinitely full: it draws nothing.
 */
fun loadFraction(totalArea: BigDecimal, heavy: BigDecimal): Float =
    if (heavy.signum() <= 0) {
        0f
    } else {
        totalArea.divide(heavy, RATIO_SCALE, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)
    }

/**
 * The day cell's 3 dp bar and the day sheet's 5 dp one (§4.2, §4.5) — one component, so the two
 * can never disagree about what a full day looks like. [fraction] comes from [loadFraction].
 */
@Composable
fun LoadBar(
    fraction: Float,
    color: Color,
    track: Color,
    height: Dp,
    modifier: Modifier = Modifier,
) = Box(modifier.fillMaxWidth().height(height).clip(EtalonShapes.pill).background(track)) {
    if (fraction > 0f) {
        Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().clip(EtalonShapes.pill).background(color))
    }
}
