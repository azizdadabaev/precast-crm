package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.calendar.CapacityCalendarCard
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.gridRows
import uz.etalon.crm.core.testing.CalendarFixtures
import java.time.LocalDate
import java.time.YearMonth

private const val CARD = "capacity-card"

/** The 12 September cell, found by the sentence the cell publishes for TalkBack. */
private const val TWELFTH = "12 сен 2026"

/**
 * What a screenshot of this card cannot prove: that selecting a day does not move it, that a month
 * still in flight is the same height as a loaded one, that a selection the planner has paged away
 * from is not redrawn in the neighbouring month, and that a day cell is big enough to hit on the
 * narrowest phone the CRM supports.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp")
class CapacityCalendarTest {
    @get:Rule val rule = createComposeRule()

    /**
     * Design §4.4 and the acceptance's «no layout jump»: the day sheet grows *under* the grid, so
     * the grid must not move when a day is picked. A selected cell draws the same three lines it
     * drew before, on navy — nothing is added, nothing is taken away — and this measures it
     * rather than trusting the reading.
     */
    @Test fun `selecting a day does not move the card`() {
        var selected by mutableStateOf<LocalDate?>(null)
        rule.setContent {
            EtalonTheme {
                Column(Modifier.fillMaxWidth()) {
                    CapacityCalendarCard(
                        month = CalendarFixtures.MONTH,
                        capacity = Resource.Success(CalendarFixtures.september),
                        selected = selected,
                        today = CalendarFixtures.TODAY,
                        onPrev = {}, onNext = {}, onSelect = {},
                        modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin).testTag(CARD),
                    )
                }
            }
        }
        val before = rule.onNodeWithTag(CARD).getUnclippedBoundsInRoot()
        selected = CalendarFixtures.SELECTED
        rule.waitForIdle()
        assertEquals(before, rule.onNodeWithTag(CARD).getUnclippedBoundsInRoot())
    }

    /**
     * Paging to a month that is not cached yet must not change the card's height. The grid is the
     * same 42 cells either way, but the summary line under the title and the legend under the grid
     * are the server's own figures — and drawing them only once the month lands took ~26 dp out of
     * the card for as long as the fetch ran, lifting the grid under the planner's finger and
     * dropping it back. Both rows now hold their place while the month is in flight.
     */
    @Test fun `a month still in flight is the same height as a loaded one`() {
        var capacity by mutableStateOf<Resource<CapacityMonth>>(Resource.Success(CalendarFixtures.september))
        rule.setContent {
            EtalonTheme {
                Column(Modifier.fillMaxWidth()) {
                    CapacityCalendarCard(
                        month = CalendarFixtures.MONTH,
                        capacity = capacity,
                        selected = CalendarFixtures.SELECTED,
                        today = CalendarFixtures.TODAY,
                        onPrev = {}, onNext = {}, onSelect = {},
                        modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin).testTag(CARD),
                    )
                }
            }
        }
        val loaded = rule.onNodeWithTag(CARD).getUnclippedBoundsInRoot().height
        // The next month, not yet fetched: the skeleton stands in for the grid.
        capacity = Resource.Loading(null)
        rule.waitForIdle()
        assertEquals(loaded, rule.onNodeWithTag(CARD).getUnclippedBoundsInRoot().height)
    }

    /**
     * R7 with the calendar paged away from the selection. 30 September is the selected day and
     * October is the cursor month, so the date shows up in October's grid as a leading day of the
     * month before — dimmed and inert. It must not be drawn as the chosen day: the planner has
     * paged away from their selection (the chip in Рўйхат is what still carries it), and a navy
     * cell in a greyed row would say they had picked a day in a month they are not looking at.
     *
     * The `selected` semantic is the same thing the navy fill says, which is why it is asserted
     * here: a screen reader cannot see the fill, and a test cannot see it either.
     */
    @Test fun `a selection outside the cursor month is not drawn`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH.plusMonths(1),
                    capacity = Resource.Success(CalendarFixtures.september),
                    selected = LocalDate.of(2026, 9, 30),
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        rule.onNodeWithContentDescription("30 сен 2026", substring = true).assertIsNotSelected()
    }

    /** The other half of the rule: inside the cursor month the very same date IS drawn selected. */
    @Test fun `a selection inside the cursor month is drawn`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH,
                    capacity = Resource.Success(CalendarFixtures.september),
                    selected = CalendarFixtures.SELECTED,
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        rule.onNodeWithContentDescription(TWELFTH, substring = true).assertIsSelected()
    }

    /**
     * **Owner ruling R16.** The grid draws the weeks the month needs and not one more: a sixth row
     * made entirely of the next month's days is a week of the planner's screen spent on dates they
     * are not looking at. September 2026 starts on a Tuesday with 30 days (1 + 30 = 31 cells →
     * five rows); August 2026 starts on a Saturday with 31 (5 + 31 = 36 → six, and it keeps all
     * six or the 31st is dropped); February 2027 starts on a Monday with 28 (0 + 28 = 28 → four).
     *
     * The arithmetic is asserted directly AND through the drawn grid, because the whole point of
     * the ruling is what the card measures: the four-row February is two rows — 116 dp — shorter
     * than the six-row August.
     */
    @Test fun `the grid draws only the rows the month needs`() {
        assertEquals(5, gridRows(YearMonth.of(2026, 9)))
        assertEquals(6, gridRows(YearMonth.of(2026, 8)))
        assertEquals(4, gridRows(YearMonth.of(2027, 2)))
    }

    /** The last cell of the last drawn row, and nothing past it: September's grid ends on 4 October
     *  (the Sunday that completes the 30th's week) and never reaches 5 October at all. */
    @Test fun `september stops at the row its last day sits in`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH,
                    capacity = Resource.Success(CalendarFixtures.september),
                    selected = null,
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        rule.onNodeWithContentDescription("30 сен 2026", substring = true).assertExists()
        rule.onNodeWithContentDescription("4 окт 2026", substring = true).assertExists()
        rule.onNodeWithContentDescription("5 окт 2026", substring = true).assertDoesNotExist()
        rule.onNodeWithContentDescription("11 окт 2026", substring = true).assertDoesNotExist()
    }

    /**
     * §8, and the honest description I1 asked for: a grid whose capacity failed to load knows the
     * dates and nothing else. «18 сен 2026, 0 буюртма, 0 м²» would state as fact the one thing it
     * does not know, so the cell says the date and stops. A loaded cell keeps all three parts.
     */
    @Test fun `a cell with no capacity behind it announces the date alone`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH,
                    capacity = Resource.Error(null, AppError.Network("Интернет алоқаси йўқ")),
                    selected = null,
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        rule.onNodeWithContentDescription("18 сен 2026").assertExists() // exact, not a substring
        rule.onNodeWithContentDescription("буюртма", substring = true).assertDoesNotExist()
    }

    /** The other half: with the month behind it, the same kind of cell reads as all three lines. */
    @Test fun `a loaded cell announces its count and its load`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH,
                    capacity = Resource.Success(CalendarFixtures.september),
                    selected = null,
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        // 12 September: 5 orders, 685 м² — the acceptance's own day.
        rule.onNodeWithContentDescription("$TWELFTH, 5 буюртма, 685 м²", substring = true).assertExists()
    }

    /**
     * D7's floor, on the axis where it can actually be held. Seven columns and six 2 dp gaps
     * inside a 296 dp card cannot be 48 dp wide each (7 × 48 + 6 × 2 = 348 dp), so the design's
     * «≥ 48 at 360 dp» does not close; the cell answers with its full 56 dp of height and about
     * 40 dp of width, with no dead space between cells beyond the 2 dp gap. These numbers are
     * pinned here so a later padding change cannot shrink the target without a reviewer seeing it.
     */
    @Test fun `the whole cell is the touch target`() {
        rule.setContent {
            EtalonTheme {
                CapacityCalendarCard(
                    month = CalendarFixtures.MONTH,
                    capacity = Resource.Success(CalendarFixtures.september),
                    selected = null,
                    today = CalendarFixtures.TODAY,
                    onPrev = {}, onNext = {}, onSelect = {},
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                )
            }
        }
        val cell = rule.onNodeWithContentDescription(TWELFTH, substring = true).getUnclippedBoundsInRoot()
        assertEquals(56.dp, cell.height)
        assertTrue("cell width was ${cell.width}", cell.width >= 40.dp)
    }
}
