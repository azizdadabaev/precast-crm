package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.designsystem.components.BarSparkline
import uz.etalon.crm.core.designsystem.components.SparklineBarAccent
import uz.etalon.crm.core.designsystem.components.sparklineBarTag
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import java.math.BigDecimal

/**
 * Design §2.3: the rail card's sparkline is eight bars whatever the data does. A month with no
 * bookings must not collapse the card — the eight floor stubs are what keeps the rail's three
 * cards the same height, and a series shorter than eight months pads rather than drawing six bars.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class BarSparklineTest {
    @get:Rule val rule = createComposeRule()

    private fun show(values: List<String>) = rule.setContent {
        EtalonTheme {
            Box(Modifier.width(200.dp)) { BarSparkline(values.map { BigDecimal(it) }) }
        }
    }

    @Test fun `an all-zero month still draws eight bars with height`() {
        show(List(8) { "0" })
        repeat(8) { i ->
            rule.onNodeWithTag(sparklineBarTag(i), useUnmergedTree = true)
                .assertIsDisplayed()
                .assertHeightIsAtLeast(1.dp)
        }
    }

    /** A series shorter than the window pads on the left rather than drawing fewer bars. */
    @Test fun `a short series still draws eight bars`() {
        show(listOf("4", "9", "2"))
        repeat(8) { i ->
            rule.onNodeWithTag(sparklineBarTag(i), useUnmergedTree = true).assertIsDisplayed()
        }
    }

    /** Eight, not ten: `bars` is a window, and a longer series is cut to its tail. */
    @Test fun `a longer series is cut to the last eight`() {
        show(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"))
        rule.onNodeWithTag(sparklineBarTag(7), useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithTag(sparklineBarTag(8), useUnmergedTree = true).assertDoesNotExist()
    }

    /** Height ∝ value ÷ max: the tallest bar fills the track and half the value is half the track. */
    @Test fun `a bar's height is its share of the largest value`() {
        show(listOf("0", "0", "0", "0", "0", "0", "50", "100"))
        val tallest = rule.onNodeWithTag(sparklineBarTag(7), useUnmergedTree = true)
            .getUnclippedBoundsInRoot().height
        val half = rule.onNodeWithTag(sparklineBarTag(6), useUnmergedTree = true)
            .getUnclippedBoundsInRoot().height
        assertTrue("the tallest bar should fill the track, was $tallest", tallest > 40.dp)
        assertTrue("half the value is about half the track, was $half of $tallest", half < tallest * 0.6f)
        assertTrue("half the value is about half the track, was $half of $tallest", half > tallest * 0.4f)
    }

    /** §2.3: the last bar is this month's, and it is the only indigo one. */
    @Test fun `only the last bar is accented`() {
        show(listOf("4", "9", "2", "7", "5", "8", "3", "6"))
        repeat(8) { i ->
            val accented = rule.onNodeWithTag(sparklineBarTag(i), useUnmergedTree = true)
                .fetchSemanticsNode().config[SparklineBarAccent]
            assertEquals("bar $i", i == 7, accented)
        }
    }
}
