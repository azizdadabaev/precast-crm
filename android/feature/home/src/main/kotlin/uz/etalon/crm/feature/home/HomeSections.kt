package uz.etalon.crm.feature.home

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.BarSparkline
import uz.etalon.crm.core.designsystem.components.DeltaBadge
import uz.etalon.crm.core.designsystem.components.Donut
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.MonthColumns
import uz.etalon.crm.core.designsystem.components.PaymentStateTag
import uz.etalon.crm.core.designsystem.components.SegmentBar
import uz.etalon.crm.core.designsystem.components.StackedBar
import uz.etalon.crm.core.designsystem.components.Tag
import uz.etalon.crm.core.designsystem.components.donutPercent
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.RegionOrders
import uz.etalon.crm.core.model.TopCustomer
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.core.ui.format.UZ_MONTHS_FULL
import uz.etalon.crm.core.ui.format.UZ_MONTHS_SHORT
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatPercent
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

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

/** The rail's three cards and the grid's two-by-two, named so the skeleton can lay out the same
 *  shape without restating the numbers. */
private const val RAIL_CARDS = 3
private const val GRID_ROWS = 2
private const val GRID_COLUMNS = 2

/** §2.5–§2.7 plus §2.6b: the donut, the top clients, the province ranking and the latest orders. */
private const val BOTTOM_CARDS = 4

/** §2.5's legend bullet — small enough to read as a key to the ring rather than as a control. */
private val LEGEND_DOT = 8.dp

/** §2.6 / §2.7 row furniture: the 32 dp circle (smaller than a list row's 36, because these rows
 *  sit inside a card that already has its own margins) and the 4 dp progress rail under a name. */
private val ROW_AVATAR = 32.dp
private val SHARE_BAR_HEIGHT = 4.dp

/** Enough places for a bar to be visibly shorter than the one above it at 390 dp: at three
 *  decimals one pixel of a 200 dp bar is still 0,005 of the whole. */
private const val SHARE_SCALE = 3

/** The « · » the meta lines are joined by, the same separator [formatAddressLine] uses inside an
 *  address. */
private const val SEPARATOR = " · "

/** §3's skeleton blocks, mirroring `DashboardSkeleton.tsx` at phone scale: its 340 hero, its 14 dp
 *  section kickers, its 160 KPI tiles and its 380 bottom widgets, re-proportioned for a 390 dp
 *  column rather than a 1320 px page. */
private val SKELETON_HERO = 190.dp
private val SKELETON_KICKER = 12.dp
private val SKELETON_KICKER_WIDTH = 140.dp
private val SKELETON_RAIL = 168.dp
private val SKELETON_TILE = 118.dp
private val SKELETON_CARD = 164.dp

/** §2.3b's chart block — a kicker, a sub-line, twelve columns and a legend. */
private val SKELETON_CHART = 150.dp

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

/** «6 буюртма» — the design system's own tag in the pair `StatusTag` draws a red status in on
 *  navy: the navy2 ground and [EtalonColors.debtOnDark], never the light `redBg` chip a white card
 *  would carry. The 8 dp of air is outside the tag, so it is a margin and not padding. */
