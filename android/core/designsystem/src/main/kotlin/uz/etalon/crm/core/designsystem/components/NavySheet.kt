package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * The navy list surface from `2b-orders.png` and Home's «Бугунги етказиш» card.
 *
 * The header is "sticky" in §2's sense: it is the sheet's first child and the *rows* move under
 * it, which a screen arranges by putting its own `LazyColumn` in [content]. Nothing scrolls here —
 * a component that owns a scroll container cannot be composed into one.
 *
 * @param fillsToBottom true for a list that runs off the bottom of the screen — 22 dp top corners
 *   only (§1.3); false for a card floating in the page, which rounds all four.
 * @param trailing the header's right-hand slot: §3.2's SegmentedControl, Home's count pill.
 */
@Composable
fun NavySheet(
    title: String,
    modifier: Modifier = Modifier,
    trailing: @Composable (RowScope.() -> Unit)? = null,
    fillsToBottom: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier
        .fillMaxWidth()
        .clip(if (fillsToBottom) EtalonShapes.sheetTop else EtalonShapes.sheet)
        .background(EtalonColors.navy)
        .padding(horizontal = 10.dp)
        .padding(top = 14.dp, bottom = 10.dp),
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp),
        Arrangement.SpaceBetween,
        Alignment.CenterVertically,
    ) {
        Text(title, style = EtalonType.sectionTitle, color = EtalonColors.onDark)
        if (trailing != null) Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
    Spacer(Modifier.height(8.dp))
    content()
}
