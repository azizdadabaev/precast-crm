package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.formatMoney

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so these frames carry the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** The card frames are shot at the width the screen gives a card: the 411 dp phone less
 *  `CalculatorScreen`'s own 16 dp margin on each side, on the page ground the screen draws them
 *  on — so a reviewer can hold `3a-calculator.png` beside them at the same scale. */
private val PHONE_WIDTH = 411.dp
private val CARD_MARGIN = 16.dp

/** [CalculatorScreen] carries no `CalculatorViewModel`; this one exists only because
 *  `totalsSheetContent` renders `TotalsSheet` and the client bar renders `ClientBar`
 *  (`TotalsSheet.kt`/`ClientBar.kt`'s own signatures, untouched here). Nothing in these frames
 *  ever calls into it — the client-bar fixtures never reach nine digits, so [ClientsRepository]
 *  is wired to a [FakeEtalonApi] that throws by name if anything ever did. */
private class InertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The design-3a room card (`docs/android/restyle-prototype/3a-calculator.png`, spec §3.4 rows
 * 1–5), photographed on its own at the width the screen gives it, plus the room list it sits in.
 *
 * Light only (D6) — the calculator's dark frames are deleted with this task.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class CalculatorScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    /** The capture's own first card: «Зал», 5,2 × 7,1 at the default bearing, priced by the
     *  engine — never by this test (see [zalIsTheCaptureSFixture]). */
    private fun zal(): SlabRow = room("zal", "Зал", 5.2, 7.1)

    /** The cells as the operator typed them, which is what the card renders — «5,2», not the
     *  «5,20» a double formatted back would give (see [RoomDraft]). */
    private fun zalDraft() = RoomDraft(width = "5,2", length = "7,1")

    // `totals`/`orderTotals`/`schedule` are computed the same way `CalculatorViewModel.withTotals`
    // does — the totals sheet renders them too, and the peek row would show the empty-quote
    // defaults rather than these rooms' real numbers otherwise.
    private fun state(): CalculatorUiState {
        val rows = listOf(
            room("r1", "Хона 1", 4.0, 6.0),   // Б-Г-Б
            room("r2", "Хона 2", 4.0, 4.3),   // Г-Б-Г
            SlabRow(id = "r3", name = "Хона 3"), // not typed yet — result == null
        )
        return CalculatorUiState(
            rows = rows,
            drafts = rows.associate { it.id to draftOf(it) },
            totals = projectTotals(rows, 0.0, 0.0),
            orderTotals = computeOrderTotals(rows, 0.0, 0.0, 0.0, 0.0),
            schedule = beamSchedule(rows),
            canWrite = true,
        )
    }

    private fun screen(s: CalculatorUiState) {
        val vm = CalculatorViewModel(
            session = InertSessionPricing(), permissions = PermissionGate { false },
            clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { false }),
        )
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    CalculatorScreen(
                        s = s,
                        onAddRoom = {}, onDuplicateRoom = {}, onDeleteRoom = {},
                        onMoveRoomUp = {}, onMoveRoomDown = {},
                        onSetName = { _, _ -> }, onToggleExpanded = {},
                        onWidthText = { _, _ -> }, onLengthText = { _, _ -> },
                        onBearingText = { _, _ -> }, onCorrectionText = { _, _ -> },
                        onCyclePattern = {}, onExtraBeams = { _, _ -> }, onForceStartBeam = { _, _ -> },
                        onApplyRateOverride = { _, _, _ -> }, onClearRateOverride = {},
                        clientBarCollapsed = { ClientBarCollapsed(state = s, onReopen = {}) },
                        clientBarExpanded = { ClientBarExpanded(state = s, vm = vm) },
                        totalsSheetContent = { TotalsSheet(state = s, vm = vm) {} },
                    )
                }
            }
        }
    }

    /** One card alone, on the page ground at the width the screen gives it. */
    private fun card(row: SlabRow, draft: RoomDraft, expanded: Boolean) {
        rule.setContent {
            EtalonTheme {
                Box(
                    Modifier.width(PHONE_WIDTH).background(EtalonColors.page).padding(CARD_MARGIN),
                ) {
                    RoomCard(
                        row = row, draft = draft, expanded = expanded,
                        canMoveUp = false, canMoveDown = true,
                        focusRequester = remember { FocusRequester() }, onNext = null,
                        onNameChange = {}, onWidthChange = {}, onLengthChange = {},
                        onBearingChange = {}, onCorrectionChange = {},
                        onCyclePattern = {}, onToggleExpanded = {},
                        onExtraBeams = {}, onForceStartBeam = {},
                        onDuplicate = {}, onDelete = {}, onMoveUp = {}, onMoveDown = {},
                        onApplyRateOverride = { _, _ -> }, onClearRateOverride = {},
                    )
                }
            }
        }
    }

    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomLight() {
        card(zal(), zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomMoreLight() {
        // Re-run the engine: `copy` alone would leave the result strip pricing 0 extra beams while
        // the stepper above it showed 2.
        card(recomputeRow(zal().copy(extraBeams = 2)), zalDraft(), expanded = true)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_more_light.png")
    }

    /** The two manual states in one frame: a rate the operator chose (230k · қўлда) and a pattern
     *  they chose (Г-Б, no «авто» suffix). */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomOverrideLight() {
        val row = recomputeRow(
            zal().copy(
                patternOverride = Pattern.GB,
                m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Йирик буюртма",
            ),
        )
        card(row, zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_override_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun roomFont13() {
        card(zal(), zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_font13.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomsLight() {
        screen(state())
        rule.onRoot().captureRoboImage("screenshots/calculator_rooms_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun roomsFont13() {
        screen(state())
        rule.onRoot().captureRoboImage("screenshots/calculator_rooms_font13.png")
    }

    /**
     * The card frame is only an acceptance test if the numbers on it are the ENGINE's, not this
     * test's: spec §7's first fixture, asserted here so [roomLight] can never be re-recorded
     * around a card that quietly prices «Зал» differently.
     */
    @Test fun zalIsTheCaptureSFixture() {
        val r = zal().result!!
        assertEquals(7.08, r.monolithLength, 0.0001)
        assertEquals(13, r.beamCount)
        assertEquals(312, r.totalBlocks)
        assertEquals(38.94, r.monolithArea, 0.0001)
        assertEquals(38.28, r.billedArea, 0.0001)
        assertEquals(180_000.0, r.m2Price, 0.0001)
        assertEquals(Money.parse("440000.00"), r.money().patternExtraCost)
        // The separators in this expected string are U+202F NARROW NO-BREAK SPACE, D8's group
        // separator (see `Formatters.kt`) — not the plain spaces they look like.
        assertEquals("7 330 400", formatMoney(r.money().subtotal))
    }
}
