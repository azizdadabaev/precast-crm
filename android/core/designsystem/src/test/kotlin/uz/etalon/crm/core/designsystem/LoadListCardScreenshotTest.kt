package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
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
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.LoadListCard
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.LoadLine
import java.math.BigDecimal

/**
 * «Юклаш рўйхати» in its three shapes (ruling R11): the read-only list the order detail and the
 * load-truck screen draw, the same list collapsed behind its chevron on a canceled order, and the
 * card lent to the shipment-load screen's steppers — one surface, one title, three jobs.
 *
 * The detail's own `order_detail_*` frames are the byte-identical proof that moving this card out
 * of that screen changed nothing; this one is so a reviewer can reject the card on its own.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class LoadListCardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun loadListLight() {
        rule.setContent { EtalonTheme { LoadListSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_load_list_light.png")
    }
}

private val LINES = listOf(LoadLine("3.80", 14), LoadLine("5.05", 3))
private const val BLOCKS = 282
private val WEIGHT = BigDecimal("14166")

@Composable
private fun LoadListSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(EtalonSpace.cardMargin),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    Caption("LoadListCard · рўйхат")
    LoadListCard(LINES, BLOCKS, WEIGHT)
    Caption("LoadListCard · йиғилган")
    LoadListCard(LINES, BLOCKS, WEIGHT, collapsible = true)
    Caption("LoadListCard · саналадиган")
    LoadListCard {
        Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
            CountStepper("3,80 м балка", value = 6, onChange = {}, max = 14)
            CountStepper("5,05 м балка", value = 3, onChange = {}, max = 3)
        }
    }
}

@Composable
private fun Caption(text: String) = Text(text, style = EtalonType.caption, color = EtalonColors.ink2)
