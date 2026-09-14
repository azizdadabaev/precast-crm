package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.DAYS_PER_WEEK
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.gridRange
import uz.etalon.crm.core.model.gridRows
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatMonthYear
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/** Seven columns, Monday first. How many ROWS is the month's own business — `gridRows`, R16. */
internal const val GRID_COLS = DAYS_PER_WEEK

/** The grid alone, for the screen-level swipe tests: a vertical drag over it must scroll the
 *  page and a horizontal one must page the month, and only a running screen can tell them apart. */
const val GRID_TEST_TAG = "capacity-grid"

private val HEADER_GAP = 10.dp
private val WEEKDAY_GAP = 6.dp
private val LEGEND_GAP = 12.dp

/** Past this much horizontal travel a drag is a month change, not a mis-aimed tap. */
private val SWIPE_MIN = 48.dp

private val WEEKDAYS = listOf(
    R.string.ds_calendar_weekday_mo, R.string.ds_calendar_weekday_tu, R.string.ds_calendar_weekday_we,
    R.string.ds_calendar_weekday_th, R.string.ds_calendar_weekday_fr, R.string.ds_calendar_weekday_sa,
    R.string.ds_calendar_weekday_su,
)

/**
 * The capacity calendar's month card (design §4.1–4.2): ‹ «Сентябр 2026» › over its
 * «N буюртма · X м²» line, the Monday-first weekday heads, as many rows of [DayCell] as the month
 * needs (`gridRows` — R16: never a week made entirely of next-month days) and the tier legend. It
 * lives in the design system rather than in `:feature:orders` because the calculator's
 * delivery-date picker (§7) draws the very same grid — ruling R12.
 *
 * The card owns no margins: a screen places it with `EtalonSpace.cardMargin` through [modifier],
 * the way every other card on this phone is placed.
 *
 * Selecting a day changes nothing about the card's size — a selected cell draws the same three
 * lines on navy — so the day sheet grows underneath without the grid moving (§4.4, the
 * acceptance's «no layout jump»). `CapacityCalendarTest` measures that rather than trusting it.
 *
 * @param capacity null before the calendar has ever been opened, so a planner who stays on
 *   Рўйхат never costs a fetch. [Resource.Loading] with nothing cached draws [CalendarSkeleton];
 *   [Resource.Error] with nothing cached draws the dates with no figures and no taps — §8 forbids
 *   inventing zeros, and the screen puts the retry banner above the card.
 * @param today the caller's clock, never `LocalDate.now()` here: a component that reads the clock
 *   photographs differently every day it is recorded.
 * @param readOnly the calculator's picker (§7). Nothing about the drawing changes; it is what
 *   makes «no delivery into the past» the default there without every call site remembering to
 *   pass [minSelectable] — read-only with no floor of its own cannot select before [today].
 * @param minSelectable the earliest tappable day. Earlier days are drawn exactly as an adjacent
 *   month's are: dimmed and inert.
 * @param selectableWithoutData **ruling R17** — the calculator's picker (§7) stays usable with no
 *   figures behind it. A day is a day whether or not the factory's load for it arrived, and the
 *   place-order sheet has no other way to name a delivery date: a grid that went inert offline
 *   would leave the operator unable to place OR queue the order. In Жадвал it stays false — there
 *   a tap opens a day sheet that would have nothing to show.
 */
