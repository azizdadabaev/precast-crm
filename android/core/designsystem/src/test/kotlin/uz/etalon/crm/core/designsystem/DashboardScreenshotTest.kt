package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
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
import uz.etalon.crm.core.designsystem.components.BarSparkline
import uz.etalon.crm.core.designsystem.components.DeltaBadge
import uz.etalon.crm.core.designsystem.components.Donut
import uz.etalon.crm.core.designsystem.components.SegmentBar
import uz.etalon.crm.core.designsystem.components.StackedBar
import uz.etalon.crm.core.designsystem.components.donutPercent
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import java.math.BigDecimal

/** A rail card's width (design §2.3), so every piece is reviewed at the width it ships at. */
private val RAIL_CARD = 228.dp

/** A grid tile's inner width (§2.4: half of 390 dp less the margins and the 10 dp gap). */
private val GRID_TILE = 164.dp

/** Eight months of bookings, the last one this month's — the shape §2.3's rail draws. */
private val BOOKED = listOf("41", "58", "36", "77", "52", "95", "68", "112").map { BigDecimal(it) }

private fun trend(direction: TrendDirection, polarity: TrendPolarity, pct: String) =
    Trend(BigDecimal(pct), direction, polarity)

/**
 * The five dashboard pieces of design §2.3–§2.5, each photographed with the edge case that decides
 * whether it is right: the badge in all six of its colourings, the sparkline beside a month with
 * no bookings at all, the donut at 90 % / 0 % / 100 %, and the two bars beside their empty states.
 *
 * Four frames rather than one sheet: a reviewer rejecting the donut's stroke should not have to
 * re-approve the badge's padding in the same image.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DashboardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun deltaBadgeLight() {
        rule.setContent { EtalonTheme { Sheet { Badges() } } }
        rule.onRoot().captureRoboImage("screenshots/ds_delta_badge_light.png")
    }

    @Test fun sparklineLight() {
        rule.setContent { EtalonTheme { Sheet { Sparklines() } } }
        rule.onRoot().captureRoboImage("screenshots/ds_sparkline_light.png")
    }

    @Test fun donutLight() {
        rule.setContent { EtalonTheme { Sheet { Donuts() } } }
        rule.onRoot().captureRoboImage("screenshots/ds_donut_light.png")
    }

    @Test fun segmentAndStackedBarsLight() {
        rule.setContent { EtalonTheme { Sheet { Bars() } } }
        rule.onRoot().captureRoboImage("screenshots/ds_segment_stacked_light.png")
    }
}

/** §2.3's six colourings, in the order the rule is written: the four signed ones, then the two
 *  that make no claim. The percentages are deliberately different so the arrow cannot be read off
 *  the figure. */
@Composable
private fun Badges() {
    Caption("DeltaBadge · polarity × direction")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        DeltaBadge(trend(TrendDirection.UP, TrendPolarity.POSITIVE, "68"))
        DeltaBadge(trend(TrendDirection.DOWN, TrendPolarity.POSITIVE, "12"))
        DeltaBadge(trend(TrendDirection.UP, TrendPolarity.NEGATIVE, "23"))
        DeltaBadge(trend(TrendDirection.DOWN, TrendPolarity.NEGATIVE, "7"))
        DeltaBadge(trend(TrendDirection.FLAT, TrendPolarity.POSITIVE, "0"))
        DeltaBadge(trend(TrendDirection.UNKNOWN, TrendPolarity.POSITIVE, "4"))
    }
    Caption("trend = null · ҳеч нарса чизилмайди")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        DeltaBadge(null)
    }
}

@Composable
private fun Sparklines() {
    Caption("BarSparkline · 8 ой")
    Card { BarSparkline(BOOKED) }
    Caption("BarSparkline · буюртмасиз ой")
    Card { BarSparkline(List(8) { BigDecimal.ZERO }) }
    Caption("BarSparkline · тўлиқ бўлмаган тарих")
    Card { BarSparkline(listOf("18", "44", "31").map { BigDecimal(it) }) }
}

@Composable
private fun Donuts() {
    Caption("Donut · 317 / 13 / 23 · бўш · тўлиқ")
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        DonutTile(paid = 317, partial = 13, awaiting = 23)
        DonutTile(paid = 0, partial = 0, awaiting = 0)
        DonutTile(paid = 353, partial = 0, awaiting = 0)
    }
}

@Composable
private fun DonutTile(paid: Int, partial: Int, awaiting: Int) =
    Donut(paid = paid, partial = partial, awaiting = awaiting) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "${donutPercent(paid, paid + partial + awaiting)}%",
                style = EtalonType.headline,
                color = EtalonColors.ink,
            )
            Text("тўланган", style = EtalonType.labelSm, color = EtalonColors.ink2)
        }
    }

@Composable
private fun Bars() {
    Caption("SegmentBar · 4 / 7")
    Tile { SegmentBar(filled = 4, total = 7) }
    Caption("SegmentBar · бугун буюртма йўқ")
    Tile { SegmentBar(filled = 0, total = 0) }
    Caption("StackedBar · 317 · 13 · 23")
    Tile {
        StackedBar(
            listOf(
                317 to EtalonColors.green,
                13 to EtalonColors.warning,
                23 to EtalonColors.lavenderBg,
            ),
        )
    }
    Caption("StackedBar · буюртмасиз")
    Tile { StackedBar(listOf(0 to EtalonColors.green, 0 to EtalonColors.warning, 0 to EtalonColors.lavenderBg)) }
}

/** The page the pieces sit on: §2's `page` ground and 16 dp margins. */
@Composable
private fun Sheet(content: @Composable () -> Unit) = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page)
        .padding(horizontal = EtalonSpace.cardMargin, vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
) { content() }

/** A rail card's white ground, so a sparkline is reviewed on the surface it is drawn on. */
@Composable
private fun Card(content: @Composable () -> Unit) = Column(
    Modifier.width(RAIL_CARD).background(EtalonColors.surface, EtalonShapes.xl)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) { content() }

/** The grid tile the two bars live in — a bar's width is its parent's, and 164 dp is that parent. */
@Composable
private fun Tile(content: @Composable () -> Unit) = Column(
    Modifier.width(GRID_TILE).background(EtalonColors.surface, EtalonShapes.xl)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) { content() }

@Composable
private fun Caption(text: String) = Text(text, style = EtalonType.caption, color = EtalonColors.ink2)
