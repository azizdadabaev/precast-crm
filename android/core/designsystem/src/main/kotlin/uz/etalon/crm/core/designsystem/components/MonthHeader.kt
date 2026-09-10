package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money

/**
 * §2 MonthHeader — the divider between two months of rows: label left, the month's sum right,
 * both 10.5/600 in the muted ink of whichever ground they sit on. Pad 12 top / 10 bottom / 6 sides.
 *
 * @param total the month's sum; omitted (`null`) where the group has no meaningful total.
 * @param onDark the header sits inside a navy sheet, which is where the prototype puts it
 *   (`2b-orders.png`); pass `false` for a month divider on a white card.
 */
@Composable
fun MonthHeader(label: String, total: Money?, onDark: Boolean = true, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().padding(start = 6.dp, end = 6.dp, top = 12.dp, bottom = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
) {
    val color = if (onDark) EtalonColors.onDarkMuted else EtalonColors.ink3
    Text(label, style = EtalonType.tagPanel, color = color)
    if (total != null) MoneyText(total, style = EtalonType.tagPanel, color = color)
}
