package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

/**
 * The bar that carries a screen's next step. Lives in Scaffold's bottomBar slot
 * so it stays in the thumb zone while the content scrolls, and it sits above the
 * navigation-bar inset rather than under it.
 */
@Composable
fun StickyActionBar(content: @Composable RowScope.() -> Unit) {
    Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
        HorizontalDivider(color = LocalEtalonColors.current.border)
        Row(
            Modifier.fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}
