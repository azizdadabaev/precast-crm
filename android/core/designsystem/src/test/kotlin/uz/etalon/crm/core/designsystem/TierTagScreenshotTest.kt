package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import uz.etalon.crm.core.designsystem.components.TierTag
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityTier

/**
 * The four load tiers on the two grounds they are drawn on: the white legend/calculator row and
 * the navy day sheet (design §4.5). The reviewer's check is that «ўртача» and «юқори» — the two
 * new tokens, an amber and a burnt orange — stay tellable apart at tag size on both grounds, and
 * that no Uzbek word clips («тўлиб кетган» is the long one).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class TierTagScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun tierTagLight() {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Block("ON LIGHT", onDark = false, ground = EtalonColors.surface, captionColor = EtalonColors.ink2)
                    Block("ON NAVY", onDark = true, ground = EtalonColors.navy, captionColor = EtalonColors.onDarkMuted)
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_tier_tags_light.png")
    }
}

@Composable
private fun Block(caption: String, onDark: Boolean, ground: Color, captionColor: Color) = Column(
    Modifier.fillMaxWidth().background(ground, EtalonShapes.xl).padding(horizontal = 10.dp, vertical = 12.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
) {
    Text(caption, style = EtalonType.caption, color = captionColor)
    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp), Arrangement.spacedBy(6.dp)) {
        CapacityTier.entries.forEach { TierTag(it, onDark) }
    }
}
