package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * The whole Lucide set at the four §1.6 sizes, on page and on navy. This is the review artefact
 * for «Lucide fidelity»: a glyph that failed to convert shows up as a blank cell or a filled blob,
 * and a stroke that vanishes at 12 dp is visible in the last block.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class IconRenderTest {
    @get:Rule val rule = createComposeRule()

    @Test fun iconSheetLight() =
        captureSheet(EtalonColors.page, EtalonColors.ink, "screenshots/ds_icons_light.png")

    @Test fun iconSheetDark() =
        captureSheet(EtalonColors.navy, EtalonColors.onDark, "screenshots/ds_icons_dark.png")

    private fun captureSheet(background: Color, tint: Color, path: String) {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(background).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    for (size in SIZES) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (chunk in EtalonIcons.all.chunked(ICONS_PER_ROW)) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    for ((name, id) in chunk) {
                                        EtalonIcon(id, name, size = size, tint = tint)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        rule.onRoot().captureRoboImage(path)
    }

    private companion object {
        /** §1.6: 20 nav · 18 header · 16 inline · 12 in a tinted square. */
        val SIZES = listOf(20.dp, 18.dp, 16.dp, 12.dp)
        const val ICONS_PER_ROW = 12
    }
}
