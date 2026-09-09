package uz.etalon.crm.feature.calculator

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.ui.format.formatMoney

/**
 * The one control in the calculator that changes what a customer is charged — the picker offers
 * exactly the five catalogue tiers (never a free number), Апply stays disabled until both a tier
 * and a non-blank reason are in place (the reason is mandatory on this client, unlike the web's
 * optional note), and Clear only appears once an override already exists.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class RateOverrideSheetTest {
    @get:Rule val rule = createComposeRule()

    // 4.0 x 6.0 -> Б-Г-Б, same golden case `:core:calc`'s own RateOverrideTest uses.
    private val row = recomputeRow(SlabRow(id = "r1", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0))

    private fun show(
        row: SlabRow = this.row,
        onApply: (Double, String) -> Unit = { _, _ -> },
        onClear: () -> Unit = {},
    ) {
        rule.setContent {
            EtalonTheme { RateOverrideSheet(row = row, onDismiss = {}, onApply = onApply, onClear = onClear) }
        }
    }

    @Test fun `lists all five catalogue tier prices`() {
        show()
        listOf(140_000.0, 160_000.0, 180_000.0, 200_000.0, 230_000.0).forEach { price ->
            rule.onNodeWithText(formatMoney(tierPriceMoney(price))).assertExists()
        }
    }

    @Test fun `apply stays disabled until a tier is picked and a reason is typed`() {
        show()
        rule.onNodeWithText("Қўллаш").assertIsNotEnabled()
        rule.onNodeWithText(formatMoney(tierPriceMoney(230_000.0))).performClick()
        rule.onNodeWithText("Қўллаш").assertIsNotEnabled()
        rule.onNodeWithText("Сабаби").performTextInput("Йирик буюртма")
        rule.onNodeWithText("Қўллаш").assertIsEnabled()
    }

    @Test fun `applying calls back with the picked price and the typed reason`() {
        var applied: Pair<Double, String>? = null
        show(onApply = { price, reason -> applied = price to reason })
        rule.onNodeWithText(formatMoney(tierPriceMoney(200_000.0))).performClick()
        rule.onNodeWithText("Сабаби").performTextInput("Такрорий мижоз")
        rule.onNodeWithText("Қўллаш").performClick()
        assertEquals(200_000.0 to "Такрорий мижоз", applied)
    }

    @Test fun `clear does not show when the row carries no override`() {
        show(row = row)
        rule.onAllNodesWithText("Авто нархга қайтариш").assertCountEquals(0)
    }

    @Test fun `clear shows and fires once an override is already set`() {
        var cleared = false
        val overridden = row.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Йирик буюртма")
        show(row = overridden, onClear = { cleared = true })
        rule.onNodeWithText("Авто нархга қайтариш").assertExists().performClick()
        assertEquals(true, cleared)
    }
}
