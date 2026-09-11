package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import uz.etalon.crm.core.designsystem.components.KpiAccent
import uz.etalon.crm.core.designsystem.components.KpiCard
import uz.etalon.crm.core.designsystem.components.KpiMoneyCard
import uz.etalon.crm.core.designsystem.components.ProgressCard
import uz.etalon.crm.core.designsystem.components.StepState
import uz.etalon.crm.core.designsystem.components.StepTimeline
import uz.etalon.crm.core.designsystem.components.TimelineStep
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

/** The Home hero row's own twelve weeks, `2b-home.png`: six bars with the latest one current. */
private val RECEIVABLE_BARS = listOf(0.52f, 0.44f, 0.61f, 0.38f, 0.86f, 0.55f)
private val REVENUE_BARS = listOf(0.34f, 0.49f, 0.42f, 0.71f, 0.40f, 0.95f)

private val DELIVERY_STEPS = listOf("Қабул", "Ишлаб чиқ.", "Йўлда", "Етказилди")

/**
 * A 411 dp phone less §3's 16 dp margins. The sheet itself is 720 dp wide so that three fixed
 * 210 dp KpiCards fit side by side, but a full-width card reviewed at 720 is reviewed at 1,9× the
 * width it will ever have — which is exactly where a cramped footer stops looking cramped.
 */
private val PHONE_CONTENT = 379.dp

/** Task 9's nine-digit total, 532 687 601 UZS — the figure that started the overflow rulings. */
private val NINE_DIGITS = Money.parse("532687601.00")

/** The four positions an order walks through, `2b-order-detail.png`'s «Етказиш» card. */
private fun stepsAt(current: Int) = DELIVERY_STEPS.mapIndexed { i, label ->
    TimelineStep(
        label = label,
        caption = when {
            // The first step carries the date the order was taken; the rest of what is behind
            // the order carries a tick, and nothing ahead of it says anything yet.
            i == 0 -> "30 авг"
            i <= current -> "✓"
            else -> null
        },
        state = when {
            i < current -> StepState.DONE
            i == current -> StepState.CURRENT
            else -> StepState.UPCOMING
        },
    )
}

