package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import kotlin.math.roundToInt

/** §2.4's bars — the segmented one and the stacked one — are 6 dp tall, and share this. */
internal val BarTrackHeight = 6.dp

/** The space between two segments of [SegmentBar]. The stacked bar has none: it is one bar. */
private val SegmentGap = 4.dp

/**
 * How many of [segments] a progress of `filled / total` lights. Two ends the spec names, and one
 * rule between them:
 *
 *  - nothing to do, or nothing done → **no** segment. §2.4: «all seven filled when count = 0 reads
 *    as empty, not full», which is what a naive `filled >= total` would draw for 0 of 0.
 *  - everything done → every segment.
 *  - in between, the nearest segment, but never 0 and never all of them: one truck out of forty is
 *    a day that has started, and thirty-nine of forty is a day that has not finished. A bar that
 *    reads "done" while an order is still in the yard is the one mistake this bar can make.
 */
internal fun segmentBarFilled(filled: Int, total: Int, segments: Int): Int = when {
    segments <= 0 || total <= 0 || filled <= 0 -> 0
    filled >= total -> segments
    else -> ((filled.toFloat() / total) * segments).roundToInt().coerceIn(1, segments - 1)
}

/**
 * §2.4's «Бугунги етказишлар» bar: [segments] slots, the done share in indigo and the rest in the
 * lavender track. A count, not a percentage — the caption under it carries the numbers, and this
 * says at a glance how much of the day is behind the yard.
 */
@Composable
fun SegmentBar(filled: Int, total: Int, segments: Int = 7, modifier: Modifier = Modifier) {
    val lit = segmentBarFilled(filled, total, segments)
    Row(
        modifier.fillMaxWidth().height(BarTrackHeight),
        horizontalArrangement = Arrangement.spacedBy(SegmentGap),
    ) {
        repeat(segments) { i ->
            Box(
                Modifier.weight(1f).fillMaxHeight().clip(EtalonShapes.xs)
                    .background(if (i < lit) EtalonColors.indigo else EtalonColors.lavenderBg),
            )
        }
    }
}
