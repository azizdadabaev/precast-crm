package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
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
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.testing.CalendarFixtures
import java.time.LocalDate

private const val CARD = "capacity-card"

/** The 12 September cell, found by the sentence the cell publishes for TalkBack. */
private const val TWELFTH = "12 сен 2026"

/**
 * The two things about this card that a screenshot cannot prove: that selecting a day does not
 * move it, and that a day cell is big enough to hit on the narrowest phone the CRM supports.
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
