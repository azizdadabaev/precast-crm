package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes

/**
 * §2.4's «Фаол мижозлар» bar: one 6 dp track cut into coloured shares — paid, partly paid and
 * awaiting, in the proportions the card's caption spells out.
 *
 * A share of zero draws **nothing**: a hairline of colour for a state with no orders in it is a
 * lie at 6 dp, and the caption beside the bar already says the count is zero. When every share is
 * zero what is left is the bare track, which is the empty state §6 asks for.
 *
 * @param shares EVERY state's count with the colour it is drawn in, left to right — including a
 *   share drawn in the track's own colour (§2.4's awaiting), which is invisible but still holds
 *   its width: leave one out and the others silently grow to fill the bar. Counts, not
 *   percentages — the widths are taken as weights, so the caller passes what it already has.
 */
@Composable
fun StackedBar(shares: List<Pair<Int, Color>>, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().height(BarTrackHeight).clip(EtalonShapes.pill)
        .background(EtalonColors.lavenderBg),
) {
    shares.filter { (count, _) -> count > 0 }.forEach { (count, colour) ->
        Box(Modifier.weight(count.toFloat()).fillMaxHeight().background(colour))
    }
}
