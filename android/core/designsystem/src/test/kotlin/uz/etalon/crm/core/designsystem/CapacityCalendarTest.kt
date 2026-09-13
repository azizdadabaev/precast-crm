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
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.testing.CalendarFixtures
import java.time.LocalDate

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
