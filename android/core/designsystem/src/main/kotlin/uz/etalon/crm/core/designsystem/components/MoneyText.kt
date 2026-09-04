package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

@Composable
fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurface) =
    Text(formatMoney(money), modifier = modifier, style = style, color = color, maxLines = 1)

@Composable
fun AreaText(m2: BigDecimal, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) =
    Text(formatArea(m2), modifier = modifier, style = style, color = color, maxLines = 1)

@Composable
fun CountText(n: Int, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) =
    Text(formatCount(n), modifier = modifier, style = style, color = color, maxLines = 1)
