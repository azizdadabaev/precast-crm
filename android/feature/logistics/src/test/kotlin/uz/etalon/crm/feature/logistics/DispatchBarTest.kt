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
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.feature.logistics.dispatch.DispatchScreen
import uz.etalon.crm.feature.logistics.dispatch.DispatchUiState

/** `action_dispatch` — and, the same word, `dispatch_title` one header above it. Which is why the
 *  assertions below ask for the node that is also clickable: the heading is not. */
private const val DISPATCH = "Жўнатиш"

/**
 * Ruling R13 at the behaviour, the same rule `DeliveryLocationBarTest` pins for the location
 * screen: this bar is bottom-aligned over the form rather than laid out under it, so the root's
 * `imePadding` cannot move it out of the keyboard's way — it has to leave. «Машина рақами» is typed
 * at the foot of the form, which is precisely where the bar otherwise sits.
 *
 * Robolectric reports the ime inset as absent whatever is focused, so the window cannot raise a
 * keyboard here; the screen's `barVisible` seam is driven instead, exactly as `dispatch_ime_light`
 * drives it. What that frame cannot state is that the button is *gone* rather than merely scrolled
 * off, and — the half no frame can carry at all — that it comes back when the field is done with.
 * A bar that only ever left would be a lorry that cannot be sent.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DispatchBarTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `the sticky bar steps aside while the keyboard is up and comes back after it`() {
        var barVisible by mutableStateOf(true)
        rule.setContent { EtalonTheme { Screen(barVisible) } }

        rule.onNode(hasText(DISPATCH) and hasClickAction()).assertIsDisplayed()

        barVisible = false
        rule.waitForIdle()

        rule.onNode(hasText(DISPATCH) and hasClickAction()).assertDoesNotExist()

        barVisible = true
        rule.waitForIdle()

        rule.onNode(hasText(DISPATCH) and hasClickAction()).assertIsDisplayed()
    }

    @Composable
    private fun Screen(barVisible: Boolean) = DispatchScreen(
        s = DispatchUiState(
            drivers = listOf(
                Driver(
                    id = "d1", name = "Дилшод Раҳимов", phone = "998901112233", notes = null,
                    active = true, activeDispatchCount = 0, discrepancyCount30d = 0,
                    lastDispatchAt = null,
                ),
            ),
            driverId = "d1",
            truck = "01 A 123 BC",
            amountDigits = "12000000",
            willCollectCash = true,
        ),
        isShipment = true,
        onCancel = {}, onSetDriverId = {}, onSetTruck = {}, onSetWillCollectCash = {},
        onSetAmountDigits = {}, onSubmit = {}, onRetryDrivers = {},
        shipmentNumber = 2,
        barVisible = barVisible,
    )
}
