package uz.etalon.crm.feature.auth

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * §3.7's login page: the brand mark, «Кириш», the login name in a FormCard, the four PIN dots and
 * the restyled pad (ruling R6).
 *
 * **Light only** — the restyle is a light-only system (§1), so the dark frame this test used to
 * take is gone with the Material skin that drew it. No [uz.etalon.crm.core.designsystem.components.LocalNavPillInset]
 * either: this screen is outside the signed-in shell and there is no pill over it.
 *
 * The tablet frame stays because it is the one that catches the pad stretching to a width no
 * thumb can cross.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class LoginScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun show(padVisible: Boolean = true) = rule.setContent {
        EtalonTheme {
            LoginScreen(
                LoginUiState(loginName = "Азиз", pin = "12", error = null),
                {}, {}, {},
                padVisible = padVisible,
            )
        }
    }

    private fun shoot(name: String, padVisible: Boolean = true) {
        show(padVisible)
        rule.onRoot().captureRoboImage("screenshots/login_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light")
    @Test @Config(qualifiers = "w600dp-h960dp") fun tabletLight() = shoot("tablet_light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13")

    /**
     * I1. The login-name field raises the keyboard, and the root's `imePadding` then asks this
     * column for ~300 dp it does not have: the two weighted spacers hold about 230, the column
     * does not scroll, and the pad's last row («0» and «⌫») went off the bottom edge unreachable.
     * The pad steps aside instead — everything the operator is actually using, the card and the
     * dots, stays on screen and whole.
     *
     * The IME cannot be raised under Robolectric — `WindowInsets.isImeVisible` reports absent
     * whatever is focused — so the screen is driven through `padVisible`, which is exactly what
     * that inset feeds on a phone.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun keyboardLight() = shoot("keyboard_light", padVisible = false)

    /** And with the keyboard down the pad is back — every key of it, «0» included. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun theWholePadIsBackWhenTheKeyboardCloses() {
        show()
        rule.onNodeWithText("0").assertExists()
        rule.onNodeWithText("9").assertExists()
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun theKeyboardTakesThePadAway() {
        show(padVisible = false)
        rule.onNodeWithText("0").assertDoesNotExist()
        rule.onNodeWithText("9").assertDoesNotExist()
    }

    /**
     * The fit the clipping bug was about, asserted rather than photographed: at font scale 1,3 —
     * the largest the app supports — the pad's bottom row still ends inside the window. A frame
     * cannot say this, because a clipped key photographs as no key at all.
     */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun thePadEndsInsideTheWindowAtLargeFont() {
        show()
        val window = rule.onRoot().fetchSemanticsNode().size.height
        val padBottom = rule.onNodeWithText("0").fetchSemanticsNode().boundsInWindow.bottom
        assertTrue("«0» ends at $padBottom, past the window's $window", padBottom <= window)
    }
}
