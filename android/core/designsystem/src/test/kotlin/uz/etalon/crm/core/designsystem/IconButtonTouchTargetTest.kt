package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Row
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * D7 on the component every header, row and stepper is built out of. [EtalonIconButton] paints a
 * 36–40 dp pill inside a 48 dp box, and for five phases the click hung off the *pill* — so the
 * box reserved the space D7 asks for and nothing claimed it. The assertion below is on the
 * **clickable node's own bounds**, not on the layout around it: `clickable` merges its
 * descendants, so the node carrying the content description IS the node that takes the tap, and
 * a click moved back inside the pill fails this immediately.
 *
 * Both the default 40 dp pill and the 36 dp one a row uses are checked: the smaller the painted
 * button, the more of the target comes from the box.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class IconButtonTouchTargetTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `every icon button takes the whole 48 dp slot whatever the pill measures`() {
        rule.setContent {
            EtalonTheme {
                Row {
                    EtalonIconButton(EtalonIcons.ArrowLeft, DEFAULT, onClick = {})
                    EtalonIconButton(EtalonIcons.X, SMALL, onClick = {}, size = 36.dp, shape = EtalonShapes.md)
                }
            }
        }
        for (cd in listOf(DEFAULT, SMALL)) {
            rule.onNodeWithContentDescription(cd)
                .assertWidthIsAtLeast(48.dp)
                .assertHeightIsAtLeast(48.dp)
        }
    }

    private companion object {
        const val DEFAULT = "Орқага"
        const val SMALL = "Ёпиш"
    }
}
