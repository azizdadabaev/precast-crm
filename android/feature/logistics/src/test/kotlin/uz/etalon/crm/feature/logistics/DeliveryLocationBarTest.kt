package uz.etalon.crm.feature.logistics

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.feature.logistics.location.DeliveryLocationScreen
import uz.etalon.crm.feature.logistics.location.DeliveryLocationUiState

/** `logistics_action_save` and `action_clear_location` — the sticky bar's two buttons, and the only
 *  two nodes on this screen that carry those words. */
private const val SAVE = "Сақлаш"
private const val CLEAR = "Тозалаш"

/**
 * Ruling R13 at the behaviour, not only in a frame: this screen's bar is bottom-aligned over the
 * form rather than laid out under it, so the root's `imePadding` cannot move it out of the
 * keyboard's way — it has to leave. «Белги» and the two coordinate fields are typed at the foot of
 * the form, which is precisely where the bar otherwise sits.
 *
 * Robolectric reports the ime inset as absent whatever is focused, so the window cannot raise a
 * keyboard here; the screen's `barVisible` seam is driven instead, exactly as
 * `delivery_location_ime_light`, `dispatch_ime_light` and `delivery_proof_ime_light` drive it. What
 * the frames cannot state is that the buttons are *gone* rather than merely scrolled off, which is
 * what this asserts.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DeliveryLocationBarTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `the sticky bar steps aside while the keyboard is up and comes back after it`() {
        var barVisible by mutableStateOf(true)
        rule.setContent { EtalonTheme { Screen(barVisible) } }

        rule.onNodeWithText(SAVE).assertIsDisplayed()
        rule.onNodeWithText(CLEAR).assertIsDisplayed()

        barVisible = false
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertDoesNotExist()
        rule.onNodeWithText(CLEAR).assertDoesNotExist()

        // And back the moment the field is done with: a bar that only ever left would be a screen
        // that cannot be saved from.
        barVisible = true
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertIsDisplayed()
        rule.onNodeWithText(CLEAR).assertIsDisplayed()
    }

    @Composable
    private fun Screen(barVisible: Boolean) = DeliveryLocationScreen(
        s = DeliveryLocationUiState(lat = 41.311081, lng = 69.240562, label = "Кўк дарвоза"),
        onBack = {}, onRefresh = {}, onUseMyLocation = {}, onLinkInputChange = {},
        onResolveLink = {}, onManualInputChange = {}, onApplyManualInput = {},
        onLabelChange = {}, onSave = {}, onClear = {},
        barVisible = barVisible,
    )
}
