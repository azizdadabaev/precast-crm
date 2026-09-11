package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.MonthHeader
import uz.etalon.crm.core.designsystem.components.NavySheet
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.components.SegmentItem
import uz.etalon.crm.core.designsystem.components.SegmentedControl
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.ui.format.formatMoney

/** The wording a screen owns, kept here so the design system stays free of Uzbek copy. */
private const val PAID = "тўланган"
private val debtLabel: (Money) -> String = { "қолди ${formatMoney(it)}" }

private val SEGMENTS = listOf(
    SegmentItem("Барчаси", 9), SegmentItem("Қарз", 6), SegmentItem("Тўланган", 3),
)

/**
 * @param debt null = settled, which is the only difference between the red line and the green one.
 * @param status null = the untagged variant Home's «Бугунги етказиш» sheet uses.
 */
private data class Sample(
    val client: String,
    val status: OrderStatus?,
    val meta: String,
    val total: String,
    val debt: String?,
)

/**
 * `2b-orders.png`'s own rows, with three additions the prototype's orders list does not show and a
 * reviewer needs: a CANCELED row (the fifth tag family), a client name long enough that the title
 * has to ellipsize while the amount column keeps its full width, and the untagged row Home's
 * «Бугунги етказиш» sheet draws, whose meta line stands alone where the tag row was.
 */
private val SAMPLES = listOf(
    Sample("Fergana Dom", OrderStatus.PLACED, "№ 09−0005 · 36,5 м²", "6210000.00", "6210000.00"),
    Sample("Tashkent Tower LLC", OrderStatus.IN_PRODUCTION, "№ 09−0004 · 108,2 м²", "18420000.00", "18420000.00"),
    Sample("Yusupov & Sons", OrderStatus.DISPATCHED, "№ 09−0003 · 78,7 м²", "13350000.00", "7350000.00"),
    Sample("Karimov LLC", OrderStatus.DELIVERED, "№ 09−0001 · 26,9 м²", "4162500.00", null),
    Sample(
        "Andijon Qurilish Materiallari Savdo Markazi MChJ", OrderStatus.CANCELED,
        "№ 08−0002 · 42,6 м²", "4947920.00", "4947920.00",
    ),
    Sample("BuildPro Group", null, "Тошкент · Мирзо-Улуғбек · 42,6 м²", "7340840.00", "4340840.00"),
)

/**
 * §2's row in both of its grounds: inside a [NavySheet] with the sticky header and a [MonthHeader]
 * (`2b-orders.png`), and inside the white card Home puts it in (`2b-home.png`). Every payment
 * state and every tag family is on the sheet twice, once per ground, so a reviewer can check the
 * two debt palettes — `debtOnDark`/`paidOnDark` on navy, `red`/`green` on white — side by side.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1100dp")
class OrderRowScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun orderRowLight() {
        rule.setContent { EtalonTheme { RowSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_order_row_light.png")
    }

    /**
     * The pressed fills — indigo on navy, lavenderBg on white — are only reachable while the
     * finger is down, so the press is never released. Two rows are held at once, one per ground.
     */
    @Test fun orderRowPressedLight() {
        rule.setContent { EtalonTheme { RowSheet() } }
        // Both grounds carry the same five clients, so the index picks the ground: [0] is the
        // navy sheet's row, [1] the white card's.
        // Both grounds carry the same five clients, so the index picks the ground: [0] is the
        // navy sheet's row, [1] the white card's. Two different pointer ids — one gesture per
        // pointer, and both have to stay down for the single capture below.
        rule.onAllNodesWithText("Yusupov & Sons", useUnmergedTree = true)[0].performTouchInput { down(0, center) }
        rule.onAllNodesWithText("Karimov LLC", useUnmergedTree = true)[1].performTouchInput { down(1, center) }
        rule.onRoot().captureRoboImage("screenshots/ds_order_row_pressed_light.png")
    }
}

@Composable
private fun Rows(onDark: Boolean) = SAMPLES.forEach { s ->
    OrderRow(
        clientName = s.client,
        status = s.status,
        metaLine = s.meta,
        total = Money.parse(s.total),
        debt = s.debt?.let(Money::parse),
        paidLabel = PAID,
        debtLabel = debtLabel,
        onDark = onDark,
        onClick = {},
    )
}

@Composable
private fun RowSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
) {
    Caption("NavySheet · OrderRow (onDark)", EtalonColors.ink2)
    // The sheet a screen uses runs to the bottom edge; here it is a card so the whole outline is
    // visible, which is the only reason `fillsToBottom` is false.
    NavySheet(
        title = "Рўйхат",
        modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
        trailing = { SegmentedControl(SEGMENTS, selectedIndex = 0, onSelect = {}) },
        fillsToBottom = false,
    ) {
        MonthHeader("Сентябрь 2026", Money.parse("49483340.00"))
        Rows(onDark = true)
    }

    Caption("Оқ картадаги OrderRow", EtalonColors.ink2)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)
            .background(EtalonColors.surface, EtalonShapes.xl)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .padding(horizontal = 8.dp, vertical = 10.dp),
    ) {
        MonthHeader("Сентябрь 2026", Money.parse("49483340.00"), onDark = false)
        Rows(onDark = false)
    }
}

@Composable
private fun Caption(text: String, color: Color) = Text(
    text,
    style = EtalonType.caption,
    color = color,
    modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin),
)
