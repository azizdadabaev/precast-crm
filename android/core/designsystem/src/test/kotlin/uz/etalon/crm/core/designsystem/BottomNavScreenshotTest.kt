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

/** §4's side margin, restated here because `BottomNav` keeps its geometry private. */
private val BAR_SIDE_MARGIN = 16.dp

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
     * The gate. Three claims, all measured rather than eyeballed:
     *
     * 1. the active label is drawn at its natural width — `Text` here has the default
     *    `TextOverflow.Clip`, so a label that does not fit is silently cut and its laid-out width
     *    collapses to the space it was given; comparing against the same string measured
     *    unconstrained catches exactly that, and an ellipsis would show up the same way;
     * 2. every cell still holds a 48 dp hit area (D7) once the active one has taken its share;
     * 3. the five cells together still fit inside §4's 16 dp side margins.
     */
    @Test
    @Config(sdk = [36], qualifiers = "w360dp-h800dp")
    fun fiveCellsFitAt360dp() {
        assertNarrowBarHolds()
    }

    /**
     * The same gate at the largest font scale the app is tested against. It is the tightest case
     * the bar ever sees: the label grows with the scale while the dot, the glyph and the paddings
     * do not, so the four icon-only cells are what pays for it.
     *
     * Measured 2026-09-11: «Буюртма» is 62,0 dp at fontScale 1,3 (53,0 at 1,0), the active cell
     * 120,0 dp, and each of the four others 49,0 dp — 1 dp above D7's floor. The label is drawn
     * whole; no runtime floor is needed and none is implemented. `ds_bottom_nav_360_font13_light`
     * is what that looks like.
     */
    @Test
    @Config(sdk = [36], qualifiers = "w360dp-h800dp", fontScale = 1.3f)
    fun fiveCellsFitAt360dpAtFontScale13() {
        assertNarrowBarHolds()
    }

    /** The font-scale-1,3 twin of [bottomNav360Light] — the owner sees the tightest bar there is. */
    @Test
    @Config(sdk = [36], qualifiers = "w360dp-h800dp", fontScale = 1.3f)
    fun bottomNav360FontScale13Light() {
        rule.setContent { EtalonTheme { Narrow() } }
        rule.onRoot().captureRoboImage("screenshots/ds_bottom_nav_360_font13_light.png")
    }

    private fun assertNarrowBarHolds() {
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
        // §4's floating pill keeps a 16 dp margin either side; the cells live inside that, so if
        // they outgrow it the bar is already off the screen and the reviewer cannot see it happen.
        val rootPx = rule.onRoot().fetchSemanticsNode().size.width
        val marginsPx = with(rule.density) { (BAR_SIDE_MARGIN * 2).roundToPx() }
        val cellsPx = cells.sumOf { it.size.width }
        assertTrue(
            "the five cells measure ${toDp(cellsPx)} — wider than the ${toDp(rootPx - marginsPx)} the bar has",
            cellsPx <= rootPx - marginsPx,
        )
    }
}

@Composable
private fun Narrow() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 12.dp),
) {
    BottomNav(NAV_ITEMS, selectedIndex = 1, onSelect = {})
}
