package uz.etalon.crm.feature.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so this frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/**
 * The screen had **no baseline at all** — it was three Material text fields on a `Scaffold`, and
 * nobody could see that it had stayed behind while every other form in the app moved to §2's card.
 *
 * Two frames because the screen is two screens: the voluntary change reached from the account
 * sheet, which has a back arrow and a nav pill to clear, and the forced one, which is a gate with
 * neither, no «Жорий PIN» field, and a line saying why it is there.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ChangePinScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun shoot(name: String, forced: Boolean) {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides if (forced) 0.dp else SHELL_NAV_PILL_INSET) {
                    ChangePinScreen(
                        state = ChangePinUiState(current = "1234", next = "5678", confirm = "5678"),
                        forced = forced,
                        onCurrent = {}, onNext = {}, onConfirm = {}, onSubmit = {}, onBack = {},
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/change_pin_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light", forced = false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun forcedLight() = shoot("forced_light", forced = true)
}
