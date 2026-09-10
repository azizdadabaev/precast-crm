package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors

/** How much of the scrolling content the scrim fades out above the bar. */
private val SCRIM_HEIGHT = 16.dp

/**
 * The bar that carries a screen's next step. Lives in Scaffold's bottomBar slot so it stays in
 * the thumb zone while the content scrolls, and it sits above the navigation-bar inset rather
 * than under it.
 *
 * §2 replaces the old hairline rule with a scrim: the page colour fading up from the bar, so a
 * row scrolling underneath dissolves instead of being cut by a line. The bar itself is the page,
 * not a white card — the button is the only object here.
 */
@Composable
fun StickyActionBar(content: @Composable RowScope.() -> Unit) {
    Column {
        Box(
            Modifier.fillMaxWidth().height(SCRIM_HEIGHT).background(
                Brush.verticalGradient(listOf(EtalonColors.page.copy(alpha = 0f), EtalonColors.page)),
            ),
        )
        Row(
            Modifier.fillMaxWidth()
                .background(EtalonColors.page)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            content = content,
        )
    }
}
