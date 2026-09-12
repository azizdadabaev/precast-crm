package uz.etalon.crm.feature.payments

import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesScreen
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesUiState
import uz.etalon.crm.feature.payments.discrepancies.ResolveSheetState
import uz.etalon.crm.feature.payments.discrepancies.resolveBlocker
import java.time.Instant

/** `discrepancy_action_resolve`. It is the list row's offer, the sheet's primary AND the gate's
 *  confirm, so a test never names it alone — see [ResolveGateTest.tapResolve]. */
private const val RESOLVE = "Ҳал қилиш"

/** `discrepancy_tile_type` — the gate's first tile caption, and the one word on screen that exists
 *  ONLY on the navy gate. Its presence IS "the gate is open". */
private const val GATE_TILE = "Тури"

/**
 * Ruling R3's summary gate is a CONFIRMATION, and there is nothing to confirm while the sheet is
 * still holding something `PATCH /api/discrepancies/{id}` — or `DiscrepanciesViewModel.submitResolve`
 * itself — would refuse. The siblings [RecordGateTest] and [ApproveGateTest] pin the same rule on
 * the two payment screens, for the same reason: a gate that opens on an unsendable form asks the
 * owner to agree on the navy panel, takes the tap, and then shows the reason on the sheet BEHIND
 * the gate they were looking at.
 *
 * The refusals come from three places and the button has to read all of them. `blocker` is the
 * sheet's own validator (a status, and a note of at least five characters); `canResolve` is the
 * permission; `isOffline` is checked by `submitResolve()` before either, because the resolve route
 * carries no server-side idempotency and so may never be queued. Every refusal below must reach the
 * ViewModel, which writes the Uzbek reason into the sheet's error banner.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ResolveGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `no resolution type chosen never opens the gate`() {
        val submits = mutableListOf<Unit>()
        show(state(status = null)) { submits += Unit }

        tapResolve()

        rule.onNodeWithText(GATE_TILE).assertDoesNotExist()
        // The tap is not swallowed: it goes to the ViewModel, which refuses it and writes the
        // reason into the sheet's own error banner.
        assertEquals(1, submits.size)
    }

    @Test fun `a note the server would refuse never opens the gate`() {
        val submits = mutableListOf<Unit>()
        show(state(note = "йўқ")) { submits += Unit }

        tapResolve()

        rule.onNodeWithText(GATE_TILE).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    /**
     * The regression this test exists for. The sheet is complete — the validator has nothing to say
     * — and the list behind it is on screen because it came from the cache; only the fetch beside it
     * failed for want of a network. `submitResolve()` refuses on exactly that, before it validates,
     * so the gate must stay shut and the tap must reach the ViewModel.
     */
    @Test fun `an offline screen never opens the gate even with a valid choice`() {
        val submits = mutableListOf<Unit>()
        val s = state(offline = true)
        assertNull("the fixture's choice is meant to be valid", resolveBlocker(s.sheet?.status, s.sheet!!.note))
        show(s) { submits += Unit }

        tapResolve()

        rule.onNodeWithText(GATE_TILE).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    /** Reading the list without being able to resolve is a real account shape, and the ViewModel
     *  refuses the write for it. The sheet's own button stays live so the reason is shown. */
    @Test fun `without the resolve permission the gate never opens`() {
        val submits = mutableListOf<Unit>()
        show(state(canResolve = false)) { submits += Unit }

        tapResolve()

        rule.onNodeWithText(GATE_TILE).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    @Test fun `a sendable resolution opens the gate instead of resolving`() {
        val submits = mutableListOf<Unit>()
        show(state()) { submits += Unit }

        tapResolve()

        rule.onNodeWithText(GATE_TILE).assertIsDisplayed()
        // Nothing is resolved by opening the gate — the resolution is the tap INSIDE it.
        assertEquals(0, submits.size)
    }

    @Test fun `confirming the gate resolves once`() {
        val submits = mutableListOf<Unit>()
        show(state()) { submits += Unit }

        tapResolve() // the sheet's primary: opens the gate
        tapResolve() // the gate's confirm

        assertEquals(1, submits.size)
        // The gate closes and the sheet behind it carries the outcome.
        rule.onNodeWithText(GATE_TILE).assertDoesNotExist()
    }

    /**
     * Taps the LAST «Ҳал қилиш» that carries a click action. Window order makes that unambiguous:
     * the list row's offer is in the main window, the sheet's primary in the sheet's, the gate's
     * confirm in the gate's — so before the gate opens this is the sheet's primary, and once it is
     * open it is the gate's confirm. (The gate's caption shares the word but is not clickable.)
     */
    private fun tapResolve() {
        val buttons = rule.onAllNodes(hasClickAction() and hasText(RESOLVE))
        buttons[buttons.fetchSemanticsNodes().size - 1].performClick()
        rule.waitForIdle()
    }

    private fun show(s: DiscrepanciesUiState, onSubmitResolve: () -> Unit) {
        rule.setContent {
            EtalonTheme {
                DiscrepanciesScreen(
                    s = s,
                    now = Instant.parse("2026-09-04T09:00:00Z"),
                    onOpenOrder = {}, onBack = {}, onRefresh = {}, onOpenResolve = {}, onCloseSheet = {},
                    onSetStatus = {}, onSetNote = {}, onSubmitResolve = onSubmitResolve, onToastShown = {},
                )
            }
        }
    }

    /** An open discrepancy short by 1 500 000, with the sheet already carrying a resolution the
     *  server would accept — so the default state is sendable. */
    private fun state(
        status: DiscrepancyStatus? = DiscrepancyStatus.RESOLVED_RECOVERED,
        note: String = "мижоз жумагача тўлади",
        canResolve: Boolean = true,
        offline: Boolean = false,
    ): DiscrepanciesUiState {
        val row = discrepancy()
        return DiscrepanciesUiState(
            items = listOf(row),
            loading = false,
            canResolve = canResolve,
            permissionsResolved = true,
            lastRefreshError = if (offline) AppError.Network("Интернет йўқ") else null,
            sheet = ResolveSheetState(discrepancy = row, status = status, note = note),
        )
    }

    private fun discrepancy() = Discrepancy(
        id = "d1", orderId = "o3", orderNumber = "2026-09-0019", clientName = "Тошматов Илҳом Каримович",
        driverName = "Жасур", expectedAmount = Money.parse("9000000.00"), receivedAmount = Money.parse("7500000.00"),
        status = DiscrepancyStatus.OPEN, reportedAt = Instant.parse("2026-09-03T15:25:00Z"), resolutionNote = null,
    )
}
