package uz.etalon.crm.feature.calculator

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so these frames carry the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** [CalculatorScreen] itself carries no `CalculatorViewModel` — `RoomCard`/`RoomExtras` take a
 *  plain [RoomExtrasCallbacks] instead. This vm exists only because `totalsSheetContent` renders
 *  `TotalsSheet` and `clientBar` renders `ClientBar` (`TotalsSheet.kt`/`ClientBar.kt`'s own
 *  signatures, untouched here); nothing in these frames ever calls into any of its methods either
 *  way — the client bar fixtures below never reach nine digits, so [ClientsRepository] is wired
 *  to a [FakeEtalonApi] that throws by name if anything ever did. */
private class InertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/** Every room-level callback as a no-op — no screenshot here interacts with «Қўшимча», it only
 *  renders it (see [expandedState]). */
private val NOOP_ROOM_CALLBACKS = RoomExtrasCallbacks(
    onExtraBeams = { _, _ -> }, onBearing = { _, _ -> }, onCorrection = { _, _ -> },
    onForceStartBeam = { _, _ -> }, onPattern = { _, _ -> },
    onApplyRateOverride = { _, _, _ -> }, onClearRateOverride = {},
)

/**
 * One baseline: two priced rooms (a Б-Г-Б and a Г-Б-Г case, so both a pattern chip and a real
 * subtotal render) plus a third, empty room. The docked keypad these frames used to carry is
 * retired — Task 3 rebuilds the card with the cells on the system keyboard, which a screenshot
 * cannot photograph.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class CalculatorScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    // `totals`/`orderTotals`/`schedule` are computed the same way `CalculatorViewModel.withTotals`
    // does — since Task 6 the totals sheet renders them too, and the peek row would show the
    // empty-quote defaults (₸0, 0 м²) rather than these rooms' real numbers otherwise.
    private fun state(): CalculatorUiState {
        val rows = listOf(
            room("r1", "Хона 1", 4.0, 6.0),   // Б-Г-Б
            room("r2", "Хона 2", 4.0, 4.3),   // Г-Б-Г
            SlabRow(id = "r3", name = "Хона 3"), // not typed yet — result == null
        )
        return CalculatorUiState(
            rows = rows,
            totals = projectTotals(rows, 0.0, 0.0),
            orderTotals = computeOrderTotals(rows, 0.0, 0.0, 0.0, 0.0),
            schedule = beamSchedule(rows),
            canWrite = true,
        )
    }

    /** «Қўшимча» expanded on the Б-Г-Б room and overridden, so both new baselines catch the whole
     *  panel in one frame: the editable group (including the "Авто: …" comparison line, which
     *  only shows while overridden), and the engine's read-only working-out beneath it. */
    private fun expandedState(): CalculatorUiState {
        val base = state()
        val rows = base.rows.map {
            if (it.id == "r1") {
                recomputeRow(it.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Йирик буюртма"))
            } else it
        }
        return base.copy(
            rows = rows,
            expandedRowId = "r1",
            totals = projectTotals(rows, 0.0, 0.0),
            orderTotals = computeOrderTotals(rows, 0.0, 0.0, 0.0, 0.0),
            schedule = beamSchedule(rows),
        )
    }

    private fun content(s: CalculatorUiState, dark: Boolean) {
        val vm = CalculatorViewModel(
            session = InertSessionPricing(), permissions = PermissionGate { false },
            clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { false }),
        )
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    CalculatorScreen(
                        s = s,
                        roomCallbacks = NOOP_ROOM_CALLBACKS,
                        onAddRoom = {}, onDuplicateRoom = {}, onDeleteRoom = {}, onMoveRoom = { _, _ -> },
                        onSetName = { _, _ -> }, onToggleExpanded = {},
                        clientBarCollapsed = { ClientBarCollapsed(state = s, onReopen = {}) },
                        clientBarExpanded = { ClientBarExpanded(state = s, vm = vm) },
                        totalsSheetContent = { TotalsSheet(state = s, vm = vm) {} },
                    )
                }
            }
        }
    }

    private fun shoot(name: String, dark: Boolean) {
        content(state(), dark)
        rule.onRoot().captureRoboImage("screenshots/calculator_rooms_$name.png")
    }

    private fun shootExpanded(name: String, dark: Boolean) {
        content(expandedState(), dark)
        rule.onRoot().captureRoboImage("screenshots/calculator_extras_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun dark() = shoot("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13", false)

    @Test @Config(qualifiers = "w411dp-h891dp") fun extrasLight() = shootExpanded("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun extrasDark() = shootExpanded("dark", true)
}
