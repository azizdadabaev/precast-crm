package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import uz.etalon.crm.core.designsystem.components.AreaText
import uz.etalon.crm.core.designsystem.components.CountText
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal

/**
 * The D8 number forms side by side, so a reviewer can reject the grouping or the «UZS» prefix
 * without opening a screen: a hero figure carries the unit, a row figure does not, and area and
 * count keep theirs.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class MoneyTextScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun moneyTextLight() {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MoneyHeroText(Money.parse("53268760.00"))
                    MoneyText(Money.parse("6210000.00"))
                    AreaText(BigDecimal("78.70"))
                    CountText(13)
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_money_text_light.png")
    }
}
