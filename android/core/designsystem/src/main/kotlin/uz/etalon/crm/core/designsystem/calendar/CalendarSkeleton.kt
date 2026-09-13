package uz.etalon.crm.core.designsystem.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes

/**
 * The first load of a month (design §4.3): the grid's exact geometry in `page`-coloured blocks,
 * no text. Six rows, always, for the same reason the real grid draws six — the card must not
 * change height when the figures arrive.
 *
 * Deliberately not animated. A shimmer on 42 blocks is 42 more things redrawing every frame on
 * the phones this CRM actually runs on, and the fetch it covers is usually under 300 ms.
 */
@Composable
internal fun CalendarSkeleton(modifier: Modifier = Modifier) = Column(
    modifier.fillMaxWidth(),
    verticalArrangement = Arrangement.spacedBy(CELL_GAP),
) {
    repeat(GRID_ROWS) {
        Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(CELL_GAP)) {
            repeat(GRID_COLS) {
                Box(
                    Modifier.weight(1f).height(CELL_H).clip(EtalonShapes.md)
                        .background(EtalonColors.page),
                )
            }
        }
    }
}
