package uz.etalon.crm.feature.logistics

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.feature.logistics.drivers.DriversScreen
import uz.etalon.crm.feature.logistics.drivers.DriversUiState

/** `action_add_driver`: the bar's button, and — once it is open — the sheet's own heading, which is
 *  a plain `Text` and so never answers `hasClickAction()`. */
private const val ADD = "Ҳайдовчи қўшиш"

/** `logistics_action_save`. It exists only inside the create sheet, so its presence IS "the sheet
 *  is open" and its absence IS "the sheet closed". */
private const val SAVE = "Сақлаш"

/** Word for word what `DriversViewModel.create()` writes when the name is blank — a refusal it
 *  makes itself, before any request is started. */
private const val REFUSAL = "Исмни киритинг"

/**
 * The create sheet's dismissal, which is state this screen owns rather than the ViewModel: the
 * sheet holds while a request is in flight so its own «Сақлаш» can carry the spinner, and closes
 * when that request settles.
 *
 * The distinction the three cases pin is the one the whole mechanism turns on. `DriversViewModel`
 * runs its self-checks — blank name, a phone that is not nine digits, no network — BEFORE it ever
 * sets `loading`, so a refusal it makes itself never flips `submitting`, the `LaunchedEffect`'s key
 * never changes, and the sheet must stay up with the reason inside it. Only a refusal from the
 * server (or a success) turns `loading` on and off again, and only that may take the sheet away.
 * Get the key or the guard wrong and the sheet either never closes after a save, or closes over the
 * reason a save was refused — which is exactly the bug this screen used to have, when it dismissed
 * unconditionally on the tap and wrote «Исмни киритинг» to a list banner nobody could see.
 *
 * Driven by screen-level state, never by a network: [onCreate] here stands in for the ViewModel and
 * writes the same two fields it would.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DriverCreateGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a refusal the ViewModel makes itself keeps the sheet open with the reason in it`() {
        var loading by mutableStateOf(false)
        var error by mutableStateOf<String?>(null)
        rule.setContent {
            EtalonTheme {
                Screen(loading, error, onCreate = { error = REFUSAL })
            }
        }

        openSheet()
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()

        // `loading` never moved, so the effect never ran: the sheet is still up.
        rule.onNodeWithText(SAVE).assertIsDisplayed()
        // Twice — once in the sheet's own banner, which is the whole point of the change, and once
        // in the list's banner behind it, which is where it used to be alone and unread.
        rule.onAllNodesWithText(REFUSAL).assertCountEquals(2)
    }

    @Test fun `a request that settles closes the sheet`() {
        var loading by mutableStateOf(false)
        rule.setContent {
            EtalonTheme {
                Screen(loading, error = null, onCreate = { loading = true })
            }
        }

        openSheet()
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(SAVE).assertIsDisplayed()

        loading = false
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertDoesNotExist()
    }

    /** The spinner is the reason the sheet holds at all: `PrimaryButton` is `enabled && !loading`,
     *  so a working «Сақлаш» keeps its indigo fill and merely stops answering the thumb — which is
     *  also what stops a second tap reaching a ViewModel that would drop it in silence. */
    @Test fun `the sheet holds while the request is in flight and its save button stops answering`() {
        var loading by mutableStateOf(false)
        rule.setContent {
            EtalonTheme {
                Screen(loading, error = null, onCreate = { loading = true })
            }
        }

        openSheet()
        rule.onNodeWithText(SAVE).assertIsEnabled()
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertIsDisplayed()
        rule.onNodeWithText(SAVE).assertIsNotEnabled()
    }

    /**
     * `loading` is ONE flag across the list refresh, `setActive` and `create`. The bar has to wait
     * for it, or a switch toggled a moment earlier opens a sheet whose «Сақлаш» is already spinning
     * for a request the sheet never sent.
     */
    @Test fun `the add button waits for the shared loading flag`() {
        var loading by mutableStateOf(false)
        rule.setContent {
            EtalonTheme {
                Screen(loading, error = null, onCreate = {})
            }
        }

        rule.onNodeWithText(ADD).assertIsEnabled()

        loading = true
        rule.waitForIdle()

        rule.onNodeWithText(ADD).assertIsNotEnabled()
    }

    /** Offline is the other standing refusal: POST /api/drivers is not idempotency-wrapped, so it
     *  may not be queued, and the bar says so before the tap rather than after it. */
    @Test fun `the add button is refused while the last refresh says there is no network`() {
        rule.setContent {
            EtalonTheme {
                DriversScreen(
                    s = state().copy(lastRefreshError = AppError.Network("Интернет йўқ")),
                    canManage = true, onBack = {}, onRefresh = {}, onSetActiveOnly = {},
                    onCreate = { _, _, _ -> }, onSetActive = { _, _ -> },
                )
            }
        }

        rule.onNodeWithText(ADD).assertIsNotEnabled()
    }

    /** The bar button, never the sheet heading that carries the same words. */
    private fun openSheet() {
        rule.onNode(hasText(ADD) and hasClickAction()).performClick()
        rule.waitForIdle()
    }

    @Composable
    private fun Screen(loading: Boolean, error: String?, onCreate: () -> Unit) = DriversScreen(
        s = state(loading, error),
        canManage = true,
        onBack = {},
        onRefresh = {},
        onSetActiveOnly = {},
        onCreate = { _, _, _ -> onCreate() },
        onSetActive = { _, _ -> },
    )

    private fun state(loading: Boolean = false, error: String? = null) = DriversUiState(
        drivers = listOf(
            Driver(
                id = "d1", name = "Дилшод Раҳимов", phone = "998901112233", notes = null,
                active = true, activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null,
            ),
        ),
        loading = loading,
        error = error,
    )
}
