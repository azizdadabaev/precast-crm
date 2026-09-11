package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal

/** The nine-digit total from Task 9's finding: 532 687 601 UZS. */
private val NINE_DIGITS = Money.parse("532687601.00")

/**
 * A cut figure must be visibly cut. Task 9 found a nine-digit KPI silently losing its last three
 * digits at font scale 1.3 — the number read as a sum a thousand times smaller and nothing on
 * screen said so. Every figure in `MoneyText.kt` ellipsizes now; these tests hold that.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class FormattersTest {
    @get:Rule val rule = createComposeRule()

    /** True when the text did not fit the box it was given — which, with `maxLines = 1` and
     *  `TextOverflow.Ellipsis`, is exactly when the ellipsis is painted. */
    private fun visuallyOverflows(tag: String): Boolean {
        val results = mutableListOf<TextLayoutResult>()
        val node = rule.onNodeWithTag(tag, useUnmergedTree = true).fetchSemanticsNode()
        node.config[SemanticsActions.GetTextLayoutResult].action?.invoke(results)
        assertTrue("no text layout for '$tag'", results.isNotEmpty())
        return results.first().hasVisualOverflow
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun nineDigitMoneyEllipsizesInAConstrainedColumn() {
        rule.setContent {
            EtalonTheme {
                Column {
                    MoneyText(NINE_DIGITS, Modifier.width(60.dp).testTag("narrow"))
                    MoneyText(NINE_DIGITS, Modifier.width(240.dp).testTag("wide"))
                }
            }
        }
        assertTrue("a nine-digit total in a 60 dp column must ellipsize", visuallyOverflows("narrow"))
        assertFalse("the same total has room at 240 dp and must not", visuallyOverflows("wide"))
    }

    /** The visual proof, for the reviewer: every figure form squeezed at font scale 1.3. */
    @Test
    @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun moneyOverflowLight() {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("72 dp · fontScale 1,3", style = EtalonType.caption, color = EtalonColors.ink2)
                    MoneyHeroText(NINE_DIGITS, Modifier.width(72.dp))
                    MoneyText(NINE_DIGITS, Modifier.width(72.dp))
                    AreaText(BigDecimal("12345678.90"), Modifier.width(72.dp))
                    CountText(123456789, Modifier.width(72.dp))
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_money_overflow_light.png")
    }
}
