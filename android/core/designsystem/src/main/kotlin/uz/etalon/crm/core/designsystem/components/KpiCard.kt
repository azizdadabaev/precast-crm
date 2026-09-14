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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
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

/**
 * §2 KpiCard — w210 × auto, white, `xl`, pad 14×16, as the Home hero row on `2b-home.png`.
 *
 * The width is a **minimum**, not a fixed size: the row scrolls horizontally, and three cards of
 * the same 210 dp are what make the second one peek at the right edge and read as "there is more
 * here". A card only exceeds it when its own figure would not otherwise fit (§5, font scale 130 %
 * with a nine-digit amount) — losing the shared edge is the lesser harm against a cut number.
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
            // Same rule as `MoneyText`: a figure that does not fit must be *visibly* cut. Clipped,
            // «78,70 м²» becomes «78,7» and reads as a smaller number rather than a truncated one.
            overflow = TextOverflow.Ellipsis,
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
    // 210 dp is a floor, not a fixed width: §5 asks that a nine-digit amount survive font scale
    // 130 %, where the figure needs about 185 dp of the 178 dp a 210 dp card has left inside its
    // padding. Fixed, the number would ellipsize; this way the card grows and the row scrolls.
    //
    // `width(IntrinsicSize.Max)` is what makes "grows" mean *to its content* rather than to the
    // whole screen: the header and sparkline rows inside carry `fillMaxWidth`, so without the
    // intrinsic pass a card with no upper bound simply took every pixel its parent offered and the
    // two cards beside it fell off the edge. Max, not Min: every text in this card is `maxLines =
    // 1`, so the width that renders it correctly is its whole one-line width — `Min` is a word's
    // worth narrower, and that last few pixels is a whole glyph off the «UZS». `widthIn` sits
    // outside it, so the result is never under 210.
    modifier.widthIn(min = 210.dp).width(IntrinsicSize.Max)
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(label, style = EtalonType.label, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            style = EtalonType.labelSm,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = when (footnotePositive) {
                true -> EtalonColors.green
                false -> EtalonColors.red
                null -> EtalonColors.ink2
            },
        )
    }
    if (bars.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        // The same drawing the dashboard rail's `BarSparkline` uses — one copy of the track, the
        // gap and the bar shape for the whole app. This card differs only in what it is handed
        // (heights, already computed) and in its floor, which is [KPI_BAR_FLOOR]'s 9 % rather than
        // §2.3's 2 dp stub.
        SparklineBars(fractions = bars, accentIndex = currentBar, floorFraction = KPI_BAR_FLOOR)
    }
}
