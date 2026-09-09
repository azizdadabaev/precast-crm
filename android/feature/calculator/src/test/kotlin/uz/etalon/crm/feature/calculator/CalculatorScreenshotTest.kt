package uz.etalon.crm.feature.calculator

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
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
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing

/** No screenshot here ever expands a room's card (see [state]'s `expandedRowId`), so this vm is
 *  wired through to [CalculatorScreen] purely to satisfy its signature — `RoomCard` needs one to
 *  reach `RoomExtras`' setters, but nothing in these frames ever calls into it. */
private class InertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * One baseline: two priced rooms (a Б-Г-Б and a Г-Б-Г case, so both a pattern chip and a real
 * subtotal render) plus a third room still mid-typing with the docked keypad open on its ЭНИ —
 * the state that only this screen has, since every other screenshot suite in the app shoots a
 * `ModalBottomSheet` instead of a bottom-slot keypad.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class CalculatorScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    private fun state() = CalculatorUiState(
        rows = listOf(
            room("r1", "Хона 1", 4.0, 6.0),   // Б-Г-Б
            room("r2", "Хона 2", 4.0, 4.3),   // Г-Б-Г
            SlabRow(id = "r3", name = "Хона 3"), // not typed yet — result == null
        ),
        keypad = KeypadTarget("r3", KeypadTarget.Field.WIDTH),
        keypadText = "4",
        canWrite = true,
    )

    /** «Қўшимча» expanded on the Б-Г-Б room and overridden, so both new baselines catch the whole
     *  panel in one frame: the editable group (including the "Авто: …" comparison line, which
     *  only shows while overridden), and the engine's read-only working-out beneath it. No keypad
     *  is open here — [state]'s own docked keypad on «Хона 3» would auto-scroll the list straight
     *  past the expanded card (`CalculatorScreen`'s own `LaunchedEffect(s.keypad?.rowId)`), which
     *  is exactly the trap that made the first recording of this baseline byte-identical to
     *  `calculator_rooms_*`. */
    private fun expandedState(): CalculatorUiState {
        val base = state()
        return base.copy(
            rows = base.rows.map {
                if (it.id == "r1") {
                    recomputeRow(it.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Йирик буюртма"))
                } else it
            },
            expandedRowId = "r1",
            keypad = null,
            keypadText = "",
        )
    }

    private fun content(s: CalculatorUiState, dark: Boolean) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                CalculatorScreen(
                    s = s,
                    vm = CalculatorViewModel(session = InertSessionPricing(), permissions = PermissionGate { false }),
                    onAddRoom = {}, onDuplicateRoom = {}, onDeleteRoom = {}, onMoveRoom = { _, _ -> },
                    onSetName = { _, _ -> }, onToggleExpanded = {}, onOpenField = { _, _ -> },
                    onKeypadValue = {}, onKeypadConfirm = {},
                )
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
