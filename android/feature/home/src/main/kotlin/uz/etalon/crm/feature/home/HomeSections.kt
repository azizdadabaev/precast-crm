package uz.etalon.crm.feature.home

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import uz.etalon.crm.core.designsystem.components.BarSparkline
import uz.etalon.crm.core.designsystem.components.DeltaBadge
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.SegmentBar
import uz.etalon.crm.core.designsystem.components.StackedBar
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.ui.format.UZ_MONTHS_SHORT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId

/** Design §2.3: a rail card is 228 dp wide, so the third one peeks past the right edge and the
 *  row reads as "there is more here" without a scrollbar. */
private val RAIL_CARD_WIDTH = 228.dp

/** §2.4's 2×2 gap. The 4-pt grid already names 10 dp — it is `EtalonSpace.rowGap` — so the grid
 *  reads the token rather than restating the number. */
private val GRID_GAP = EtalonSpace.rowGap

/**
 * The kickers over §2.2–§2.4: the scale's `labelSm`, opened up so a 11 sp all-caps line reads as a
 * label for the block under it rather than as a very small sentence. Letter spacing is the one
 * typographic value the scale does not carry (no other screen letter-spaces anything), so it is
 * named here, once, instead of at three call sites.
 */
private val KickerStyle = EtalonType.labelSm.copy(letterSpacing = 0.08.em)

/** §2's tag geometry — radius `xs`, pad 7×2 — which `StatusTag` owns for statuses. The hero's
 *  count badge and the discrepancy chip are not statuses, so they restate the two paddings here
 *  rather than reach into the design system's internals. */
private val TAG_PAD_H = 7.dp
private val TAG_PAD_V = 2.dp

/**
 * Every text slot on a rail card — the title and both caption lines — reserves exactly two lines,
 * whatever it holds.
 *
 * They do not all wrap: «142 та буюртма · ушбу ой» is one line and «Ҳисоб: буюртма қилинган ÷
 * буюртмалар сони» is two. Left to themselves the three cards would stand at three different
 * heights in one row, with their sparklines at three different depths — so the slots are fixed and
 * the cards match at any font scale, which a fixed card height could not promise.
 *
 * It is also what keeps the bilingual titles whole: «Буюртма қилинган · Booked» beside a delta
 * badge does not fit one 228 dp line, and cutting it to «· Bo…» would drop the half of the label
 * the brief adds the English for.
 */
private const val RAIL_LINES = 2

@Composable
internal fun SectionKicker(text: String, modifier: Modifier = Modifier) = Text(
    text,
    style = KickerStyle,
    color = EtalonColors.ink2,
    modifier = modifier.padding(horizontal = EtalonSpace.headerMargin),
)

// ── §2.2 the receivables hero ────────────────────────────────────────────────────────────────

/**
 * The navy sheet the screen opens on: what is owed right now, the count of orders it is spread
 * across, and how those orders stand.
 *
 * It carries `NavySheet`'s treatment — navy, radius `sheet` — but not the component itself: that
 * component's header is a title row, and §2.2's is a muted kicker beside a red count badge with a
 * 30/800 amount under it.
 *
 * The amount goes through [MoneyHeroText], whose own layout gives the figure its width first and
 * the «UZS» whatever is left (§6: a figure past 1 000 000 000 UZS must not wrap or clip).
 */
@Composable
internal fun ReceivablesHero(d: HomeDashboard, modifier: Modifier = Modifier) = Column(
    modifier
        .fillMaxWidth()
        .padding(horizontal = EtalonSpace.cardMargin)
        .clip(EtalonShapes.sheet)
        .background(EtalonColors.navy)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(
            stringResource(R.string.home_kicker_receivables),
            style = KickerStyle,
            color = EtalonColors.onDarkMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        HeroBadge(stringResource(R.string.home_orders_badge, formatCountBare(d.receivableOrders)))
    }
    Spacer(Modifier.height(EtalonSpace.sm))
    MoneyHeroText(d.receivables, style = EtalonType.amountLg, onDark = true)
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        stringResource(R.string.home_receivables_note),
        style = EtalonType.labelSm,
        color = EtalonColors.onDarkMuted,
    )
    Spacer(Modifier.height(EtalonSpace.md))
    Row(
        Modifier.fillMaxWidth().clip(EtalonShapes.lg).background(EtalonColors.navy2)
            .padding(vertical = EtalonSpace.rowPadV),
    ) {
        // §5's hero palette, not §2.2's bare colour names: `paidOnDark`/`debtOnDark` are what the
        // green and the red become on navy, and the amber partial is legible on it unchanged.
        HeroCell(R.string.home_paid, d.paidOrders, EtalonColors.paidOnDark, Modifier.weight(1f))
        HeroCell(R.string.home_partial, d.partialOrders, EtalonColors.warning, Modifier.weight(1f))
        HeroCell(R.string.home_awaiting, d.awaitingOrders, EtalonColors.debtOnDark, Modifier.weight(1f))
    }
}

