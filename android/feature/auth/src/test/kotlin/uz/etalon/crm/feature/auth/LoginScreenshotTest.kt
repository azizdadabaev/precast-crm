package uz.etalon.crm.feature.auth

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
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

    private fun shoot(name: String) {
        rule.setContent {
            EtalonTheme {
                LoginScreen(LoginUiState(loginName = "Азиз", pin = "12", error = null), {}, {}, {})
            }
        }
        rule.onRoot().captureRoboImage("screenshots/login_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light")
    @Test @Config(qualifiers = "w600dp-h960dp") fun tabletLight() = shoot("tablet_light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13")
}
