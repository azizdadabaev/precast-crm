package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.filterToOne
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import com.github.takahirom.roborazzi.captureScreenRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatMoney

/** The three actions the navy sheet publishes, as `strings.xml` writes them — an icon pill carries
 *  its label as a content description, which is also how TalkBack reads it. */
private const val SAVE = "Лойиҳани сақлаш"
private const val SHARE = "Юбориш"
private const val SETTINGS = "Созламалар"

private class SummaryInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The two halves of the summary sheet that `CalculatorScreenshotTest` cannot photograph: the ⋯
 * settings sheet (R5 / D10 — everything the old expanded totals sheet held that is not part of
 * the quote), and the action row a quote-only operator sees.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class SummarySheetScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** Two priced rooms of different beam lengths, so the schedule groups into two rows — the
     *  case the sheet exists for. Computed the way `CalculatorViewModel.withTotals` computes it. */
    private fun state(canWrite: Boolean = true): CalculatorUiState {
        val rows = listOf(
            recomputeRow(SlabRow(id = "r1", name = "Зал", innerWidth = 5.2, innerLength = 7.1)),
            recomputeRow(SlabRow(id = "r2", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0)),
        )
        return CalculatorUiState(
            rows = rows,
            drafts = rows.associate { it.id to draftOf(it) },
            totals = projectTotals(rows, 0.0, 0.0),
            orderTotals = computeOrderTotals(rows, 0.0, 0.0, 0.0, 0.0),
            schedule = beamSchedule(rows),
            canWrite = canWrite,
        )
    }

    private fun vm() = CalculatorViewModel(
        session = SummaryInertSessionPricing(),
        permissions = PermissionGate { false },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { false }),
    )

    /** A whole-screen capture, not `onRoot()`: the settings sheet is a `ModalBottomSheet` and lives
     *  in a window of its own. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun settingsLight() {
        val s = state()
        rule.setContent {
            EtalonTheme {
                Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
                    SummarySettingsSheet(state = s, vm = vm(), onDismiss = {})
                }
            }
        }
        captureScreenRoboImage("screenshots/summary_settings_light.png")
    }

    /**
     * I2 · the hero where it is tightest: the narrowest phone the app targets at 130 % type, which
     * is the widest the 26 sp figure ever gets. §3.4 draws «Жами» and the figure beside the material
     * line; under `HERO_STACK_BELOW` the sheet stacks them, and this frame is the proof that the
     * stacked arrangement holds at the large font too — the screen's own w360 frame
     * (`calculator_w360_light`) covers 100 %.
     *
     * Driven through the sheet alone rather than the whole screen: at w360 and 130 % a room cell's
     * text gains a scroll action of its own, and `CalculatorScreenshotTest`'s typing helpers can no
     * longer tell the list apart from it. The sheet needs no typing.
     */
    @Test @Config(qualifiers = "w360dp-h800dp", fontScale = 1.3f)
    fun heroW360Font13() {
        val s = state()
        val figure = formatMoney(s.orderTotals.totalPriceMoney())
        rule.setContent {
            EtalonTheme {
                Box(Modifier.fillMaxSize().background(EtalonColors.page)) { SummarySheet(state = s, vm = vm()) }
            }
        }

        val hero = hasAnyAncestor(hasContentDescription("$figure $MONEY_UNIT"))
        assertEquals(
            "«$figure» is cut short in the summary sheet",
            figure.length,
            rule.onAllNodesWithText(figure, useUnmergedTree = true).filterToOne(hero).visibleCharacters(),
        )
        assertEquals(
            "«$MONEY_UNIT» is cut short in the summary sheet",
            MONEY_UNIT.length,
            rule.onAllNodesWithText(MONEY_UNIT, useUnmergedTree = true).filterToOne(hero).visibleCharacters(),
        )
        captureScreenRoboImage("screenshots/summary_hero_w360_font13.png")
    }

    /** Without `order.create` the sheet keeps exactly one action: «Юбориш». Saving a draft,
     *  opening the settings (which carry «Тозалаш») and placing the order all write server-side. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aQuoteOnlyOperatorKeepsOnlyShare() {
        val s = state(canWrite = false)
        rule.setContent { EtalonTheme { SummarySheet(state = s, vm = vm()) } }

        rule.onNodeWithContentDescription(SHARE).assertExists()
        rule.onNodeWithContentDescription(SAVE).assertDoesNotExist()
        rule.onNodeWithContentDescription(SETTINGS).assertDoesNotExist()
    }
}
