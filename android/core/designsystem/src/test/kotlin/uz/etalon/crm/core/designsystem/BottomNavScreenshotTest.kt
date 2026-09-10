package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.BottomNav
import uz.etalon.crm.core.designsystem.components.BottomNavItem
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** D3's five cells with the real labels and the real glyphs — the list phase 2 will build from
 *  permissions. «Буюртма» is the longest label and therefore the one the 360 dp gate uses. */
private val NAV_ITEMS = listOf(
    BottomNavItem(EtalonIcons.House, "Бош", "Бошқарув"),
    BottomNavItem(EtalonIcons.Package, "Буюртма", "Буюртмалар"),
    BottomNavItem(EtalonIcons.Calculator, "Ҳисоб", "Ҳисоблагич"),
    BottomNavItem(EtalonIcons.Wallet, "Тўлов", "Тўловлар"),
    BottomNavItem(EtalonIcons.Users, "Мижоз", "Мижозлар"),
)

private const val LONGEST = "Буюртма"

/**
 * The floating pill, §4. The light sheet draws it once per active cell so a reviewer can see that
 * the white pill grows to its own label while the four icon-only cells stay equal — which is how
 * `2b-home.png` and `2b-payments.png` draw it.
 *
 * [fiveCellsFitAt360dp] is the real gate design §10 asks for, not a note: five cells (D3) where
 * the spec drew four, on the narrowest phone the app supports, with the longest label active.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class BottomNavScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun bottomNavLight() {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    NAV_ITEMS.indices.forEach { i -> BottomNav(NAV_ITEMS, selectedIndex = i, onSelect = {}) }
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_bottom_nav_light.png")
    }

    @Test
    @Config(sdk = [36], qualifiers = "w360dp-h800dp")
    fun bottomNav360Light() {
        rule.setContent { EtalonTheme { Narrow() } }
        rule.onRoot().captureRoboImage("screenshots/ds_bottom_nav_360_light.png")
    }

    /**
     * The gate. Two claims, both measured rather than eyeballed:
     *
     * 1. the active label is drawn at its natural width — `Text` here has the default
     *    `TextOverflow.Clip`, so a label that does not fit is silently cut and its laid-out width
     *    collapses to the space it was given; comparing against the same string measured
     *    unconstrained catches exactly that, and an ellipsis would show up the same way;
     * 2. every cell still holds a 48 dp hit area (D7) once the active one has taken its share.
     */
    @Test
    @Config(sdk = [36], qualifiers = "w360dp-h800dp")
    fun fiveCellsFitAt360dp() {
        var naturalLabelPx = 0
        rule.setContent {
            EtalonTheme {
                val measurer = rememberTextMeasurer()
                naturalLabelPx = measurer.measure(AnnotatedString(LONGEST), EtalonType.label, maxLines = 1).size.width
                Narrow()
            }
        }

        val drawnLabelPx = rule.onNodeWithText(LONGEST, useUnmergedTree = true).fetchSemanticsNode().size.width
        // `size`, not `touchBoundsInRoot`: the cells are adjacent, so the drawn cell has to be
        // 48 dp on its own — there is no clear air for the input layer to expand a small one into.
        val cells = rule.onAllNodes(hasClickAction(), useUnmergedTree = true).fetchSemanticsNodes()
        val minTouchPx = with(rule.density) { EtalonSpace.minTouch.roundToPx() }
        val toDp = { px: Int -> "%.1f dp".format(px / rule.density.density) }

        assertEquals("five cells (D3)", NAV_ITEMS.size, cells.size)
        assertTrue(
            "«$LONGEST» is clipped at 360 dp: drawn ${toDp(drawnLabelPx)} of ${toDp(naturalLabelPx)}",
            drawnLabelPx >= naturalLabelPx,
        )
        cells.forEachIndexed { i, cell ->
            assertTrue(
                "cell $i is ${toDp(cell.size.width)} × ${toDp(cell.size.height)}, under the 48 dp hit area",
                cell.size.width >= minTouchPx && cell.size.height >= minTouchPx,
            )
        }
    }
}

@Composable
private fun Narrow() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 12.dp),
) {
    BottomNav(NAV_ITEMS, selectedIndex = 1, onSelect = {})
}
