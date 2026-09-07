package uz.etalon.crm.feature.orders

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.feature.orders.list.OrderCard
import java.math.BigDecimal
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class OrderCardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    // A canonical "<Viloyat>, <Tuman>, <street>" address — the long shape the card has to
    // survive, not the short legacy one.
    private val o = OrderSummary(
        "o1", "2026-09-0041", OrderStatus.LOADED, PaymentState.PARTIALLY_PAID,
        Money.parse("12400000.00"), Money.parse("6000000.00"),
        BigDecimal("86.400"), 210, 10,
        Instant.parse("2026-09-04T00:00:00Z"), Instant.parse("2026-09-01T00:00:00Z"),
        ClientRef("c", "Азизов Бахтиёр Рустамович", "998901112233", "Андижон вилояти, Балиқчи тумани, Бобур кўчаси 14"),
    )

    // Fixed, so the baseline does not change meaning with the day it is recorded on.
    // Two days before the order's scheduled date, i.e. the card renders "2 кундан кейин".
    private val now = Instant.parse("2026-09-02T00:00:00Z")

    private fun shoot(name: String, dark: Boolean) {
        rule.setContent { EtalonTheme(darkTheme = dark) { OrderCard(o, now) {} } }
        rule.onRoot().captureRoboImage("screenshots/order_card_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun dark() = shoot("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13", false)
}