@Composable
fun CapacityCalendarCard(
    month: YearMonth,
    capacity: Resource<CapacityMonth>?,
    selected: LocalDate?,
    today: LocalDate,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onSelect: (LocalDate) -> Unit,
    readOnly: Boolean = false,
    minSelectable: LocalDate? = null,
    selectableWithoutData: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val data = capacity?.dataOrNull
    val loading = capacity is Resource.Loading && data == null
    // The last thresholds this card was given, so the invisible legend below reserves the height
    // the real one will take. `DEFAULT` only on the very first load, before any month has arrived.
    // A plain holder rather than a State: nothing needs to recompose when it changes — the pass
    // that writes it is already drawing the real legend, and the pass that reads it is the next
    // month's, which the capacity change recomposed anyway.
    val lastThresholds = remember { arrayOf(CapacityThresholds.DEFAULT) }
    if (data != null) lastThresholds[0] = data.thresholds

    Column(
        modifier
            .fillMaxWidth()
            .clip(EtalonShapes.xl)
            .background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
    ) {
        Header(month, data, onPrev, onNext)
        Spacer(Modifier.height(HEADER_GAP))
        WeekdayRow()
        Spacer(Modifier.height(WEEKDAY_GAP))
        // R16: the same row count either way, so the in-flight card is exactly as tall as the
        // loaded one — how many weeks September has is known before a single figure arrives.
        val rows = gridRows(month)
        // R17: a picker that must stay usable draws its dates straight away rather than a
        // skeleton — a skeleton has no days to tap, and an in-flight month would be one more
        // moment in which no delivery date can be named.
        if (loading && !selectableWithoutData) {
            CalendarSkeleton(rows)
        } else {
            Grid(
                month = month,
                data = data,
                selected = selected,
                today = today,
                // A read-only picker with no floor of its own still cannot schedule into the past.
                floor = minSelectable ?: today.takeIf { readOnly },
                rows = rows,
                selectableWithoutData = selectableWithoutData,
                onSelect = onSelect,
                onPrev = onPrev,
                onNext = onNext,
            )
        }
        Spacer(Modifier.height(LEGEND_GAP))
        // No thresholds, no legend: the four bands are the server's own numbers (§4.1), and there
        // is nothing honest to print in their place while the month is still in flight. It still
        // has to occupy its own height, though — paging to a month that is not cached yet would
        // otherwise shorten the card by the legend's ~26 dp and snap it back when the fetch lands,
        // under a day sheet that would jump with it. So the row is drawn either way and simply
        // made invisible, at whatever thresholds were last known (the factory's capacity does not
        // change between two months, so the width — and therefore the wrap at font scale 1,3 — is
        // the one the real legend will take).
        CalendarLegend(
            thresholds = data?.thresholds ?: lastThresholds[0],
            modifier = if (data == null) Modifier.alpha(0f).clearAndSetSemantics { } else Modifier,
        )
    }
}

@Composable
private fun Header(month: YearMonth, data: CapacityMonth?, onPrev: () -> Unit, onNext: () -> Unit) = Row(
    Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIconButton(EtalonIcons.ChevronLeft, stringResource(R.string.ds_calendar_prev), onPrev)
    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(formatMonthYear(month), style = EtalonType.titleSm, color = EtalonColors.ink, maxLines = 1)
        // A single space while the month is in flight: the summary is the server's own count and
        // area, and there is nothing honest to put in its place — but the line keeps its height so
        // paging to an uncached month does not shorten the card and lift the grid under the
        // planner's finger. One line of `meta` is one line of `meta` whatever glyphs are in it.
        Text(
            if (data != null) {
                stringResource(
                    R.string.ds_calendar_month_summary,
                    formatCountBare(data.totalOrders),
                    formatArea(data.totalArea),
                )
            } else {
                " "
            },
            style = EtalonType.meta,
            color = EtalonColors.ink2,
            maxLines = 1,
            textAlign = TextAlign.Center,
        )
    }
    EtalonIconButton(EtalonIcons.ChevronRight, stringResource(R.string.ds_calendar_next), onNext)
}