@Composable
private fun HeroBadge(text: String) = Tag(
    text = text,
    fg = EtalonColors.debtOnDark,
    bg = EtalonColors.navy2,
    modifier = Modifier.padding(start = EtalonSpace.sm),
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
internal fun FinancialRail(d: HomeDashboard, now: Instant, modifier: Modifier = Modifier) = LazyRow(
    modifier.fillMaxWidth(),
    contentPadding = PaddingValues(horizontal = EtalonSpace.cardMargin),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
) {
    // §2.3b's `scopeLabel`: «ушбу ой» while the current month is picked, «{ой} ойи» otherwise.
    val month = shortMonth(d.monthKey, now)
    item {
        RailCard(
            label = stringResource(R.string.home_booked),
            value = d.booked.total,
            trend = d.booked.trend,
            series = d.bookedSeries,
            line1 = if (d.isCurrentMonth) {
                stringResource(R.string.home_this_month_orders, formatCountBare(d.booked.count))
            } else {
                stringResource(R.string.home_scope_month_orders, formatCountBare(d.booked.count), month)
            },
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
            line1 = if (d.isCurrentMonth) {
                stringResource(R.string.home_this_month_payments, formatCountBare(d.collected.count))
            } else {
                stringResource(R.string.home_scope_month_payments, formatCountBare(d.collected.count), month)
            },
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

// ── §2.3b the twelve-month chart, which is the month picker ──────────────────────────────────

/**
 * The year in twelve pairs of bars — what was sold each month and what came in — and the control
 * that scopes the rail above it.
 *
 * Tapping a column selects that month: the rail's three cards, their sparklines and the
 * «Юкланган ҳажм» tile all re-read the series at that index, and the kicker and captions name the
 * month instead of saying «ушбу ой». Tapping the selected column again returns to the current
 * month, so the chart is its own way back. The receivables hero does NOT move — it is a
 * point-in-time balance and there is no historical snapshot of it to show.
 *
 * The sub-line is the web's own (`HeroChart.tsx:169-182`): the whole year's order count while the
 * current month is picked, that one month's count otherwise.
 */
@Composable
internal fun MonthlyChartCard(
    d: HomeDashboard,
    onSelectMonth: (Int) -> Unit,
    modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Text(
        stringResource(R.string.home_kicker_months),
        style = KickerStyle,
        color = EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        if (d.isCurrentMonth) {
            stringResource(R.string.home_months_sub_current, formatCountBare(d.yearOrders))
        } else {
            stringResource(
                R.string.home_months_sub_selected,
                columnLabel(d.monthKey),
                formatCountBare(d.monthOrders),
            )
        },
        style = EtalonType.labelSm,
        color = EtalonColors.ink3,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(EtalonSpace.md))
    MonthColumns(
        booked = d.chartBooked,
        collected = d.chartCollected,
        labels = d.chartMonthKeys.map { columnLabel(it) },
        selected = d.selectedMonthIdx,
        current = d.currentMonthIdx,
        onSelect = onSelectMonth,
    )
    Spacer(Modifier.height(EtalonSpace.md))
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Ruling R13: the key is drawn in the SELECTED pair — `indigo` and `green` — because the
        // unselected bars are the same two hues muted, and a legend in the muted pair would key
        // the chart to colours nothing on it is actually drawn in at full strength.
        LegendKey(stringResource(R.string.home_legend_booked), EtalonColors.indigo)
        LegendKey(stringResource(R.string.home_legend_collected), EtalonColors.green)
    }
}

@Composable
private fun LegendKey(text: String, colour: Color) = Row(verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(LEGEND_DOT).clip(EtalonShapes.pill).background(colour))
    Text(
        text,
        style = EtalonType.labelSm,
        color = EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = EtalonSpace.xs),
    )
}

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
    // §2.3b: this tile follows the month picker too — the loaded row is looked up by the selected
    // month's key, so the card names that month and not always the current one.
    GridCard(stringResource(R.string.home_loaded, shortMonth(d.monthKey, now)), modifier) {
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
    // The web's own branch (`OperationalKPIs.tsx:173`): a month whose row exists but counts
    // nothing says so in words. «0 та буюртма · 0 та балка» would read as a measured zero — the
    // same reason [R.string.home_loaded_none] stands in for a month with no row at all.
    GridCaption(
        if (loaded.orderCount == 0) {
            stringResource(R.string.home_loaded_none)
        } else {
            stringResource(
                R.string.home_loaded_caption,
                formatCountBare(loaded.orderCount),
                formatCountBare(loaded.beamCount),
            )
        },
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

/** «Назоратда» / «Диққат» — the same tag a white card carries a status in, in the green or the red
 *  pair. It is not a status: nothing in the payload says "under control", the count does. */
@Composable
private fun Chip(text: String, bg: Color, fg: Color) = Tag(text = text, fg = fg, bg = bg)

/**
 * «сен» from the server's own `"2026-09"`.
 *
 * The key is the month the whole payload is about, so it is what the loaded card names. When it
 * is absent — a server older than this client's contract sends no `monthKeys`, and the mapper
 * then leaves it empty — the card falls back to the month [now] is in, which is the same month by
 * definition and is the only other thing on this screen that knows what today is. It never
 * guesses a figure: a payload with no month key also has no loaded row, so the card under this
 * label reads «Бу ой юк йўқ».
 *
 * The fallback reads [TASHKENT], never the device's own zone: the business's month is the factory's
 * month, and a phone whose clock is set to another country would otherwise name the previous month
 * for the first hours of a new one — the same rule every other date in this app follows.
 */
internal fun shortMonth(monthKey: String, now: Instant): String =
    UZ_MONTHS_SHORT[(monthOf(monthKey) ?: now.atZone(TASHKENT).monthValue) - 1]

/** «сентябрь» from «2026-09» — the same rule as [shortMonth], in the long form the financial
 *  kicker sets a month name in («МОЛИЯВИЙ ҲОЛАТ · АВГУСТ ОЙИ»). */
internal fun fullMonth(monthKey: String, now: Instant): String =
    UZ_MONTHS_FULL[(monthOf(monthKey) ?: now.atZone(TASHKENT).monthValue) - 1]

/** 1..12 out of a `YYYY-MM` key, or null when there is no month in it to read. */
private fun monthOf(monthKey: String): Int? =
    monthKey.substringAfter('-', "").toIntOrNull()?.takeIf { it in 1..UZ_MONTHS_SHORT.size }

/**
 * The label under a chart column. Unlike [shortMonth] this does NOT fall back to today's month:
 * twelve columns falling back would all read «сен», which is a chart that lies about its own axis.
 * A key it cannot read leaves the column unlabelled instead.
 */
internal fun columnLabel(monthKey: String): String =
    monthOf(monthKey)?.let { UZ_MONTHS_SHORT[it - 1] } ?: ""

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

// ── §2.5–§2.7 the three white cards under the grid ───────────────────────────────────────────

/**
 * The shape §2.5, §2.6 and §2.7 share: a white `xl` card whose header carries a title on the left
 * and, on the right, either a quiet figure or an action.
 *
 * The right-hand slot is a `@Composable` rather than a string because two of the three cards put a
 * label there and the third puts a button: the wording, the colour and the hit target are the
 * caller's, and the frame is this.
 */
@Composable
private fun DashCard(
    title: String,
    modifier: Modifier = Modifier,
    trailing: @Composable () -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(
            title,
            style = EtalonType.sectionTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        trailing()
    }
    Spacer(Modifier.height(EtalonSpace.md))
    content()
}

// ── §2.5 the payment donut ───────────────────────────────────────────────────────────────────

/**
 * How this month's orders stand, as one ring: green for the paid ones, `warning` for the part-paid
 * ones and the `lavenderBg` track for those still awaiting payment.
 *
 * The legend states a **count** and nothing else. The payload carries no per-state sums (owner
 * ruling: hidden, not approximated), and a money column derived from the counts would be a figure
 * nobody sent.
 *
 * The ring is wrapped in a [Box] because [Donut] takes no modifier of its own — its size is its own
 * parameter, and where it sits is the caller's business.
 */
@Composable
internal fun PaymentDonutCard(d: HomeDashboard, modifier: Modifier = Modifier) {
    val total = d.paidOrders + d.partialOrders + d.awaitingOrders
    DashCard(
        title = stringResource(R.string.home_payment_state),
        modifier = modifier,
        trailing = {
            Text(
                stringResource(R.string.home_orders_count, formatCountBare(total)),
                style = EtalonType.labelSm,
                color = EtalonColors.ink3,
                maxLines = 1,
            )
        },
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box {
                Donut(paid = d.paidOrders, partial = d.partialOrders, awaiting = d.awaitingOrders) {
                    DonutCentre(donutPercent(d.paidOrders, total))
                }
            }
            Column(
                Modifier.weight(1f).padding(start = EtalonSpace.lg),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
            ) {
                LegendRow(R.string.home_paid, d.paidOrders, EtalonColors.green)
                LegendRow(R.string.home_partial, d.partialOrders, EtalonColors.warning)
                LegendRow(R.string.home_awaiting, d.awaitingOrders, EtalonColors.lavenderBg)
            }
        }
    }
}

/** «90%» over «тўланган», in the middle of the ring (`PaymentDonut.tsx:76`). */
@Composable
private fun DonutCentre(percent: Int) = Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Text(
        formatPercent(BigDecimal(percent), decimals = 0),
        style = EtalonType.titleSm,
        color = EtalonColors.ink,
        maxLines = 1,
    )
    Text(
        stringResource(R.string.home_paid_pct_caption),
        style = EtalonType.caption,
        color = EtalonColors.ink3,
        maxLines = 1,
    )
}

/** A dot in the arc's own colour, the state's word, and the count right-aligned in the same figures
 *  the rest of the screen is set in. */
@Composable
private fun LegendRow(@StringRes label: Int, count: Int, colour: Color) = Row(
    Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
) {
    Box(Modifier.size(LEGEND_DOT).clip(EtalonShapes.pill).background(colour))
    Text(
        stringResource(label),
        style = EtalonType.labelSm,
        color = EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f).padding(start = EtalonSpace.sm),
    )
    Text(formatCountBare(count), style = EtalonType.rowAmount, color = EtalonColors.ink, maxLines = 1)
}

