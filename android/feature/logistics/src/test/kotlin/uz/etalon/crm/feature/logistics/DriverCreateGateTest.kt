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
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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

/** Typed into the sheet's «Исм» field, to prove a refusal does not throw the form away. */
private const val TYPED_NAME = "Ботир Ҳакимов"

/**
 * The create sheet's dismissal, which is state this screen owns rather than the ViewModel: the
 * sheet holds while a request is in flight so its own «Сақлаш» can carry the spinner, and closes
 * once a driver has been created.
 *
 * The distinction the cases pin is the one the whole mechanism turns on: **only a driver actually
 * created** closes the sheet. `DriversUiState.createdCount` is that signal, and the effect keys on
 * it. Every refusal keeps the sheet up — the ones `DriversViewModel` makes itself (blank name, a
 * phone that is not nine digits, no network), which never set `loading` at all, and the ones the
 * server makes, which set it and clear it exactly as a success does. Keying the effect on `loading`
 * falling instead is the bug the last of these tests guards: the sheet closed over the reason and
 * threw away the name, phone and note the operator had typed.
 *
 * Driven by screen-level state, never by a network: [onCreate] here stands in for the ViewModel and
 * writes the same fields it would.
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
                Screen(loading, error = error, onCreate = { error = REFUSAL })
            }
        }

        openSheet()
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()

        // No request was ever started and nothing was created, so the effect never ran: sheet up.
        rule.onNodeWithText(SAVE).assertIsDisplayed()
        // Twice — once in the sheet's own banner, which is the whole point of the change, and once
        // in the list's banner behind it, which is where it used to be alone and unread.
        rule.onAllNodesWithText(REFUSAL).assertCountEquals(2)
    }

    @Test fun `a driver actually created closes the sheet`() {
        var loading by mutableStateOf(false)
        var created by mutableStateOf(0)
        rule.setContent {
            EtalonTheme {
                Screen(loading, created, error = null, onCreate = { loading = true })
            }
        }

        openSheet()
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(SAVE).assertIsDisplayed()

        // What the ViewModel writes on success, in the order it writes it.
        created = 1
        loading = false
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertDoesNotExist()
    }

    /**
     * The carry from Task 4's review. A create the SERVER refuses — a connection dropped
     * mid-request above all — settles `loading` exactly the way a success does, so a sheet keyed on
     * that flag falling closed over the reason and took the typed name, phone and note with it. The
     * operator's only way to read why was to type all three again.
     */
    @Test fun `a server refusal keeps the sheet up with what was typed still in it`() {
        var loading by mutableStateOf(false)
        var error by mutableStateOf<String?>(null)
        rule.setContent {
            EtalonTheme {
                Screen(loading, created = 0, error = error, onCreate = { loading = true })
            }
        }

        openSheet()
        // The first editable field in the sheet is «Исм»; it carries no placeholder, so the set-text
        // action is what identifies it.
        rule.onAllNodes(hasSetTextAction())[0].performTextInput(TYPED_NAME)
        rule.onNodeWithText(SAVE).performClick()
        rule.waitForIdle()

        // The request settles with no driver created: `loading` falls, `createdCount` does not move.
        loading = false
        error = "Сервер жавоб бермади"
        rule.waitForIdle()

        rule.onNodeWithText(SAVE).assertIsDisplayed()
        rule.onNodeWithText(TYPED_NAME).assertIsDisplayed()
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
    private fun Screen(loading: Boolean, created: Int = 0, error: String?, onCreate: () -> Unit) = DriversScreen(
        s = state(loading, error, created),
        canManage = true,
        onBack = {},
        onRefresh = {},
        onSetActiveOnly = {},
        onCreate = { _, _, _ -> onCreate() },
        onSetActive = { _, _ -> },
    )

    private fun state(loading: Boolean = false, error: String? = null, created: Int = 0) = DriversUiState(
        drivers = listOf(
            Driver(
                id = "d1", name = "Дилшод Раҳимов", phone = "998901112233", notes = null,
                active = true, activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null,
            ),
        ),
        loading = loading,
        error = error,
        createdCount = created,
    )
}
