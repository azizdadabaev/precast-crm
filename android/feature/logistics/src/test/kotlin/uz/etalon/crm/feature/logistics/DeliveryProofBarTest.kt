package uz.etalon.crm.feature.logistics

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofScreen
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofUiState

/** `action_mark_delivered` — the sticky bar's only button, and the one control on this screen that
 *  writes the cash the driver is holding. */
private const val DELIVERED = "Етказилди"

/**
 * Ruling R13 at the behaviour, the same rule `DeliveryLocationBarTest` pins for the location
 * screen: this bar is bottom-aligned over the form rather than laid out under it, so the root's
 * `imePadding` cannot move it out of the keyboard's way — it has to leave. «Сабабини ёзинг» is
 * typed at the foot of the form, which is precisely where the bar otherwise sits.
 *
 * Robolectric reports the ime inset as absent whatever is focused, so the window cannot raise a
 * keyboard here; the screen's `barVisible` seam is driven instead, exactly as
 * `delivery_proof_ime_light` drives it. What that frame cannot state is that the button is *gone*
 * rather than merely scrolled off, and — the half no frame can carry at all — that it comes back
 * when the field is done with. A bar that only ever left would be a delivery that cannot be
 * recorded.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DeliveryProofBarTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `the sticky bar steps aside while the keyboard is up and comes back after it`() {
        var barVisible by mutableStateOf(true)
        rule.setContent { EtalonTheme { Screen(barVisible) } }

        rule.onNode(hasText(DELIVERED) and hasClickAction()).assertIsDisplayed()

        barVisible = false
        rule.waitForIdle()

        rule.onNode(hasText(DELIVERED) and hasClickAction()).assertDoesNotExist()

        barVisible = true
        rule.waitForIdle()

        rule.onNode(hasText(DELIVERED) and hasClickAction()).assertIsDisplayed()
    }

    /** «Нақд олинмади» on, so «Сабабини ёзинг» is the field being typed — the state
     *  `delivery_proof_ime_light` is photographed in. */
    @Composable
    private fun Screen(barVisible: Boolean) = DeliveryProofScreen(
        s = DeliveryProofUiState(
            noCashCollected = true,
            note = "Мижоз жойида йўқ эди",
            driverReturned = true,
        ),
        onBack = {}, onRetake = {}, onSetAmountDigits = {}, onSetNoCashCollected = {},
        onSetNote = {}, onSetDriverReturned = {}, onSubmit = {},
        barVisible = barVisible,
    )
}
