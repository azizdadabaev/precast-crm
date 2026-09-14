package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onChildren
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.designsystem.components.DeltaBadge
import uz.etalon.crm.core.designsystem.components.trendColors
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import java.math.BigDecimal

private const val HOST = "delta_badge_host"

/**
 * Design §2.3 / the web's `TrendIndicator.tsx`: the badge's colour is polarity × direction, not
 * direction alone. Receivables falling is the case that proves it — an arrow pointing down is good
 * news there, and colouring by the arrow alone would tell the owner the opposite of what happened.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DeltaBadgeTest {
    @get:Rule val rule = createComposeRule()

    private fun trend(direction: TrendDirection, polarity: TrendPolarity, pct: String = "12") =
        Trend(BigDecimal(pct), direction, polarity)

    private val green = EtalonColors.green to EtalonColors.greenBg
    private val red = EtalonColors.red to EtalonColors.redBg
    private val neutral = EtalonColors.ink3 to EtalonColors.lavenderBg

    @Test fun `a rise in a positive metric is green`() =
        assertEquals(green, trendColors(trend(TrendDirection.UP, TrendPolarity.POSITIVE)))

    @Test fun `a fall in a positive metric is red`() =
        assertEquals(red, trendColors(trend(TrendDirection.DOWN, TrendPolarity.POSITIVE)))

    @Test fun `a rise in a negative metric is red`() =
        assertEquals(red, trendColors(trend(TrendDirection.UP, TrendPolarity.NEGATIVE)))

    @Test fun `a fall in a negative metric is green`() =
        assertEquals(green, trendColors(trend(TrendDirection.DOWN, TrendPolarity.NEGATIVE)))

    /** Flat makes no claim, whichever polarity the metric carries. */
    @Test fun `a flat month is neutral under either polarity`() {
        assertEquals(neutral, trendColors(trend(TrendDirection.FLAT, TrendPolarity.POSITIVE, "0")))
        assertEquals(neutral, trendColors(trend(TrendDirection.FLAT, TrendPolarity.NEGATIVE, "0")))
    }

    /** A direction this build does not recognise reads as flat rather than guessing a colour. */
    @Test fun `an unknown direction is neutral`() {
        assertEquals(neutral, trendColors(trend(TrendDirection.UNKNOWN, TrendPolarity.POSITIVE)))
        assertEquals(neutral, trendColors(trend(TrendDirection.UNKNOWN, TrendPolarity.NEGATIVE)))
    }

    /** §2.3: `trend == null` → no badge at all, not an empty pill where a badge would sit. */
    @Test fun `a null trend renders nothing`() {
        rule.setContent {
            EtalonTheme {
                Box(Modifier.testTag(HOST)) { DeltaBadge(null) }
            }
        }
        rule.onNodeWithTag(HOST, useUnmergedTree = true).onChildren().assertCountEquals(0)
    }

    /** The control that proves the assertion above can fail: a trend DOES render one node. */
    @Test fun `a flat trend renders a badge`() {
        rule.setContent {
            EtalonTheme {
                Box(Modifier.testTag(HOST)) {
                    DeltaBadge(trend(TrendDirection.FLAT, TrendPolarity.POSITIVE, "0"))
                }
            }
        }
        rule.onNodeWithTag(HOST, useUnmergedTree = true).onChildren().assertCountEquals(1)
    }
}
