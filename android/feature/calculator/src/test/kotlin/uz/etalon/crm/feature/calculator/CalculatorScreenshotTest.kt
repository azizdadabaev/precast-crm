package uz.etalon.crm.feature.calculator

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

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

    private fun shoot(name: String, dark: Boolean) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                CalculatorScreen(
                    s = state(),
                    onAddRoom = {}, onDuplicateRoom = {}, onDeleteRoom = {}, onMoveRoom = { _, _ -> },
                    onSetName = { _, _ -> }, onToggleExpanded = {}, onOpenField = { _, _ -> },
                    onKeypadValue = {}, onKeypadConfirm = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/calculator_rooms_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun dark() = shoot("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13", false)
}
