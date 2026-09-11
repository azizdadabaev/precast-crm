package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.DriverPicker
import uz.etalon.crm.core.designsystem.components.RegionPickerSheet
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Driver

private fun driver(id: String, name: String, phone: String) = Driver(
    id = id, name = name, phone = phone, notes = null, active = true,
    activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null,
)

private val DRIVERS = listOf(
    driver("d1", "Жасур Тошматов", "998901112233"),
    driver("d2", "Азиз Раҳимов", "998901112244"),
    driver("d3", "Дилшод Юсупов", "998901112255"),
)

/** Four viloyats — enough to read the row shape without a 206-row list to scroll past. */
private val REGIONS = listOf(
    "Тошкент шаҳри" to "Toshkent shahri",
    "Тошкент вилояти" to "Toshkent viloyati",
    "Самарқанд" to "Samarqand",
    "Фарғона" to "Farg'ona",
)

/**
 * The two pickers that own a `ModalBottomSheet` and so cannot be composed into
 * `KeptComponentsScreenshotTest`'s sheet: each paints its own full-screen scrim, and two of them
 * over one page would be one image of a scrim. They get a capture each instead, taken with
 * [captureScreenRoboImage] because the sheet lives in a window of its own — `onRoot()` would
 * photograph the empty page underneath it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class PickerSheetsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun driverPickerLight() {
        rule.setContent {
            EtalonTheme {
                Page { DriverPicker(drivers = DRIVERS, selected = "d2", onSelect = {}) }
            }
        }
        captureScreenRoboImage("screenshots/ds_driver_picker_light.png")
    }

    @Test fun regionPickerSheetLight() {
        rule.setContent {
            EtalonTheme {
                Page {
                    RegionPickerSheet(
                        title = "Вилоят",
                        options = REGIONS,
                        onDismiss = {},
                        onPick = {},
                    )
                }
            }
        }
        captureScreenRoboImage("screenshots/ds_region_sheet_light.png")
    }
}

/** The page a sheet is opened over, so the scrim has something to darken. */
@androidx.compose.runtime.Composable
private fun Page(sheet: @androidx.compose.runtime.Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(EtalonColors.page))
    sheet()
}
