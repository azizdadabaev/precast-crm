package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import java.math.BigDecimal
import java.math.RoundingMode

/** §2.5's ring: 92 dp across, drawn in a 10 dp stroke. */
private val DonutSize = 92.dp
private val DonutStroke = 10.dp

/** Twelve o'clock. Compose measures arcs from three o'clock, as SVG does. */
private const val TOP_OF_THE_CIRCLE = -90f

private val HUNDRED = BigDecimal(100)

/**
 * §2.5 / `PaymentDonut.tsx:76` — the share of this month's orders that is fully paid, as a whole
 * percent, HALF_UP. The only figure the donut computes on the phone; everything else on the
 * dashboard arrives from the server already formed.
 *
 * A total of zero is 0 %, not a crash and not «—»: an account with no orders yet opens the tab
 * like any other, and §6 asks for a plain track ring under a plain zero.
 */
fun donutPercent(paid: Int, total: Int): Int =
    if (total <= 0) 0
    else BigDecimal(paid).multiply(HUNDRED).divide(BigDecimal(total), 0, RoundingMode.HALF_UP).toInt()

/**
 * §2.5's payment-state donut: green for the fully paid orders, `warning` for the partly paid ones,
 * and the `lavenderBg` track showing through for those still awaiting payment — the same three
 * meanings the payment tags carry everywhere else in the app.
 *
 * The awaiting share is the track rather than a fourth arc on purpose: with a total of zero every
 * share is zero and the ring is *entirely* track, which is exactly the empty state §6 asks for,
 * and it falls out of the drawing rather than being a special case in it.
 *
 * @param centre the caller's own middle — the screen puts «NN%» over «тўланган» there ([donutPercent]
 *   gives it the figure). The component draws the ring and nothing else, so a legend card and a
 *   compact tile can share one ring without either inheriting the other's label.
 */
@Composable
fun Donut(paid: Int, partial: Int, awaiting: Int, size: Dp = DonutSize, centre: @Composable () -> Unit) {
    val total = paid + partial + awaiting
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = DonutStroke.toPx()
            // An arc is drawn centred ON its path, so the box must shrink by the whole stroke and
            // move in by half of it, or the ring is clipped at four points.
            val topLeft = Offset(stroke / 2f, stroke / 2f)
            val ring = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(EtalonColors.lavenderBg, 0f, 360f, false, topLeft, ring, style = Stroke(stroke))
            if (total > 0) {
                var start = TOP_OF_THE_CIRCLE
                listOf(paid to EtalonColors.green, partial to EtalonColors.warning).forEach { (count, colour) ->
                    if (count > 0) {
                        val sweep = 360f * count / total
                        drawArc(colour, start, sweep, false, topLeft, ring, style = Stroke(stroke))
                        start += sweep
                    }
                }
            }
        }
        centre()
    }
}