/** «6 буюртма» — the tag treatment `StatusTag` draws a red status in on navy: the navy2 ground
 *  and [EtalonColors.debtOnDark], never the light `redBg` chip a white card would carry. */
@Composable
private fun HeroBadge(text: String) = Text(
    text,
    style = EtalonType.tag,
    color = EtalonColors.debtOnDark,
    maxLines = 1,
    modifier = Modifier.padding(start = EtalonSpace.sm)
        .clip(EtalonShapes.xs).background(EtalonColors.navy2)
        .padding(horizontal = TAG_PAD_H, vertical = TAG_PAD_V),
)

@Composable
private fun HeroCell(@StringRes label: Int, count: Int, colour: Color, modifier: Modifier) = Column(
    modifier,
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    Text(formatCountBare(count), style = EtalonType.titleSm, color = colour, maxLines = 1)
    Text(
        stringResource(label),
        style = EtalonType.tag,
        color = EtalonColors.onDarkMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

// ── §2.3 the financial rail ──────────────────────────────────────────────────────────────────

/**
 * Booked, collected and the average order value for the current month — one card each, scrolling
 * horizontally. The kicker over them names the period (ruling R1: no Ой | Ҳафта pill, because the
 * payload is monthly and a pill with one option is noise).
 *
 * A `LazyRow` rather than the phase-1 row's `horizontalScroll`: these three cards are a fixed
 * width and none of them needs to measure against another, so nothing is lost by virtualising —
 * and the 16 dp edge inset belongs in `contentPadding`, where the first card's left edge and the
 * last card's right edge both get it without the spacing between them changing.
 */
@Composable
internal fun FinancialRail(d: HomeDashboard, modifier: Modifier = Modifier) = LazyRow(
    modifier.fillMaxWidth(),
    contentPadding = PaddingValues(horizontal = EtalonSpace.cardMargin),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
) {
    item {
        RailCard(
            label = stringResource(R.string.home_booked),
            value = d.booked.total,
            trend = d.booked.trend,
            series = d.bookedSeries,
            line1 = stringResource(R.string.home_this_month_orders, formatCountBare(d.booked.count)),
            line2 = stringResource(
                R.string.home_all_time,
                formatMoney(d.bookedAllTime.total),
                formatCountBare(d.bookedAllTime.count),
            ),
        )
    }
    item {
        RailCard(
            label = stringResource(R.string.home_collected),
            value = d.collected.total,
            trend = d.collected.trend,
            series = d.collectedSeries,
            line1 = stringResource(R.string.home_this_month_payments, formatCountBare(d.collected.count)),
            line2 = stringResource(
                R.string.home_all_time,
                formatMoney(d.collectedAllTime.total),
                formatCountBare(d.collectedAllTime.count),
            ),
        )
    }
    item {
        RailCard(
            label = stringResource(R.string.home_aov),
            value = d.aov.thisMonth,
            trend = d.aov.trend,
            series = d.aovSeries,
            // The AOV is the one figure on this screen the phone computes, so the card says how —
            // the web prints the same line under the same number.
            line1 = stringResource(R.string.home_aov_formula),
            line2 = stringResource(R.string.home_all_time_aov, formatMoney(d.aov.allTime)),
        )
    }
}

@Composable
private fun RailCard(
    label: String,
    value: Money,
    trend: Trend?,
    series: List<BigDecimal>,
    line1: String,
    line2: String,
) = Column(
    Modifier.width(RAIL_CARD_WIDTH)
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    // Top, not centre: the badge belongs beside the first line of a title that may take two.
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
        Text(
            label,
            style = EtalonType.label,
            color = EtalonColors.ink2,
            minLines = RAIL_LINES,
            maxLines = RAIL_LINES,
            overflow = TextOverflow.Ellipsis,
            // `fill = false` so the label takes only what it needs: the badge is measured after it
            // and must never be the thing that gets squeezed out of the row.
            modifier = Modifier.weight(1f, fill = false),
        )
        DeltaBadge(trend, Modifier.padding(start = EtalonSpace.sm))
    }
    Spacer(Modifier.height(EtalonSpace.sm))
    MoneyHeroText(value, style = EtalonType.headline)
    Spacer(Modifier.height(EtalonSpace.xs))
    CaptionLine(line1, EtalonColors.ink2)
    CaptionLine(line2, EtalonColors.ink3)
    Spacer(Modifier.height(EtalonSpace.md))
    BarSparkline(series)
}

@Composable
private fun CaptionLine(text: String, colour: Color) = Text(
    text,
    style = EtalonType.labelSm,
    color = colour,
    minLines = RAIL_LINES,
    maxLines = RAIL_LINES,
    overflow = TextOverflow.Ellipsis,
)

// ── §2.4 the operational grid ────────────────────────────────────────────────────────────────

/**
 * Four cards, two by two: who is buying, what leaves the yard today, what is disputed, and what
 * was made this month. Two of them are doors — clients and today's calendar day (§4) — and both
 * are whole cards, so the hit target is the card and not a word in it.
 *
 * Each row is measured at [IntrinsicSize.Min] and its two cards fill that height, so a card whose
 * caption wraps to a second line does not leave the one beside it standing short.
 */
@Composable
internal fun OperationalGrid(
    s: HomeUiState,
    d: HomeDashboard,
    now: Instant,
    onOpenClients: () -> Unit,
    onOpenCalendarToday: () -> Unit,
    modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin),
    verticalArrangement = Arrangement.spacedBy(GRID_GAP),
) {
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(GRID_GAP),
    ) {
        ActiveClientsCard(d, onOpenClients, Modifier.weight(1f).fillMaxHeight())
        TodayCard(s, d, onOpenCalendarToday, Modifier.weight(1f).fillMaxHeight())
    }
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(GRID_GAP),
    ) {
        DiscrepanciesCard(d, Modifier.weight(1f).fillMaxHeight())
        LoadedVolumeCard(d, now, Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun ActiveClientsCard(d: HomeDashboard, onOpen: () -> Unit, modifier: Modifier) {
    val label = stringResource(R.string.home_active_clients)
    GridCard(label, modifier, onClick = onOpen) {
        Figure(formatCountBare(d.activeCustomers))
        Spacer(Modifier.height(EtalonSpace.sm))
        // Every share, awaiting included — it is drawn in the track's own colour, but a share left
        // out would silently widen the two that are drawn.
        StackedBar(
            listOf(
                d.paidOrders to EtalonColors.green,
                d.partialOrders to EtalonColors.warning,
                d.awaitingOrders to EtalonColors.lavenderBg,
            ),
        )
        Spacer(Modifier.height(EtalonSpace.sm))
        GridCaption(
            stringResource(
                R.string.home_active_caption,
                formatCountBare(d.paidOrders),
                formatCountBare(d.partialOrders),
                formatCountBare(d.awaitingOrders),
            ),
        )
    }
}

@Composable
private fun TodayCard(s: HomeUiState, d: HomeDashboard, onOpen: () -> Unit, modifier: Modifier) {
    val label = stringResource(R.string.home_today_deliveries)
    GridCard(label, modifier, onClick = onOpen) {
        Figure(formatCountBare(s.today.size))
        Spacer(Modifier.height(EtalonSpace.sm))
        SegmentBar(filled = s.todayDone, total = s.today.size)
        Spacer(Modifier.height(EtalonSpace.sm))
        // The string carries its own «м²», so the figure is formatted without one.
        GridCaption(stringResource(R.string.home_today_planned, formatDecimal(d.todayArea, 2)))
    }
}

@Composable
private fun DiscrepanciesCard(d: HomeDashboard, modifier: Modifier) {
    val clear = d.openDiscrepancies == 0
    GridCard(stringResource(R.string.home_discrepancies), modifier) {
        Figure(formatCountBare(d.openDiscrepancies))
        Spacer(Modifier.height(EtalonSpace.sm))
        Chip(
            text = stringResource(if (clear) R.string.home_under_control else R.string.home_attention),
            bg = if (clear) EtalonColors.greenBg else EtalonColors.redBg,
            fg = if (clear) EtalonColors.green else EtalonColors.red,
        )
        Spacer(Modifier.height(EtalonSpace.sm))
        GridCaption(stringResource(R.string.home_discrepancy_sum, formatMoney(d.openDiscrepancyTotal)))
    }
}

@Composable
private fun LoadedVolumeCard(d: HomeDashboard, now: Instant, modifier: Modifier) {
    val loaded = d.loadedThisMonth
    GridCard(stringResource(R.string.home_loaded, shortMonth(d.currentMonthKey, now)), modifier) {
        if (loaded == null) {
            // §6's empty month. The figures are not zeroed — nothing was loaded, which is a
            // different fact from "0 blocks were loaded" and reads differently under the bar.
            GridCaption(stringResource(R.string.home_loaded_none))
        } else {
            LoadedFigures(loaded)
        }
    }
}

@Composable
private fun LoadedFigures(loaded: LoadedVolume) {
    Row(verticalAlignment = Alignment.Bottom) {
        Figure(formatCountBare(loaded.blocks))
        Text(
            stringResource(R.string.home_loaded_blocks_unit),
            style = EtalonType.kpiUnit,
            color = EtalonColors.ink2,
            maxLines = 1,
            modifier = Modifier.padding(start = EtalonSpace.xs),
        )
    }
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        stringResource(R.string.home_loaded_beams, formatDecimal(loaded.beamMeters, 1)) +
            " · " + formatArea(loaded.area),
        style = EtalonType.labelSm,
        color = EtalonColors.ink2,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(EtalonSpace.xs))
    GridCaption(
        stringResource(
            R.string.home_loaded_caption,
            formatCountBare(loaded.orderCount),
            formatCountBare(loaded.beamCount),
        ),
    )
}

/**
 * The white 2×2 tile: label, then whatever the card counts.
 *
 * [onClick] makes the WHOLE card the target rather than a word inside it — `heightIn` states the
 * 48 dp floor even though every one of these cards is far taller, so the rule survives a card
 * that later loses a line.
 */
@Composable
private fun GridCard(
    label: String,
    modifier: Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier
        .heightIn(min = EtalonSpace.minTouch)
        .clip(EtalonShapes.xl)
        .background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .then(
            if (onClick == null) Modifier
            else Modifier.clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        )
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Text(
        label,
        style = EtalonType.label,
        color = EtalonColors.ink2,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(EtalonSpace.sm))
    content()
}

/** §5's `kpi` 24/700 — the one figure a grid card is about. */
@Composable
private fun Figure(text: String) = Text(
    text,
    style = EtalonType.kpi,
    color = EtalonColors.ink,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
)

@Composable
private fun GridCaption(text: String) = Text(
    text,
    style = EtalonType.caption,
    color = EtalonColors.ink3,
    maxLines = 3,
    overflow = TextOverflow.Ellipsis,
)

/** «Назоратда» / «Диққат» — the tag treatment a white card carries, in the green or red pair. */
@Composable
private fun Chip(text: String, bg: Color, fg: Color) = Text(
    text,
    style = EtalonType.tag,
    color = fg,
    maxLines = 1,
    modifier = Modifier.clip(EtalonShapes.xs).background(bg)
        .padding(horizontal = TAG_PAD_H, vertical = TAG_PAD_V),
)

/**
 * «сен» from the server's own `"2026-09"`.
 *
 * The key is the month the whole payload is about, so it is what the loaded card names. When it
 * is absent — a server older than this client's contract sends no `monthKeys`, and the mapper
 * then leaves it empty — the card falls back to the month [now] is in, which is the same month by
 * definition and is the only other thing on this screen that knows what today is. It never
 * guesses a figure: a payload with no month key also has no loaded row, so the card under this
 * label reads «Бу ой юк йўқ».
 */
private fun shortMonth(monthKey: String, now: Instant): String {
    val fromKey = monthKey.substringAfter('-', "").toIntOrNull()?.takeIf { it in 1..UZ_MONTHS_SHORT.size }
    val month = fromKey ?: now.atZone(ZoneId.systemDefault()).monthValue
    return UZ_MONTHS_SHORT[month - 1]
}

// ── §2.8 the withheld permission ─────────────────────────────────────────────────────────────

/**
 * What stands in for §2.2–§2.7 when the operator holds neither `dashboard.viewBasic` nor
 * `dashboard.view`: the web's own line, and nothing else. No retry — a permission is not a failed
 * request — and no empty figures, which would read as "the business did nothing this month".
 */
@Composable
internal fun NoAccessCard(modifier: Modifier = Modifier) = Column(
    modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Text(stringResource(R.string.home_no_access_dashboard), style = EtalonType.body, color = EtalonColors.ink2)
}
