package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatMoneyHero
import java.math.BigDecimal

/**
 * A figure in a row or a total: grouped digits, no unit (D8).
 *
 * Every figure in this file ellipsizes rather than clipping. A clipped number is the one failure
 * mode nobody notices: at font scale 1.3 a nine-digit total in a narrow column loses its last
 * three digits silently and reads as a sum a thousand times smaller. The ellipsis is what makes a
 * cut figure visibly cut — see `MoneyOverflowTest.nineDigitMoneyEllipsizesInAConstrainedColumn`.
 */
@Composable
fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.rowAmount, color: Color = EtalonColors.ink) =
    Text(formatMoney(money), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)

/** The air between the «UZS» and the figure, §2's own 6 dp. */
private val HERO_GAP = 6.dp

/**
 * A KPI or confirm-sheet figure: «UZS» at 14/500 and half opacity, then the number. Two runs, not
 * one string, because the prefix has to be visually quiet — see `2b-home.png` and `3a-calculator.png`.
 *
 * Two `Text` nodes would be two announcements, so the whole figure is published once as a content
 * description and merged: TalkBack reads «UZS 53 268 760», not «UZS» and then a bare number.
 *
 * It is a hand-written `Layout` rather than a `Row` because the **measurement order matters and a
 * `Row` cannot express it**. Under compression the prefix must give way, not the number — every
 * figure on these screens is UZS, and a number that loses its tail is the failure this whole file
 * exists to prevent. A `Row` measures its unweighted children first, so «UZS» would always take
 * its width off the top; and giving either run a weight makes the row fill its parent, which
 * silently stretched a 210 dp `KpiCard` across the whole screen. So: the figure is measured first
 * with everything there is, the prefix takes what is left (nothing, at worst), and the layout is
 * exactly as wide as the two together — it still hugs.
 */
@Composable
fun MoneyHeroText(
    money: Money,
    modifier: Modifier = Modifier,
    style: TextStyle = EtalonType.kpi,
    color: Color = EtalonColors.ink,
    onDark: Boolean = false,
) {
    val spoken = formatMoneyHero(money)
    Layout(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
        content = {
            Text(
                MONEY_UNIT,
                style = EtalonType.kpiUnit,
                color = (if (onDark) EtalonColors.onDark else color).copy(alpha = 0.5f),
                maxLines = 1,
            )
            Text(
                formatMoney(money),
                style = style,
                color = if (onDark) EtalonColors.onDark else color,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
    ) { measurables, constraints ->
        val gap = HERO_GAP.roundToPx()
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val figure = measurables[1].measure(loose)
        val prefixMax = if (constraints.maxWidth == Constraints.Infinity) {
            Constraints.Infinity
        } else {
            (constraints.maxWidth - figure.width - gap).coerceAtLeast(0)
        }
        val prefix = measurables[0].measure(loose.copy(maxWidth = prefixMax))
        // A prefix squeezed to nothing takes its 6 dp of air with it.
        val lead = if (prefix.width > 0) prefix.width + gap else 0
        val width = (lead + figure.width).coerceIn(constraints.minWidth, constraints.maxWidth)
        val height = maxOf(prefix.height, figure.height).coerceIn(constraints.minHeight, constraints.maxHeight)
        layout(width, height) {
            // Bottom-aligned: the small prefix sits on the figure's baseline-ish foot, as §2 draws it.
            prefix.place(0, height - prefix.height)
            figure.place(lead, height - figure.height)
        }
    }
}

@Composable
fun AreaText(m2: BigDecimal, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatArea(m2), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
fun CountText(n: Int, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatCount(n), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
