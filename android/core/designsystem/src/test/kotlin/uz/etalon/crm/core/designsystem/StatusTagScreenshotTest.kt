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
import uz.etalon.crm.core.designsystem.components.MonthHeader
import uz.etalon.crm.core.designsystem.components.PaymentStateTag
import uz.etalon.crm.core.designsystem.components.PaymentStatusTag
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus

/**
 * The whole status vocabulary in one sheet: every [OrderStatus], the three short row forms the
 * prototype uses, and both payment triads — the order-level one and a single recorded payment's
 * own — drawn on each of the three §2 grounds. This image is the reviewer's entire check on
 * design §5.1: two statuses the business treats differently must not arrive at the same
 * fill/text pair on the same ground, and no tag's word may clip. Compare the row tags with
 * `2b-orders.png` and the panel tag with `2b-order-detail.png`. The navy block carries the
 * MonthHeader, which is where the prototype puts it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class StatusTagScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun statusTagLight() {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Block("ROW_ON_LIGHT", TagSurface.ROW_ON_LIGHT, EtalonColors.surface, EtalonColors.ink2)
                    Block("ROW_ON_NAVY", TagSurface.ROW_ON_NAVY, EtalonColors.navy, EtalonColors.onDarkMuted) {
                        MonthHeader("Сентябрь 2026", Money.parse("49483340.00"))
                    }
                    Block("PANEL_ON_INDIGO", TagSurface.PANEL_ON_INDIGO, EtalonColors.indigoPanel, EtalonColors.onDarkMuted)
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_status_tag_light.png")
    }
}

@Composable
private fun Block(
    caption: String,
    surface: TagSurface,
    ground: Color,
    captionColor: Color,
    footer: @Composable () -> Unit = {},
) = Column(
    Modifier.fillMaxWidth().background(ground, EtalonShapes.xl).padding(horizontal = 10.dp, vertical = 12.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
) {
    Text(caption, style = EtalonType.caption, color = captionColor)
    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp), Arrangement.spacedBy(6.dp)) {
        OrderStatus.entries.forEach { StatusTag(it, surface) }
    }
    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp), Arrangement.spacedBy(6.dp)) {
        listOf(OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED)
            .forEach { StatusTag(it, surface, short = true) }
    }
    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp), Arrangement.spacedBy(6.dp)) {
        PaymentState.entries.forEach { PaymentStateTag(it, surface) }
    }
    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp), Arrangement.spacedBy(6.dp)) {
        PaymentStatus.entries.forEach { PaymentStatusTag(it, surface) }
    }
    footer()
}