// ── §2.6 the top clients ─────────────────────────────────────────────────────────────────────

/**
 * The five biggest payers, each with a bar showing what they have paid against the top one's
 * figure — so the card reads as a ranking without the eye having to compare five nine-digit
 * numbers.
 *
 * The ranking and the cut to five are the ViewModel's ([topCustomers]); this draws what it is
 * handed.
 */
@Composable
internal fun TopClientsCard(d: HomeDashboard, modifier: Modifier = Modifier) {
    val rows = d.topCustomers
    // The denominator is the top row's own figure, so the first bar is always full — unless every
    // row is zero, in which case no bar is drawn at all rather than five full ones.
    val top = rows.firstOrNull()?.totalCollected?.amount ?: BigDecimal.ZERO
    DashCard(
        title = stringResource(R.string.home_top_clients),
        modifier = modifier,
        trailing = {
            Text(
                stringResource(R.string.home_top_clients_unit),
                style = EtalonType.labelSm,
                color = EtalonColors.ink3,
                maxLines = 1,
            )
        },
    ) {
        if (rows.isEmpty()) {
            Text(stringResource(R.string.home_top_empty), style = EtalonType.body, color = EtalonColors.ink3)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                rows.forEach { c -> TopClientRow(c, top) }
            }
        }
    }
}

