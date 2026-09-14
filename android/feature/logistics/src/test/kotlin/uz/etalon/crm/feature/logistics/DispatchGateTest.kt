package uz.etalon.crm.feature.logistics

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.feature.logistics.dispatch.DispatchScreen
import uz.etalon.crm.feature.logistics.dispatch.DispatchUiState
import uz.etalon.crm.feature.logistics.dispatch.canSubmit

/** `action_dispatch` — and, the same word, `dispatch_title` in the header above it. */
private const val DISPATCH = "Жўнатиш"
private const val GATE_CONFIRM = "Тасдиқлаш"

/** «Бекор қилиш» exists ONLY on the navy gate — the screen's own bar is a single «Жўнатиш» — so
 *  its presence IS "the gate is open". */
private const val GATE_DISMISS = "Бекор қилиш"

/** Taps the BUTTON, not the heading that carries the same word: the merged tree folds a button's
 *  label into its own clickable node, and a heading has no click action. */
private fun ComposeContentTestRule.clickDispatch() =
    onNode(hasText(DISPATCH) and hasClickAction()).performClick()

/**
 * The sibling of `DeliveryProofGateTest` and `RecordGateTest`, for the same reason: ruling R3's
 * summary gate is a CONFIRMATION, and there is nothing to confirm while the screen is still
 * holding something [uz.etalon.crm.feature.logistics.dispatch.DispatchViewModel.submit] would
 * refuse. A gate that opens on an unsendable dispatch asks the operator to agree on the navy panel,
 * takes the tap, and then shows the reason on the screen BEHIND the gate.
 *
 * This screen's refusals are `submit()`'s own two: neither dispatch route is idempotent, so with no
 * network the action is refused rather than queued; and a whole-order dispatch with a zero sum is
 * refused because the server's `expectedCollection` is required and the `Dispatch` row is unique
 * per order — a zero mis-submit flips the order to DISPATCHED with no way back from the phone.
 *
 * A missing DRIVER is deliberately NOT a refusal. Both endpoints accept a null driverId, and a
 * lorry going out with nobody named is a real thing that happens.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DispatchGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a dispatch with no driver still opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(driverId = null)
        assertTrue("a driverless dispatch is sendable", canSubmit(s, isShipment = true))
        show(s, isShipment = true) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        assertEquals(0, submits.size)
    }

    @Test fun `an offline screen never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(driversFetchError = AppError.Network("Интернет йўқ"))
        assertFalse("the fixture is meant to be unsendable", canSubmit(s, isShipment = true))
        show(s, isShipment = true) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The tap is not swallowed: it reaches the ViewModel, which refuses it and writes the
        // offline sentence into the screen's own error banner.
        assertEquals(1, submits.size)
    }

    /** The whole-order route's own guard: `expectedCollection` is required, and zero is the one
     *  value that cannot be undone from the app. */
    @Test fun `a whole-order dispatch with no sum never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(amountDigits = "", willCollectCash = false)
        assertFalse("the fixture is meant to be unsendable", canSubmit(s, isShipment = false))
        show(s, isShipment = false) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    /** The same zero on the per-shipment route is legitimate — a truck with no cash to collect —
     *  so it must NOT be held back. */
    @Test fun `a shipment dispatch with no cash opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(amountDigits = "", willCollectCash = false)
        assertTrue("a cashless shipment dispatch is sendable", canSubmit(s, isShipment = true))
        show(s, isShipment = true) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        assertEquals(0, submits.size)
    }

    @Test fun `confirming the gate dispatches once`() {
        val submits = mutableListOf<Unit>()
        show(state(), isShipment = true) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        // «Тасдиқлаш» exists only on the gate, so one node is the right count and a second would
        // mean the gate was drawn twice.
        val confirm = rule.onAllNodesWithText(GATE_CONFIRM)
        confirm.assertCountEquals(1)
        confirm[0].performClick()
        rule.waitForIdle()

        assertEquals(1, submits.size)
        // The gate closes and the screen behind it carries the outcome.
        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
    }

    /**
     * `done` means the dispatch landed and the route is popping. `submit()` has no guard of its own
     * there and the `Dispatch` row is unique per order, so a gate re-opened in that frame would
     * take the operator's agreement and raise a second dispatch the server then refuses with a 409.
     */
    @Test fun `a finished dispatch never re-opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state().copy(done = true)
        assertFalse("a landed dispatch is not submittable again", canSubmit(s, isShipment = true))
        show(s, isShipment = true) { submits += Unit }

        rule.clickDispatch()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The button is `enabled = !done`, so the tap does not even reach the ViewModel.
        assertEquals(0, submits.size)
    }

    private fun show(s: DispatchUiState, isShipment: Boolean, onSubmit: () -> Unit) {
        rule.setContent {
            EtalonTheme {
                DispatchScreen(
                    s = s, isShipment = isShipment, onCancel = {}, onSetDriverId = {}, onSetTruck = {},
                    onSetWillCollectCash = {}, onSetAmountDigits = {}, onSubmit = onSubmit,
                    onRetryDrivers = {}, shipmentNumber = 2, barVisible = true,
                )
            }
        }
    }

    private fun state(
        driverId: String? = "d1",
        amountDigits: String = "12000000",
        willCollectCash: Boolean = true,
        driversFetchError: AppError? = null,
    ) = DispatchUiState(
        drivers = emptyList(),
        driverId = driverId,
        truck = "01 A 123 BC",
        amountDigits = amountDigits,
        willCollectCash = willCollectCash,
        driversFetchError = driversFetchError,
    )
}