@Composable
private fun WeekdayRow() = Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(CELL_GAP)) {
    WEEKDAYS.forEach { res ->
        Text(
            stringResource(res),
            style = EtalonType.labelSm,
            color = EtalonColors.ink3,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * Whether every m² figure the grid is about to draw fits its column **with** «м²» beside it —
 * §8's yield, decided once for the whole grid rather than once per cell.
 *
 * Per cell it was cheaper and wrong: how much text fits is a function of the width, the font scale
 * AND the digits the day happens to carry, so at 360 dp × 1,3 «96 м²» kept its unit in the column
 * beside a «525» that had lost it — one table printing two different units, which reads as a
 * rendering fault rather than as a narrow column. The grid measures the widest figure it holds and
 * every cell obeys the answer; when the unit goes, the legend's own «≤300 м²» carries the scale.
 *
 * Measured rather than guessed: a blanket «drop it under 44 dp» would strip the unit off the
 * roomy 411 dp phone the moment the type grew a half point.
 */
@Composable
private fun unitFitsGrid(data: CapacityMonth?, first: LocalDate, rows: Int, available: Dp): Boolean {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(data, first, rows, available, density) {
        // Nothing to draw yet: an unloaded grid has no figures, and the next pass — the one that
        // has them — is the one that decides.
        if (data == null) return@remember true
        val limit = with(density) { available.roundToPx() }
        (0 until rows * GRID_COLS)
            .map { data.day(first.plusDays(it.toLong())).totalArea }
            .filter { it.signum() > 0 }
            .map { formatArea(it) }
            .distinct()
            .all { measurer.measure(it, style = EtalonType.calendarArea, maxLines = 1, softWrap = false).size.width <= limit }
    }
}

@Composable
private fun Grid(
    month: YearMonth,
    data: CapacityMonth?,
    selected: LocalDate?,
    today: LocalDate,
    floor: LocalDate?,
    rows: Int,
    selectableWithoutData: Boolean,
    onSelect: (LocalDate) -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    // **M1** — the loaded month's own `range` is the grid the fetch actually covered, so the card
    // draws the days it was given rather than a second, independently recomputed guess at them.
    // The two agree today (`CapacityRepository` asks with exactly `gridRange`), which is the point:
    // one of them has to be the source, and it is the data. `gridRange` is the fallback for the
    // passes that have no month yet — the skeleton, the failed month, the picker before its fetch.
    val first = (data?.range ?: gridRange(month)).start
    val prev by rememberUpdatedState(onPrev)
    val next by rememberUpdatedState(onNext)

    // The grid measures itself once so every cell knows how much room its m² line has — the one
    // thing that decides whether «м²» is drawn beside the figure (`DayCell.areaLine`). One
    // subcomposition here rather than forty-two `BoxWithConstraints` inside the cells.
    BoxWithConstraints(Modifier.fillMaxWidth().testTag(GRID_TEST_TAG)) {
        val cellWidth = (maxWidth - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS
        val showUnit = unitFitsGrid(data, first, rows, cellWidth - CELL_PAD_H * 2)
        val threshold = with(LocalDensity.current) { SWIPE_MIN.toPx() }
        Column(
            Modifier
                .fillMaxWidth()
                // Horizontal only, inside the screen's vertical scroller. `detectHorizontalDrag`
                // rather than `draggable` for one reason: it reports a CANCELLED drag separately
                // from a finished one. `draggable`'s `onDragStopped` fires on both, so a drag the
                // enclosing list took over — a diagonal flick, a scroll that started sideways —
                // arrived here looking exactly like a deliberate swipe and paged the month under
                // a planner who was only scrolling. `onDragCancel` simply drops the travel.
                .pointerInput(Unit) {
                    var travel = 0f
                    detectHorizontalDragGestures(
                        onDragStart = { travel = 0f },
                        onDragCancel = { travel = 0f },
                        onDragEnd = {
                            when {
                                travel >= threshold -> prev()
                                travel <= -threshold -> next()
                            }
                            travel = 0f
                        },
                        onHorizontalDrag = { _, dx -> travel += dx },
                    )
                },
            verticalArrangement = Arrangement.spacedBy(CELL_GAP),
        ) {
            repeat(rows) { r ->
                Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(CELL_GAP)) {
                    repeat(GRID_COLS) { c ->
                        val date = first.plusDays((r * GRID_COLS + c).toLong())
                        val inMonth = YearMonth.from(date) == month
                        val day = data?.day(date) ?: CapacityDay(date, BigDecimal.ZERO, 0, 0)
                        // Zero m² is an EMPTY cell even when the day carries orders: §8's
                        // beams-only day shows its count on a white ground, because there is no
                        // load to colour.
                        val tier = data?.takeIf { day.totalArea.signum() > 0 }
                            ?.let { tierFor(day.totalArea, it.thresholds) }
                        // A day before the picker's floor fades exactly as an adjacent month's day
                        // does: both are days this planner is not being offered (§4.2, §7).
                        val dimmed = !inMonth || (floor != null && date.isBefore(floor))
                        DayCell(
                            day = day,
                            tier = tier,
                            dimmed = dimmed,
                            isToday = date == today,
                            // R7: a selection that has left the cursor month stays selected — the
                            // chip in Рўйхат carries it — but the greyed cell that happens to hold
                            // the same date in the *adjacent* month is not it, and drawing that
                            // one navy would tell the planner they had picked a day they had not.
                            isSelected = date == selected && inMonth,
                            heavy = data?.thresholds?.heavy ?: BigDecimal.ZERO,
                            // R17: without figures a cell is still a DATE, and the picker lets it
                            // be tapped as one. Жадвал keeps the stricter rule — there a tap opens
                            // a day sheet that would have nothing in it.
                            enabled = (data != null || selectableWithoutData) && !dimmed,
                            showUnit = showUnit,
                            onClick = { onSelect(date) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}
