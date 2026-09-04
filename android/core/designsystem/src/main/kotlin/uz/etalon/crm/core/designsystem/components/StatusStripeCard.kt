package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

/** Card with the web's 3 px status stripe on the left edge. */
@Composable
fun StatusStripeCard(stripe: Color, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.large
    val base = modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surface).border(1.dp, ext.border, shape)
    val clickable = if (onClick != null) base.then(Modifier.clickable(onClick = onClick)) else base
    Row(clickable.height(IntrinsicSize.Min)) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(stripe))
        Column(Modifier.weight(1f).padding(horizontal = 14.dp, vertical = 12.dp), content = content)
    }
}
