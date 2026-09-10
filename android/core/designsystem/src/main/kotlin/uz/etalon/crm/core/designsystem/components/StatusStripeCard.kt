package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.etalonRipple

/**
 * §2's white `xl` card with the system's hairline, plus the 3 dp status stripe on its left edge.
 *
 * The stripe survives the restyle where the web's other borders did not: on the payments queue
 * and the discrepancies list it is a real signal, read down a column of otherwise identical
 * cards. [stripe] comes from [toneColor], which is now an [EtalonColors] lookup.
 */
@Composable
fun StatusStripeCard(stripe: Color, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val base = modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
    val clickable = if (onClick != null) {
        base.then(
            Modifier.clickable(
                role = Role.Button,
                indication = etalonRipple(),
                interactionSource = remember { MutableInteractionSource() },
                onClick = onClick,
            ),
        )
    } else {
        base
    }
    Row(clickable.height(IntrinsicSize.Min)) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(stripe))
        Column(Modifier.weight(1f).padding(horizontal = 14.dp, vertical = 12.dp), content = content)
    }
}
