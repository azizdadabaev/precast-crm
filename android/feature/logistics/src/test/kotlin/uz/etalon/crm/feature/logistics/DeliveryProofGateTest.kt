package uz.etalon.crm.feature.logistics

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
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
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofScreen
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofUiState
import uz.etalon.crm.feature.logistics.delivery.canSubmit
import java.io.File

/** `action_mark_delivered`, and the gate's own «Тасдиқлаш» / `ds_action_cancel`. «Бекор қилиш»
 *  exists ONLY on the navy gate — the screen's own bar is a single «Етказилди» — so its presence
 *  IS "the gate is open". */
private const val DELIVERED = "Етказилди"
private const val GATE_CONFIRM = "Тасдиқлаш"
private const val GATE_DISMISS = "Бекор қилиш"

/**
 * The sibling of `RecordGateTest` one module over, for the same reason: ruling R3's summary gate is
 * a CONFIRMATION, and there is nothing to confirm while the screen is still holding something
 * [uz.etalon.crm.feature.logistics.delivery.DeliveryProofViewModel.submit] would refuse. A gate that
 * opens on an unsendable proof asks the driver to agree on the navy panel in front of the customer,
 * takes the tap, and then shows the reason on the screen BEHIND the gate he was looking at.
 *
 * This screen's refusals are the two `submit()` checks: a photo must exist, and `validateDeliveryCash`
 * must have nothing to say. There is no offline term — both the load and the proof go to the outbox,
 * which is what queued delivery proofs are for — so an unreachable server is not a reason to hold
 * the gate shut here the way it is on the record-payment screen.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DeliveryProofGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a proof with no photo never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(photo = null)
        assertFalse("the fixture is meant to be unsendable", canSubmit(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The tap is not swallowed: it reaches the ViewModel, which refuses it and writes
        // «Аввал расм олинг» into the screen's own error banner.
        assertEquals(1, submits.size)
    }

    /** «Нақд олинмади» with no reason: `validateDeliveryCash` refuses it, so the gate must not
     *  open on it either — the driver has to be told what is missing, on the screen holding it. */
    @Test fun `no-cash-collected without a reason never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(amountDigits = "", noCashCollected = true, note = "")
        assertFalse("the fixture is meant to be unsendable", canSubmit(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    /** An amount typed under «Нақд олинмади» is the contradiction the validator names last; the
     *  switch clears the field in production, but a restored state can still hold both. */
    @Test fun `an amount beside no-cash-collected never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val s = state(amountDigits = "1500000", noCashCollected = true, note = "Мижоз йўқ эди")
        assertFalse("the fixture is meant to be unsendable", canSubmit(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    @Test fun `a sendable proof opens the gate instead of delivering`() {
        val submits = mutableListOf<Unit>()
        val s = state()
        assertTrue("the fixture is meant to be sendable", canSubmit(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        // Nothing is queued by opening the gate — the delivery is the tap INSIDE it.
        assertEquals(0, submits.size)
    }

    /**
     * The dwell. The bar is still on screen for 1,2 s after the proof is queued so ruling R5's
     * result grid can be read — and `submit()` returns on `done` before it validates anything, so
     * a gate opening there would take the driver's agreement on the navy panel and enqueue
     * nothing. The button is disabled too; this pins the predicate behind it either way.
     */
    @Test fun `a queued proof never re-opens the gate during the result dwell`() {
        val submits = mutableListOf<Unit>()
        val s = state().copy(done = true)
        assertFalse("a queued proof is not submittable again", canSubmit(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The button is `enabled = !done`, so the tap does not even reach the ViewModel.
        assertEquals(0, submits.size)
    }

    @Test fun `confirming the gate delivers once`() {
        val submits = mutableListOf<Unit>()
        show(state()) { submits += Unit }

        rule.onNodeWithText(DELIVERED).performClick()
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

    private fun show(s: DeliveryProofUiState, onSubmit: () -> Unit) {
        rule.setContent {
            EtalonTheme {
                DeliveryProofScreen(
                    s = s, onBack = {}, onRetake = {}, onSetAmountDigits = {}, onSetNoCashCollected = {},
                    onSetNote = {}, onSetDriverReturned = {}, onSubmit = onSubmit, barVisible = true,
                )
            }
        }
    }

    /** 1 500 000 collected against 2 000 000 expected: short, which the screen says out loud and
     *  the server accepts — a shortfall has never blocked a delivery. */
    private fun state(
        photo: PreparedImage? = PreparedImage(File("/tmp/proof.jpg"), 1280, 853, 180_000),
        amountDigits: String = "1500000",
        noCashCollected: Boolean = false,
        note: String = "",
    ) = DeliveryProofUiState(
        photo = photo,
        amountDigits = amountDigits,
        noCashCollected = noCashCollected,
        note = note,
        expected = Money.parse("2000000.00"),
    )
}
