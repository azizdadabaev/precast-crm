package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

/**
 * A figure in a row or a total: grouped digits, no unit (D8).
 *
 * Every figure in this file ellipsizes rather than clipping. A clipped number is the one failure
 * mode nobody notices: at font scale 1.3 a nine-digit total in a narrow column loses its last
 * three digits silently and reads as a sum a thousand times smaller. The ellipsis is what makes a
 * cut figure visibly cut — see `FormattersTest.ninedigitAmountEllipsizesAtLargeFontScale`.
 */
@Composable
fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.rowAmount, color: Color = EtalonColors.ink) =
    Text(formatMoney(money), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)

/**
 * A KPI or confirm-sheet figure: «UZS» at 14/500 and half opacity, then the number. Two runs, not
 * one string, because the prefix has to be visually quiet — see `2b-home.png` and `3a-calculator.png`.
 */
@Composable
fun MoneyHeroText(
    money: Money,
    modifier: Modifier = Modifier,
    style: TextStyle = EtalonType.kpi,
    color: Color = EtalonColors.ink,
    onDark: Boolean = false,
) = Row(modifier, verticalAlignment = Alignment.Bottom) {
    Text(
        MONEY_UNIT,
        style = EtalonType.kpiUnit,
        color = (if (onDark) EtalonColors.onDark else color).copy(alpha = 0.5f),
    )
    Text(
        formatMoney(money),
        modifier = Modifier.padding(start = 6.dp),
        style = style,
        color = if (onDark) EtalonColors.onDark else color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun AreaText(m2: BigDecimal, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatArea(m2), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
fun CountText(n: Int, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatCount(n), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
