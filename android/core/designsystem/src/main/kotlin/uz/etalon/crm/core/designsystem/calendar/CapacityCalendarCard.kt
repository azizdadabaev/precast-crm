package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
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
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.gridRange
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatMonthYear
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/** Six weeks, seven days — `gridRange` hands back 42 dates, and the card never changes height. */
internal const val GRID_ROWS = 6
internal const val GRID_COLS = 7

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
 * The capacity calendar's month card (design §4.1–4.2): ‹ «Сентябрь 2026» › over its
 * «N буюртма · X м²» line, the Monday-first weekday heads, six rows of [DayCell] and the tier
 * legend. It lives in the design system rather than in `:feature:orders` because the calculator's
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
    modifier: Modifier = Modifier,
) {
    val data = capacity?.dataOrNull
    val loading = capacity is Resource.Loading && data == null

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
        if (loading) {
            CalendarSkeleton()
        } else {
            Grid(
                month = month,
                data = data,
                selected = selected,
                today = today,
                // A read-only picker with no floor of its own still cannot schedule into the past.
                floor = minSelectable ?: today.takeIf { readOnly },
                onSelect = onSelect,
                onPrev = onPrev,
                onNext = onNext,
            )
        }
        // No thresholds, no legend: the four bands are the server's own numbers (§4.1), and there
        // is nothing honest to print in their place while the month is still in flight.
        if (data != null) {
            Spacer(Modifier.height(LEGEND_GAP))
            CalendarLegend(data.thresholds)
        }
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
        if (data != null) {
            Text(
                stringResource(
                    R.string.ds_calendar_month_summary,
                    formatCountBare(data.totalOrders),
                    formatArea(data.totalArea),
                ),
                style = EtalonType.meta,
                color = EtalonColors.ink2,
                maxLines = 1,
                textAlign = TextAlign.Center,
            )
        }
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

@Composable
private fun Grid(
    month: YearMonth,
    data: CapacityMonth?,
    selected: LocalDate?,
    today: LocalDate,
    floor: LocalDate?,
    onSelect: (LocalDate) -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    val first = gridRange(month).start
    val threshold = with(LocalDensity.current) { SWIPE_MIN.toPx() }
    // A plain array, not a state: one flick arrives as dozens of deltas, and an observable
    // accumulator would recompose 42 cells per pointer event to move a number nothing draws.
    val travel = remember { floatArrayOf(0f) }
    val dragState = rememberDraggableState { travel[0] += it }

    Column(
        Modifier
            .fillMaxWidth()
            .draggable(
                state = dragState,
                orientation = Orientation.Horizontal,
                onDragStarted = { travel[0] = 0f },
                // Horizontal only, inside the screen's vertical scroller: when the finger moves
                // down the page the parent consumes the pointer first and cancels this gesture,
                // so the grid never steals a scroll.
                onDragStopped = {
                    val dx = travel[0]
                    travel[0] = 0f
                    when {
                        dx >= threshold -> onPrev()
                        dx <= -threshold -> onNext()
                    }
                },
            ),
        verticalArrangement = Arrangement.spacedBy(CELL_GAP),
    ) {
        repeat(GRID_ROWS) { r ->
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(CELL_GAP)) {
                repeat(GRID_COLS) { c ->
                    val date = first.plusDays((r * GRID_COLS + c).toLong())
                    val inMonth = YearMonth.from(date) == month
                    val day = data?.day(date) ?: CapacityDay(date, BigDecimal.ZERO, 0, 0)
                    // Zero m² is an EMPTY cell even when the day carries orders: §8's beams-only
                    // day shows its count on a white ground, because there is no load to colour.
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
                        isSelected = date == selected,
                        heavy = data?.thresholds?.heavy ?: BigDecimal.ZERO,
                        enabled = data != null && !dimmed,
                        onClick = { onSelect(date) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