@Composable
private fun TopClientRow(c: TopCustomer, top: BigDecimal) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
    verticalAlignment = Alignment.CenterVertically,
) {
    Avatar(c.name, size = ROW_AVATAR)
    Column(Modifier.weight(1f).padding(horizontal = EtalonSpace.rowGap)) {
        Text(
            c.name,
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(EtalonSpace.xs))
        ShareBar(share(c.totalCollected.amount, top))
        Spacer(Modifier.height(EtalonSpace.xs))
        Text(
            stringResource(R.string.home_orders_count, formatCountBare(c.orderCount)),
            style = EtalonType.caption,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
    }
    MoneyText(c.totalCollected)
}

/**
 * A client's share of the top client's figure, 0..1.
 *
 * `BigDecimal`, not a `Double` ratio of two `Money` amounts: the figures here are nine digits and
 * the division is the only arithmetic this card does. A top of zero means nobody has paid
 * anything, and every bar is then empty rather than every bar being full.
 */
private fun share(value: BigDecimal, top: BigDecimal): Float =
    if (top.signum() <= 0) 0f
    else value.divide(top, SHARE_SCALE, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)

@Composable
private fun ShareBar(fraction: Float) = Box(
    Modifier.fillMaxWidth().height(SHARE_BAR_HEIGHT).clip(EtalonShapes.pill).background(EtalonColors.lavenderBg),
) {
    if (fraction > 0f) {
        Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().clip(EtalonShapes.pill).background(EtalonColors.indigo))
    }
}

