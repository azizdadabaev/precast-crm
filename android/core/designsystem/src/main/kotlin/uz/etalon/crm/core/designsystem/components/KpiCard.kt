package uz.etalon.crm.core.designsystem.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money

/** The three tints §2 gives a KPI card. Not a status — the accent says which figure this is. */
enum class KpiAccent { RED, GREEN, INDIGO }

private fun KpiAccent.fg(): Color = when (this) {
    KpiAccent.RED -> EtalonColors.red
    KpiAccent.GREEN -> EtalonColors.green
    KpiAccent.INDIGO -> EtalonColors.indigo
}

private fun KpiAccent.bg(): Color = when (this) {
    KpiAccent.RED -> EtalonColors.redBg
    KpiAccent.GREEN -> EtalonColors.greenBg
    KpiAccent.INDIGO -> EtalonColors.lavenderBg
}

/** §2: 4 dp on top, 2 dp at the foot — the sparkline bar is not a plain rounded rectangle. */
private val BarShape = RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp, bottomStart = 2.dp, bottomEnd = 2.dp)

/**
 * §2 KpiCard — w210 × auto, white, `xl`, pad 14×16, as the Home hero row on `2b-home.png`.
 *
 * The width is fixed because the row scrolls horizontally: three cards of the same width are what
 * makes the second one peek at the right edge and read as "there is more here".
 *
 * @param value the figure, already formatted by `Formatters.kt` — this component never formats.
 * @param unit an optional quiet **prefix** ahead of the figure, 14/500 at 50 %. It is the «UZS» of
 *   a money card; an area card carries its «м²» inside [value] because that unit is a suffix.
 *   Money callers should use [KpiMoneyCard], which renders the prefix through [MoneyHeroText].
 * @param footnote the delta / context line, 11/600 in [footnotePositive]'s colour.
 * @param bars sparkline heights in 0..1, empty for no sparkline. Plain numbers, never money.
 * @param currentBar index of the bar the figure belongs to — indigo; the rest are lavender.
 */
@Composable
fun KpiCard(
    label: String,
    value: String,
    unit: String? = null,
    accent: KpiAccent,
    @DrawableRes icon: Int,
    footnote: String? = null,
    footnotePositive: Boolean? = null,
    bars: List<Float> = emptyList(),
    currentBar: Int = -1,
    modifier: Modifier = Modifier,
) = KpiCardFrame(label, accent, icon, footnote, footnotePositive, bars, currentBar, modifier) {
    // Same two runs and the same 6 dp gap as MoneyHeroText, so a unit-prefixed non-money card
    // lines up with a money one when the two sit side by side in the Home row.
    Row(verticalAlignment = Alignment.Bottom) {
        if (unit != null) {
            Text(unit, style = EtalonType.kpiUnit, color = EtalonColors.ink.copy(alpha = 0.5f))
        }
        Text(
            value,
            modifier = if (unit != null) Modifier.padding(start = 6.dp) else Modifier,
            style = EtalonType.kpi,
            color = EtalonColors.ink,
            maxLines = 1,
        )
    }
}

/** The money form: the figure goes through [MoneyHeroText], so the «UZS» prefix is the one run
 *  every other hero figure in the app already uses — see `2b-home.png`. */
@Composable
fun KpiMoneyCard(
    label: String,
    value: Money,
    accent: KpiAccent,
    @DrawableRes icon: Int,
    footnote: String? = null,
    footnotePositive: Boolean? = null,
    bars: List<Float> = emptyList(),
    currentBar: Int = -1,
    modifier: Modifier = Modifier,
) = KpiCardFrame(label, accent, icon, footnote, footnotePositive, bars, currentBar, modifier) {
    MoneyHeroText(value, style = EtalonType.kpi, color = EtalonColors.ink)
}

/** Everything but the figure. Both public forms share it so the two can never drift apart. */
@Composable
private fun KpiCardFrame(
    label: String,
    accent: KpiAccent,
    @DrawableRes icon: Int,
    footnote: String?,
    footnotePositive: Boolean?,
    bars: List<Float>,
    currentBar: Int,
    modifier: Modifier,
    value: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.width(210.dp).clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(label, style = EtalonType.label, color = EtalonColors.ink2, maxLines = 1)
        Box(Modifier.size(22.dp).clip(EtalonShapes.sm).background(accent.bg()), Alignment.Center) {
            EtalonIcon(icon, null, size = 12.dp, tint = accent.fg())
        }
    }
    Spacer(Modifier.height(8.dp))
    value()
    if (footnote != null) {
        Spacer(Modifier.height(4.dp))
        Text(
            footnote,
            style = EtalonType.meta.copy(fontWeight = FontWeight.W600),
            maxLines = 1,
            color = when (footnotePositive) {
                true -> EtalonColors.green
                false -> EtalonColors.red
                null -> EtalonColors.ink2
            },
        )
    }
    if (bars.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        // `fillMaxHeight(fraction)` inside a fixed-height row is what gives the bars their
        // proportions without a custom layout, and Alignment.Bottom is what makes them grow up.
        Row(Modifier.fillMaxWidth().height(44.dp), Arrangement.spacedBy(5.dp), Alignment.Bottom) {
            bars.forEachIndexed { i, h ->
                Box(
                    Modifier.weight(1f)
                        // A zero-height bar is invisible and reads as missing data rather than a
                        // quiet month, so every bar keeps a 4 dp floor.
                        .fillMaxHeight(h.coerceIn(0f, 1f).coerceAtLeast(0.09f))
                        .clip(BarShape)
                        .background(if (i == currentBar) EtalonColors.indigo else EtalonColors.lavender),
                )
            }
        }
    }
}
