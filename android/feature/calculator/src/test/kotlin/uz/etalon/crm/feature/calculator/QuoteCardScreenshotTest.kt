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
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.time.Instant

/**
 * [QuoteCard] pins its own light-only layout — see that composable's own KDoc for why. Rendered
 * inside [EtalonTheme] with `darkTheme = true` here on purpose: [QuoteCard] must produce the SAME
 * light card regardless of the surrounding theme, and this is the one fixture that would move if
 * that guarantee ever regressed. There is no dark baseline to pair it with — a dark one would be
 * testing a state [QuoteCard] is specifically built never to render.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class QuoteCardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    private fun state(): CalculatorUiState {
        val rows = listOf(room("r1", "Меҳмонхона", 4.0, 6.0), room("r2", "Ётоқхона", 5.0, 5.0))
        val discountPercent = 10.0
        val deliveryCost = 150_000.0
        val otherCost = 25_000.0
        return CalculatorUiState(
            rows = rows,
            discountMode = DiscountMode.PERCENT, discountPercent = discountPercent,
            deliveryCost = deliveryCost, otherCost = otherCost,
            totals = projectTotals(rows, discountPercent, 0.0),
            orderTotals = computeOrderTotals(rows, discountPercent, 0.0, deliveryCost, otherCost),
            schedule = beamSchedule(rows),
            canWrite = true,
            clientName = "Азиз Дадамов",
            clientPhoneDigits = "901234567",
            clientAddress = ParsedAddress("Тошкент шаҳри", "Юнусобод тумани", "12-уй"),
        )
    }

    /** A fixed day, never `Instant.now()`: the card carries the date it was made, and a baseline
     *  that re-dates itself every morning fails `verifyRoborazziDebug` on a frame nobody touched. */
    private val made = Instant.parse("2026-09-11T06:00:00Z")

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun quoteCardIsAlwaysLight() {
        rule.setContent { EtalonTheme(darkTheme = true) { QuoteCard(state(), now = made) } }
        rule.onRoot().captureRoboImage("screenshots/quote_card_light.png")
    }
}