// ── §2.6b the province ranking ───────────────────────────────────────────────────────────────

/**
 * Which viloyats the orders come from, ranked by ORDERS PLACED — not by clients and not by cash.
 *
 * All-time whichever month the chart above has picked: the server's aggregation has no time axis,
 * so there is no month-scoped version of this table to show and the sub-line says as much rather
 * than letting the card be read as the selected month's.
 *
 * The rows arrive ranked (unlike §2.6's, which the ViewModel sorts) and are drawn in that order;
 * the bar is each province's share of the top one's order count, so the first bar is always full.
 * The sub-line sits under the title rather than beside it, as it does on the web: at 390 dp it is
 * longer than the half of a header row that would be left for it.
 */
@Composable
internal fun RegionRankingCard(d: HomeDashboard, modifier: Modifier = Modifier) {
    val rows = d.ordersByRegion
    val top = rows.maxOfOrNull { it.orderCount } ?: 0
    DashCard(title = stringResource(R.string.home_regions), modifier = modifier) {
        Text(
            stringResource(R.string.home_regions_sub, formatCountBare(rows.sumOf { it.orderCount })),
            style = EtalonType.labelSm,
            color = EtalonColors.ink3,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(EtalonSpace.md))
        if (rows.isEmpty()) {
            Text(stringResource(R.string.home_regions_empty), style = EtalonType.body, color = EtalonColors.ink3)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                rows.forEach { r -> RegionRow(r, top) }
            }
        }
    }
}

