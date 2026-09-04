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

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class LoginScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun shoot(name: String, dark: Boolean) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                LoginScreen(LoginUiState(loginName = "Азиз", pin = "12", error = null), {}, {}, {})
            }
        }
        rule.onRoot().captureRoboImage("screenshots/login_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun phoneLight() = shoot("phone_light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun phoneDark() = shoot("phone_dark", true)
    @Test @Config(qualifiers = "w600dp-h960dp") fun tabletLight() = shoot("tablet_light", false)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun phoneLargeFont() = shoot("phone_font13", false)
}