/**
 * §2's three data-display cards in one sheet: the KpiCard in all three tints with and without its
 * sparkline, a ProgressCard with debt beside a settled one, and the StepTimeline at each of the
 * four positions an order can be at. This image is the reviewer's whole check on the hero row of
 * `2b-home.png` and the two lower cards of `2b-order-detail.png`.
 *
 * The sheet is drawn 720 dp wide, not on a phone: a KpiCard is a fixed 210 dp and §3.1 puts three
 * of them in one horizontally scrolling row, so at 411 dp the third tint would sit off the edge
 * and never be reviewed. The cards themselves are unaffected — their width is their own. The two
 * components that *would* fill 720 dp, `ProgressCard` and `StepTimeline`, are held to
 * [PHONE_CONTENT] instead, so they are reviewed at the width they actually ship at.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w720dp-h1400dp")
class KpiCardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun kpiLight() {
        rule.setContent { EtalonTheme { Sheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_kpi_light.png")
    }

    /**
     * §5's own acceptance case: a nine-digit receivables figure on a real phone at font scale 130 %.
     * The card's 210 dp is a minimum, so what the reviewer is checking here is that the amount is
     * **whole** — the card grows and the Home row scrolls, rather than the number losing its tail.
     */
    @Test
    @Config(sdk = [36], qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun kpiNineDigitsFontScale13Light() {
        rule.setContent {
            EtalonTheme {
                // Horizontally scrollable, because §3.1's Home hero row is: bound the row to the
                // screen and the second card starves the first, which is a fact about a `Row`
                // rather than about the card.
                Row(
                    Modifier.background(EtalonColors.page)
                        .horizontalScroll(rememberScrollState())
                        .padding(EtalonSpace.cardMargin),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    KpiMoneyCard(
                        label = "Қарздорлик", value = NINE_DIGITS, accent = KpiAccent.RED,
                        icon = EtalonIcons.CircleAlert, footnote = "6 буюртмада қолди",
                        footnotePositive = false, bars = RECEIVABLE_BARS,
                        currentBar = RECEIVABLE_BARS.lastIndex,
                    )
                    KpiCard(
                        label = "Ишлаб чиқаришда", value = formatArea(BigDecimal("12345.67")),
                        accent = KpiAccent.INDIGO, icon = EtalonIcons.Factory,
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_kpi_ninedigit_font13_light.png")
    }
}

@Composable
private fun Sheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page)
        .padding(horizontal = EtalonSpace.headerMargin, vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    Caption("KpiCard · спарклайн билан")
    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(12.dp)) {
        KpiMoneyCard(
            label = "Қарздорлик", value = Money.parse("53268760.00"), accent = KpiAccent.RED,
            icon = EtalonIcons.CircleAlert, footnote = "6 буюртмада қолди", footnotePositive = false,
            bars = RECEIVABLE_BARS, currentBar = RECEIVABLE_BARS.lastIndex,
        )
        KpiMoneyCard(
            label = "Ҳафталик тушум", value = Money.parse("13500000.00"), accent = KpiAccent.GREEN,
            icon = EtalonIcons.TrendingUp, footnote = "↑ 8,2% ўтган ҳафтага", footnotePositive = true,
            bars = REVENUE_BARS, currentBar = REVENUE_BARS.lastIndex,
        )
        KpiCard(
            label = "Ишлаб чиқаришда", value = formatArea(BigDecimal("78.70")), accent = KpiAccent.INDIGO,
            icon = EtalonIcons.Factory, footnote = "3 актив буюртма",
            bars = listOf(0.2f, 0.0f, 0.66f, 0.5f, 0.9f, 0.3f), currentBar = 4,
        )
    }

    Caption("KpiCard · спарклайнсиз")
    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(12.dp)) {
        KpiMoneyCard(
            label = "Қарздорлик", value = Money.parse("53268760.00"), accent = KpiAccent.RED,
            icon = EtalonIcons.CircleAlert, footnote = "6 буюртмада қолди", footnotePositive = false,
        )
        KpiMoneyCard(
            label = "Ҳафталик тушум", value = Money.parse("13500000.00"), accent = KpiAccent.GREEN,
            icon = EtalonIcons.TrendingUp, footnote = "↑ 8,2%", footnotePositive = true,
        )
        // No footnote at all: the card must not leave a gap where the delta line would be.
        KpiCard(
            label = "Ишлаб чиқаришда", value = formatArea(BigDecimal("78.70")), accent = KpiAccent.INDIGO,
            icon = EtalonIcons.Factory,
        )
    }

    Caption("ProgressCard")
    ProgressCard(
        label = "Тўлов ҳолати", fraction = 0.45f, percentText = "45% тўланган",
        paidLabel = "Тўланган ${formatMoney(Money.parse("6000000.00"))}",
        remainingLabel = "Қолди ${formatMoney(Money.parse("7350000.00"))}",
        settled = false, modifier = Modifier.width(PHONE_CONTENT),
    )
    ProgressCard(
        label = "Тўлов ҳолати", fraction = 1f, percentText = "100% тўланган",
        paidLabel = "Тўланган ${formatMoney(Money.parse("13350000.00"))}",
        remainingLabel = "Қолди 0", settled = true, modifier = Modifier.width(PHONE_CONTENT),
    )

    Caption("StepTimeline · Етказиш")
    Column(
        Modifier.width(PHONE_CONTENT).background(EtalonColors.surface, EtalonShapes.xl)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        (0..3).forEach { current -> StepTimeline(stepsAt(current)) }
    }
}

@Composable
private fun Caption(text: String, color: Color = EtalonColors.ink2) =
    Text(text, style = EtalonType.caption, color = color)