@Composable
private fun RegionRow(r: RegionOrders, top: Int) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f).padding(end = EtalonSpace.rowGap)) {
        Text(
            r.regionUz,
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(EtalonSpace.xs))
        ShareBar(share(BigDecimal(r.orderCount), BigDecimal(top)))
        Spacer(Modifier.height(EtalonSpace.xs))
        Text(
            stringResource(R.string.home_regions_clients, formatCountBare(r.clientCount)),
            style = EtalonType.caption,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
    }
    Column(horizontalAlignment = Alignment.End) {
        Text(
            stringResource(R.string.home_regions_orders, formatCountBare(r.orderCount)),
            style = EtalonType.rowAmount,
            color = EtalonColors.ink,
            maxLines = 1,
        )
        Spacer(Modifier.height(EtalonSpace.xs))
        // Booked, not collected — the same «UZS» suffix the rest of the screen gives a sum.
        Text(
            formatMoney(r.booked),
            style = EtalonType.caption,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
    }
}

// ── §2.7 the latest orders ───────────────────────────────────────────────────────────────────

/**
 * The four newest orders, and the door to the whole list.
 *
 * Only the «№» is a target inside a row — §2.7 makes the order number the link and leaves the rest
 * of the line as text — so it carries [minimumInteractiveComponentSize], which holds D7's 48 dp hit
 * area under a run of 11 sp type. «Барчаси →» does the same.
 *
 * @param showEmpty [HomeUiState.showRecentEmpty] — «Ҳали буюртма йўқ» is a claim about the server
 *   and may only be made once a permitted fetch has settled. While it is false and the list is
 *   empty the card simply draws no rows.
 */
@Composable
internal fun RecentOrdersCard(
    recent: List<RecentOrder>,
    showEmpty: Boolean,
    onOpenOrder: (String) -> Unit,
    onOpenOrdersList: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val all = stringResource(R.string.home_recent_all)
    DashCard(
        title = stringResource(R.string.home_recent),
        modifier = modifier,
        trailing = {
            Text(
                all,
                style = EtalonType.label,
                color = EtalonColors.indigo,
                maxLines = 1,
                modifier = Modifier
                    .clip(EtalonShapes.sm)
                    .clickable(role = Role.Button, onClickLabel = all, onClick = onOpenOrdersList)
                    .minimumInteractiveComponentSize()
                    .padding(start = EtalonSpace.sm),
            )
        },
    ) {
        if (recent.isEmpty()) {
            if (showEmpty) {
                Text(stringResource(R.string.home_recent_empty), style = EtalonType.body, color = EtalonColors.ink3)
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                recent.forEach { o -> RecentOrderRow(o, onOpenOrder) }
            }
        }
    }
}

@Composable
private fun RecentOrderRow(o: RecentOrder, onOpenOrder: (String) -> Unit) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
    verticalAlignment = Alignment.CenterVertically,
) {
    Avatar(o.clientName, size = ROW_AVATAR)
    Column(Modifier.weight(1f).padding(horizontal = EtalonSpace.rowGap)) {
        Text(
            o.clientName,
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            val orderNo = formatOrderNo(o.orderNumber)
            Text(
                orderNo,
                style = EtalonType.meta,
                color = EtalonColors.indigo,
                maxLines = 1,
                modifier = Modifier
                    .clip(EtalonShapes.xs)
                    .clickable(role = Role.Button, onClickLabel = orderNo) { onOpenOrder(o.orderId) }
                    .minimumInteractiveComponentSize(),
            )
            // An address the client does not have is left out entirely: «№ 09‑0003 · 78,7 м² · »
            // reads as a row with something missing rather than a row with nothing to add.
            val rest = listOfNotNull(formatArea(o.totalArea), formatAddressLine(o.clientAddress))
            Text(
                rest.joinToString(SEPARATOR, prefix = SEPARATOR),
                style = EtalonType.meta,
                color = EtalonColors.ink3,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
    Column(horizontalAlignment = Alignment.End) {
        MoneyText(o.totalPrice)
        Spacer(Modifier.height(EtalonSpace.xs))
        PaymentStateTag(o.paymentState)
    }
}

// ── §3 the first-load skeleton ───────────────────────────────────────────────────────────────

/**
 * What the screen shows before its first payload arrives, mirroring `DashboardSkeleton.tsx`'s
 * blocks: the hero, a kicker over the financial rail, another over the operational grid, and the
 * three bottom cards — the same blocks in the same order as the screen they stand in for, so
 * nothing jumps when the figures land. (The web's header block is the app bar here, which is real
 * chrome and is drawn for real.)
 *
 * FIRST load only. A refresh that fails keeps the last payload under the error banner (§3);
 * blanking a screen of real figures back to grey blocks is exactly what that rule forbids.
 *
 * The web's blocks pulse and these do not: an animation that never settles is a screenshot test
 * that never settles, and the screen it covers is on view for well under a second.
 */
@Composable
internal fun DashboardSkeleton(modifier: Modifier = Modifier) = Column(
    modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin),
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
) {
    SkeletonBlock(SKELETON_HERO, EtalonShapes.sheet)
    // A kicker, then the rail: three cards of which the third peeks, as the real rail does.
    SkeletonBlock(SKELETON_KICKER, EtalonShapes.xs, width = SKELETON_KICKER_WIDTH)
    Row(horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
        repeat(RAIL_CARDS) { SkeletonBlock(SKELETON_RAIL, EtalonShapes.xl, width = RAIL_CARD_WIDTH) }
    }
    // §2.3b's chart card, which sits between the rail and the grid.
    SkeletonBlock(SKELETON_CHART, EtalonShapes.xl)
    // A kicker, then the 2×2.
    SkeletonBlock(SKELETON_KICKER, EtalonShapes.xs, width = SKELETON_KICKER_WIDTH)
    repeat(GRID_ROWS) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(GRID_GAP)) {
            repeat(GRID_COLUMNS) { SkeletonBlock(SKELETON_TILE, EtalonShapes.xl, Modifier.weight(1f)) }
        }
    }
    // §2.5–§2.7.
    repeat(BOTTOM_CARDS) { SkeletonBlock(SKELETON_CARD, EtalonShapes.xl) }
}

@Composable
private fun SkeletonBlock(
    height: Dp,
    shape: Shape,
    modifier: Modifier = Modifier,
    width: Dp? = null,
) = Box(
    modifier
        .then(if (width == null) Modifier.fillMaxWidth() else Modifier.width(width))
        .height(height)
        .clip(shape)
        .background(EtalonColors.surfaceBorder),
)
